
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

// 3. Test Connection (Health Check)
app.post('/api/devices/test-connection', async (req: any, res: any) => {
    const {
        ip,
        port,
        username,
        password,
        user,
        pass,
        ssl
    } = req.body;

    // Support both frontend formats
    const finalUser = username || user;
    const finalPass = password || pass;

    if (!ip || !port || !finalUser || !finalPass) {
        return res.status(400).json({
            success: false,
            error: "Missing required parameters (ip, port, user, pass)"
        });
    }

    const start = Date.now();

    try {
        const result = await MikroTikService.testConnection(
            ip,
            parseInt(port),
            finalUser,
            finalPass,
            ssl || false
        );

        const latency = Date.now() - start;

        res.json({
            ...result,
            latency
        });

    } catch (e: any) {

        const latency = Date.now() - start;

        res.status(200).json({
            success: false,
            error: e.message,
            latency
        });
    }
});

// 4. Create Node (Provisioning)
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

// 4.5 Update Node
app.put('/api/nodes/:id', async (req: any, res: any) => {
    const { id } = req.params;
    const { 
        name, ip_address, api_port, api_ssl, type, 
        location_lat, location_lng, auth_user, auth_password, 
        snmp_community, wan_interface, lan_interface 
    } = req.body;

    try {
        // Fetch existing node to preserve password if not provided
        const existingRes = await pgPool.query('SELECT auth_password FROM nodes WHERE id = $1', [id]);
        const existingNode = existingRes.rows[0];
        
        // Use new password if provided and not empty, otherwise keep existing
        const finalPassword = (auth_password && auth_password.trim() !== '') ? auth_password : existingNode?.auth_password;

        const result = await pgPool.query(
            `UPDATE nodes SET 
                name = $1, ip_address = $2, api_port = $3, api_ssl = $4, type = $5, 
                location_lat = $6, location_lng = $7, auth_user = $8, auth_password = $9, 
                snmp_community = $10, wan_interface = $11, lan_interface = $12
             WHERE id = $13 RETURNING *`,
            [name, ip_address, api_port || 8728, api_ssl || false, type, location_lat, location_lng, auth_user, finalPassword, snmp_community, wan_interface, lan_interface, id]
        );
        logger.info(`Updated Node: ${name} (${id})`);
        res.json(result.rows[0]);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// 4.6 Get Node Logs
app.get('/api/nodes/:id/logs', async (req: any, res: any) => {
    const { id } = req.params;
    try {
        // Get node credentials
        const nodeRes = await pgPool.query('SELECT ip_address, api_port, api_ssl, auth_user, auth_password FROM nodes WHERE id = $1', [id]);
        if (nodeRes.rows.length === 0) return res.status(404).json({ error: 'Node not found' });
        
        const node = nodeRes.rows[0];
        if (!node.auth_user || !node.auth_password) {
            return res.json([]); // No credentials, return empty logs
        }

        const logs = await MikroTikService.getLogs(
            node.ip_address,
            node.api_port || 8728,
            node.auth_user,
            node.auth_password,
            node.api_ssl
        );
        res.json(logs);
    } catch (e: any) {
        logger.error(`Log fetch failed for node ${id}`, { error: e.message });
        res.json([]); // Return empty on error to prevent UI crash
    }
});

// 5. Delete Node
app.delete('/api/nodes/:id', async (req: any, res: any) => {
    const { id } = req.params;
    try {
        await pgPool.query('DELETE FROM nodes WHERE id = $1', [id]);
        logger.info(`Deleted Node: ${id}`);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// 6. Get Node History (InfluxDB)
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
