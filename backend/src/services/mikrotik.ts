import { RouterOSClient } from 'routeros-client';
import { NodeMetrics } from '../types';
import { logger } from '../utils/logger';

// Persistent connection pool: IP -> Client Instance
const connectionPool = new Map<string, any>();

export class MikroTikService {
    
    /**
     * Retrieves an existing connection or creates a new one.
     * Handles connection errors by removing invalid clients from the pool.
     */
    private static async getClient(ip: string, user: string, pass: string): Promise<any> {
        // Return existing connection if available
        if (connectionPool.has(ip)) {
            const client = connectionPool.get(ip);
            // Optional: Check if client is actually connected/writable if library supports it
            return client;
        }

        // Create new connection
        const client = new RouterOSClient({
            host: ip,
            user: user,
            password: pass,
            keepalive: true, // Enable TCP keepalive to detect dead peers
            timeout: 10000   // 10s timeout
        });

        // Event listeners to clean up pool on failure
        client.on('error', (err: Error) => {
            logger.warn(`MikroTik connection error [${ip}]: ${err.message}`);
            this.cleanup(ip);
        });

        client.on('close', () => {
            logger.debug(`MikroTik connection closed [${ip}]`);
            this.cleanup(ip);
        });

        await client.connect();
        connectionPool.set(ip, client);
        
        return client;
    }

    private static cleanup(ip: string) {
        if (connectionPool.has(ip)) {
            try {
                const client = connectionPool.get(ip);
                client.removeAllListeners();
                client.close();
            } catch (e) { /* ignore */ }
            connectionPool.delete(ip);
        }
    }

    static async fetchMetrics(
        ip: string, 
        user: string, 
        pass: string
    ): Promise<Partial<NodeMetrics>> {
        try {
            const client = await this.getClient(ip, user, pass);

            // 1. System Resource (CPU, Uptime)
            // Using .write() instead of .menu()
            const resourceItems = await client.write('/system/resource/print');
            const resource = Array.isArray(resourceItems) && resourceItems.length > 0 
                ? resourceItems[0] 
                : {};

            // 2. System Health (Voltage, Temp)
            let health: any = {};
            try {
                const healthItems = await client.write('/system/health/print');
                if (Array.isArray(healthItems) && healthItems.length > 0) {
                    health = healthItems[0];
                }
            } catch (err) {
                // Health menu might not exist on virtual routers (CHR) or some models
                logger.debug(`Health data unavailable for ${ip}`);
            }

            return {
                cpuLoad: parseInt(resource['cpu-load'] || '0', 10),
                uptime: resource['uptime'] || 'unknown',
                temperature: parseInt(health['temperature'] || '0', 10),
                voltage: parseFloat(health['voltage'] || '0')
            };

        } catch (error: any) {
            logger.warn(`Failed to poll MikroTik node ${ip}`, { error: error.message });
            // Force cleanup so next poll tries a fresh connection
            this.cleanup(ip);
            return {};
        }
    }
}