import { Pool } from 'pg';
import { InfluxDB } from '@influxdata/influxdb-client';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

dotenv.config();

// PostgreSQL (Inventory)
export const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20, // Connection pool limit
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pgPool.on('error', (err) => {
    logger.error('Unexpected error on idle client', { error: err.message });
});

// InfluxDB (Metrics)
const influxUrl = process.env.INFLUX_URL || 'http://influxdb:8086';
const influxToken = process.env.INFLUX_TOKEN;
const influxOrg = process.env.INFLUX_ORG || 'netsentry';
const influxBucket = process.env.INFLUX_BUCKET || 'telemetry';

export const influxClient = new InfluxDB({ url: influxUrl, token: influxToken });
export const writeApi = influxClient.getWriteApi(influxOrg, influxBucket);

// Initialize Tables
export const initDB = async () => {
    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS nodes (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                ip_address INET NOT NULL,
                type VARCHAR(50) DEFAULT 'ACCESS',
                location_lat DECIMAL(9,6),
                location_lng DECIMAL(9,6),
                auth_user VARCHAR(100),
                auth_password TEXT,
                snmp_community VARCHAR(100) DEFAULT 'public',
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        // Simple Admin User Table (In production, use separate migration scripts)
        await client.query(`
             CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
             );
        `);

        await client.query('COMMIT');
        logger.info("PostgreSQL Database Initialized");
    } catch (err: any) {
        await client.query('ROLLBACK');
        logger.error("DB Init Error", { error: err.message });
        process.exit(1); // Fatal error if DB fails
    } finally {
        client.release();
    }
};