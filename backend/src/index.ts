import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { initDB, pgPool, closeConnections } from './config/db';
import { startPoller, stopPoller } from './services/poller';
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

// Middleware
app.use(cors() as any);
app.use(express.json() as any);

// Request Logger
app.use((req: any, res: any, next: NextFunction) => {
    logger.info(`${req.method} ${req.url}`, { ip: req.ip });
    next();
});

// -- Routes --

// Removed login route to disable authentication system

app.get('/api/nodes', async (req: any, res: any) => {
    try {
        const result = await pgPool.query('SELECT id, name, ip_address, type, location_lat, location_lng, status, last_seen, snmp_community FROM nodes ORDER BY created_at ASC');
        res.json(result.rows);
    } catch (e: any) {
        logger.error('DB Error', { error: e.message });
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/nodes', async (req: any, res: any) => {
    const { name, ip_address, type, location_lat, location_lng, auth_user, auth_password, snmp_community } = req.body;
    if (!name || !ip_address) {
        res.status(400).json({ error: "Missing name or ip_address" });
        return;
    }
    try {
        const result = await pgPool.query(
            `INSERT INTO nodes (name, ip_address, type, location_lat, location_lng, auth_user, auth_password, snmp_community, status) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'unknown') RETURNING *`,
            [name, ip_address, type, location_lat, location_lng, auth_user, auth_password, snmp_community]
        );
        logger.info(`Node added: ${name} (${ip_address})`);
        res.json(result.rows[0]);
    } catch (e: any) {
        logger.error('Create Node Error', { error: e.message });
        res.status(500).json({ error: e.message });
    }
});

// Socket.io - Authentication removed for simplicity
io.on('connection', (socket) => {
    logger.info('New socket client connected', { id: socket.id });
});

// Graceful Shutdown
const shutdown = async () => {
    logger.info('Shutting down...');
    stopPoller();
    await closeConnections();
    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

const PORT = process.env.PORT || 3001;

// Startup Sequence
const startServer = async () => {
    await initDB(); // Wait for DB
    server.listen(PORT, "0.0.0.0", () => {
        logger.info(`Backend running on port ${PORT}`);
        startPoller(io);
    });
};

startServer();