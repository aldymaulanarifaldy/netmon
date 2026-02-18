
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { initDB, pgPool, closeConnections, influxClient } from './config/db';
import { startPoller, stopPoller } from './services/poller';
import { MikroTikService } from './services/mikrotik';
import { logger } from './utils/logger';
import process from 'process';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors() as any);
app.use(express.json() as any);

// -- API Routes --

// 1. Get All Nodes (Inventory)
app.get('/api/nodes', async (req: any, res: any) => {
    try {
        const result = await pgPool.query(
            'SELECT id, name, ip_address, api_port, api_ssl, type, location_lat, location_lng, status, wan_interface, lan_interface, last_seen, snmp_community FROM nodes ORDER BY name ASC'
        );
        res.json(result.rows);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// 2. Detect Interfaces (Discovery)
app.post('/api/devices/detect-interfaces', async (req: any, res: any) => {
    const { ip, port, username, password, ssl } = req.body;
    
    if (!ip || !username) {
        return res.status(400).json({ error: "Missing required connection parameters" });
    }

    try {
        const interfaces = await MikroTikService.getInterfaces(
            ip, 
            parseInt(port) || 8728, 
            username, 
            password, 
            ssl || false
        );
        res.json(interfaces);
    } catch (e: any) {
        logger.error(`Interface detection failed for ${ip}`, { error: e.message });
        res.status(502).json({ error: `Connection failed: ${e.message}` });
    }
});

// 3. Create Node (Provisioning)
app.post('/api/nodes', async (req: any, res: any) => {
    const { 
        name, ip_address, api_port, api_ssl, type, 
        location_lat, location_lng, auth_user, auth_password, 
        snmp_community, wan_interface, lan_interface 
    } = req.body;

    try {
        const result = await pgPool.query(
            `INSERT INTO nodes (name, ip_address, api_port, api_ssl, type, location_lat, location_lng, auth_user, auth_password, snmp_community, wan_interface, lan_interface, status) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'unknown') RETURNING *`,
            [name, ip_address, api_port || 8728, api_ssl || false, type, location_lat, location_lng, auth_user, auth_password, snmp_community, wan_interface, lan_interface]
        );
        logger.info(`Provisioned Node: ${name} (${ip_address})`);
        res.json(result.rows[0]);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// 4. Get Node History (InfluxDB)
app.get('/api/nodes/:id/history', async (req: any, res: any) => {
    const { id } = req.params;
    const range = req.query.range || '1h'; // 1h, 6h, 12h, 24h
    
    // Convert generic range to flux duration
    let start = '-1h';
    let window = '1m';
    if (range === '6h') { start = '-6h'; window = '5m'; }
    if (range === '24h') { start = '-24h'; window = '15m'; }

    const queryApi = influxClient.getQueryApi(process.env.INFLUX_ORG || 'netsentry');
    const fluxQuery = `
        from(bucket: "${process.env.INFLUX_BUCKET || 'telemetry'}")
        |> range(start: ${start})
        |> filter(fn: (r) => r["node_id"] == "${id}")
        |> filter(fn: (r) => r["_field"] == "latency" or r["_field"] == "cpu" or r["_field"] == "tx_rate" or r["_field"] == "rx_rate")
        |> aggregateWindow(every: ${window}, fn: mean, createEmpty: false)
        |> yield(name: "mean")
    `;

    try {
        const data: any[] = [];
        await queryApi.queryRows(fluxQuery, {
            next(row, tableMeta) {
                const o = tableMeta.toObject(row);
                data.push({
                    time: o._time,
                    field: o._field,
                    value: o._value
                });
            },
            error(error) {
                logger.error('Influx Query Error', error);
                res.status(500).json({ error: 'History Fetch Failed' });
            },
            complete() {
                // Pivot data for frontend
                res.json(data);
            },
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// -- Socket.io Room Logic --

io.on('connection', (socket) => {
    logger.info('Client Connected', { id: socket.id });

    // Auto-join dashboard room for map updates
    socket.join('dashboard');

    // Subscribe to detailed node stats
    socket.on('subscribe_node', (nodeId: string) => {
        logger.debug(`Socket ${socket.id} subscribed to node:${nodeId}`);
        socket.join(`node:${nodeId}`);
    });

    socket.on('unsubscribe_node', (nodeId: string) => {
        logger.debug(`Socket ${socket.id} unsubscribed from node:${nodeId}`);
        socket.leave(`node:${nodeId}`);
    });

    socket.on('disconnect', () => {
        // cleanup handled by socket.io automatically leaving rooms
    });
});

// -- Lifecycle --

const shutdown = async () => {
    stopPoller();
    await closeConnections();
    server.close(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

const PORT = Number(process.env.PORT) || 3001;

const startServer = async () => {
    await initDB();
    server.listen(PORT, "0.0.0.0", () => {
        logger.info(`ISP Backend running on port ${PORT}`);
        startPoller(io);
    });
};

startServer();
