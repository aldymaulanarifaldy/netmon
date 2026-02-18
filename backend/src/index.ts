import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { initDB, pgPool } from './config/db';
import { startPoller } from './services/poller';
import { authenticateToken } from './middleware/auth';
import { logger } from './utils/logger';

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
app.use(express.json());

// Request Logger
app.use((req: Request, res: Response, next: NextFunction) => {
    logger.info(`${req.method} ${req.url}`, { ip: (req as any).ip });
    next();
});

// -- Public Routes --

// Login Route
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    // In production, verify against DB `users` table with bcrypt
    // For MVP/Demo, we use ENV variables
    if (username === 'admin' && password === (process.env.ADMIN_PASSWORD || 'admin')) {
        const token = jwt.sign({ username }, process.env.JWT_SECRET || 'dev_secret_do_not_use_in_prod', { expiresIn: '8h' });
        res.json({ token });
    } else {
        logger.warn('Failed login attempt', { username, ip: (req as any).ip });
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// -- Protected Routes --

app.get('/api/nodes', authenticateToken, async (req, res) => {
    try {
        const result = await pgPool.query('SELECT id, name, ip_address, type, location_lat, location_lng, status FROM nodes ORDER BY created_at ASC');
        res.json(result.rows);
    } catch (e: any) { 
        logger.error('Database Error', { error: e.message });
        res.status(500).json({ error: 'Internal Server Error' }); 
    }
});

app.post('/api/nodes', authenticateToken, async (req, res) => {
    const { name, ip_address, type, location_lat, location_lng, auth_user, auth_password } = req.body;
    
    // Basic validation
    if (!name || !ip_address) return res.status(400).json({ error: "Missing required fields" });

    try {
        const result = await pgPool.query(
            `INSERT INTO nodes (name, ip_address, type, location_lat, location_lng, auth_user, auth_password) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [name, ip_address, type, location_lat, location_lng, auth_user, auth_password]
        );
        logger.info('Node created', { name, ip: ip_address, user: (req as any).user.username });
        res.json(result.rows[0]);
    } catch (e: any) { 
        logger.error('Create Node Error', { error: e.message });
        res.status(500).json({ error: e.message }); 
    }
});

// Start
const PORT = process.env.PORT || 3001;

server.listen(PORT, async () => {
    logger.info(`Backend running on port ${PORT}`);
    await initDB();
    startPoller(io);
});

// Socket Auth Middleware
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Authentication error"));
    
    jwt.verify(token, process.env.JWT_SECRET || 'dev_secret_do_not_use_in_prod', (err: any) => {
        if (err) return next(new Error("Authentication error"));
        next();
    });
});
