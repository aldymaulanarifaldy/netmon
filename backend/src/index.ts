import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { initDB, pgPool } from './config/db';
import { startPoller } from './services/poller';
import { authenticateToken } from './middleware/auth';
import { logger } from './utils/logger';

dotenv.config();

// Security: Fail fast if secrets are missing
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

// Fix: explicit cast for cors middleware to satisfy overload
app.use(cors() as express.RequestHandler);
app.use(express.json());

// Request Logger
app.use((req: Request, res: Response, next: NextFunction) => {
    logger.info(`${req.method} ${req.url}`, { ip: req.ip });
    next();
});

// Login Rate Limiter (Prevent Brute Force)
const loginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	limit: 20, // Limit each IP to 20 login requests per window
	message: 'Too many login attempts from this IP, please try again after 15 minutes',
    standardHeaders: true, 
	legacyHeaders: false,
});

// -- Public Routes --

// Login Route
app.post('/api/login', loginLimiter, async (req: Request, res: Response) => {
    const { username, password } = req.body;
    
    // In production, verify against DB `users` table with bcrypt
    // This example uses a simplified env check for the initial admin
    if (username === 'admin' && password === (process.env.ADMIN_PASSWORD || 'admin')) {
        const token = jwt.sign({ username }, process.env.JWT_SECRET!, { expiresIn: '8h' });
        res.json({ token });
    } else {
        logger.warn('Failed login attempt', { username, ip: req.ip });
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// -- Protected Routes --

app.get('/api/nodes', authenticateToken, async (req: Request, res: Response) => {
    try {
        const result = await pgPool.query('SELECT id, name, ip_address, type, location_lat, location_lng, status, last_seen FROM nodes ORDER BY created_at ASC');
        res.json(result.rows);
    } catch (e: any) { 
        logger.error('Database Error', { error: e.message });
        res.status(500).json({ error: 'Internal Server Error' }); 
    }
});

app.post('/api/nodes', authenticateToken, async (req: Request, res: Response) => {
    const { name, ip_address, type, location_lat, location_lng, auth_user, auth_password } = req.body;
    
    if (!name || !ip_address) {
        res.status(400).json({ error: "Missing required fields" });
        return;
    }

    try {
        const result = await pgPool.query(
            `INSERT INTO nodes (name, ip_address, type, location_lat, location_lng, auth_user, auth_password, status) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'unknown') RETURNING *`,
            [name, ip_address, type, location_lat, location_lng, auth_user, auth_password]
        );
        logger.info('Node created', { name, ip: ip_address });
        res.json(result.rows[0]);
    } catch (e: any) { 
        logger.error('Create Node Error', { error: e.message });
        res.status(500).json({ error: e.message }); 
    }
});

// Start Server
const PORT = process.env.PORT || 3001;

server.listen(PORT, async () => {
    logger.info(`Backend running on port ${PORT}`);
    
    // 1. Initialize DB
    await initDB();
    
    // 2. Start Poller
    startPoller(io);
});

// Socket Auth Middleware
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Authentication error"));
    
    jwt.verify(token, process.env.JWT_SECRET!, (err: any) => {
        if (err) return next(new Error("Authentication error"));
        next();
    });
});
