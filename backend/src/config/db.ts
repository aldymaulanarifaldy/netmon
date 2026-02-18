
import { Pool } from 'pg';
import { InfluxDB } from '@influxdata/influxdb-client';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';
import process from 'process';

dotenv.config();

const RECONNECT_INTERVAL = 5000;
const MAX_RETRIES = 10;

// PostgreSQL Connection Pool
export const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

pgPool.on('error', (err) => {
    logger.error('Unexpected error on idle PostgreSQL client', { error: err.message });
});

// InfluxDB Connection
const influxUrl = process.env.INFLUX_URL || 'http://influxdb:8086';
const influxToken = process.env.INFLUX_TOKEN || '';
const influxOrg = process.env.INFLUX_ORG || 'netsentry';
const influxBucket = process.env.INFLUX_BUCKET || 'telemetry';

export const influxClient = new InfluxDB({ url: influxUrl, token: influxToken });
export const writeApi = influxClient.getWriteApi(influxOrg, influxBucket);

// Helper to wait for DB to be ready
const waitForDb = async (retries = 0): Promise<boolean> => {
    try {
        const client = await pgPool.connect();
        client.release();
        return true;
    } catch (err: any) {
        if (retries >= MAX_RETRIES) {
            logger.error(`Failed to connect to DB after ${MAX_RETRIES} attempts`, { error: err.message });
            return false;
        }
        logger.warn(`Database not ready, retrying in ${RECONNECT_INTERVAL / 1000}s... (${retries + 1}/${MAX_RETRIES})`);
        await new Promise(res => setTimeout(res, RECONNECT_INTERVAL));
        return waitForDb(retries + 1);
    }
};

// Initialize Tables and Migrations
export const initDB = async () => {
    const connected = await waitForDb();
    if (!connected) {
        process.exit(1);
    }

    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');

        // Nodes Table with Extended Network Props
        await client.query(`
            CREATE TABLE IF NOT EXISTS nodes (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                ip_address INET NOT NULL,
                api_port INTEGER DEFAULT 8728,
                api_ssl BOOLEAN DEFAULT FALSE,
                type VARCHAR(50) DEFAULT 'ACCESS',
                location_lat DECIMAL(9,6),
                location_lng DECIMAL(9,6),
                auth_user VARCHAR(100),
                auth_password TEXT,
                snmp_community VARCHAR(100) DEFAULT 'public',
                status VARCHAR(20) DEFAULT 'unknown',
                wan_interface VARCHAR(100),
                lan_interface VARCHAR(100),
                last_seen TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        // Alerts Table for Incident Management
        await client.query(`
            CREATE TABLE IF NOT EXISTS alerts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                node_id UUID REFERENCES nodes(id) ON DELETE CASCADE,
                type VARCHAR(50) NOT NULL, -- CPU, OFFLINE, TEMP, TRAFFIC
                message TEXT NOT NULL,
                severity VARCHAR(20) DEFAULT 'WARNING',
                active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW(),
                resolved_at TIMESTAMP
            );
        `);

        // Safe Schema Migrations
        await client.query(`ALTER TABLE nodes ADD COLUMN IF NOT EXISTS api_port INTEGER DEFAULT 8728`);
        await client.query(`ALTER TABLE nodes ADD COLUMN IF NOT EXISTS api_ssl BOOLEAN DEFAULT FALSE`);
        await client.query(`ALTER TABLE nodes ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'unknown'`);
        await client.query(`ALTER TABLE nodes ADD COLUMN IF NOT EXISTS wan_interface VARCHAR(100)`);
        await client.query(`ALTER TABLE nodes ADD COLUMN IF NOT EXISTS lan_interface VARCHAR(100)`);

        await client.query('COMMIT');
        logger.info("Database initialized successfully");
    } catch (err: any) {
        await client.query('ROLLBACK');
        logger.error("DB Initialization Error", { error: err.message });
        process.exit(1);
    } finally {
        client.release();
    }
};

export const closeConnections = async () => {
    await pgPool.end();
    try {
        await writeApi.close();
    } catch (e) { /* ignore */ }
    logger.info("Database connections closed");
};
