import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { initDB, pgPool, closeConnections } from './config/db';
import { startPoller, stopPoller } from './services/poller';
import { authenticateToken } from './middleware/auth';
import { logger } from './utils/logger';

dotenv.config();

// Fail fast if critical config is missing
if (!process.env.JWT_SECRET) {
    logger.error("FATAL: JWT_SECRET environment variable is not set.");
    process.exit(1);
}

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

// Login Rate Limiter
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    message: 'Too many login attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

// -- Routes --

app.post('/api/login', loginLimiter as any, async (req: any, res: any) => {
    const { username, password } = req.body;
    // Simple admin check for MVP, replace with DB lookup in full production
    if (username === 'admin' && password === (process.env.ADMIN_PASSWORD || 'admin')) {
        const token = jwt.sign({ username }, process.env.JWT_SECRET!, { expiresIn: '8h' });
        res.json({ token });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

app.get('/api/nodes', authenticateToken, async (req: any, res: any) => {
    try {
        const result = await pgPool.query('SELECT id, name, ip_address, type, location_lat, location_lng, status, last_seen, snmp_community FROM nodes ORDER BY created_at ASC');
        res.json(result.rows);
    } catch (e: any) {
        logger.error('DB Error', { error: e.message });
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/nodes', authenticateToken, async (req: any, res: any) => {
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

// Socket.io Authentication
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Authentication error"));
    jwt.verify(token, process.env.JWT_SECRET!, (err: any) => {
        if (err) return next(new Error("Authentication error"));
        next();
    });
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
    server.listen(PORT, () => {
        logger.info(`Backend running on port ${PORT}`);
        startPoller(io);
    });
};

startServer();