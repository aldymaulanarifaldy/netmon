import { RouterOSClient } from 'routeros-client';
import { NodeMetrics } from '../types';
import { logger } from '../utils/logger';

// Type definition to bridge the lack of strict types in the library
interface RouterOSClientInstance {
    connect(): Promise<void>;
    close(): void;
    write(path: string): Promise<any[]>;
    on(event: string, handler: (err?: any) => void): void;
    removeAllListeners(): void;
}

// Global connection pool
const connectionPool = new Map<string, RouterOSClientInstance>();

export class MikroTikService {
    
    /**
     * Get an active connection from the pool or create a new one.
     */
    private static async getClient(ip: string, user: string, pass: string): Promise<RouterOSClientInstance> {
        if (connectionPool.has(ip)) {
            return connectionPool.get(ip)!;
        }

        const client = new RouterOSClient({
            host: ip,
            user: user,
            password: pass,
            keepalive: true,
            timeout: 10 // seconds
        }) as unknown as RouterOSClientInstance;

        // Cleanup logic
        const cleanup = () => {
            if (connectionPool.get(ip) === client) {
                connectionPool.delete(ip);
                try {
                    client.removeAllListeners();
                    client.close();
                } catch (e) { /* ignore close errors */ }
                logger.debug(`Cleaned up MikroTik connection for ${ip}`);
            }
        };

        client.on('error', (err: any) => {
            logger.warn(`MikroTik connection error [${ip}]: ${err.message}`);
            cleanup();
        });

        client.on('close', () => {
            cleanup();
        });

        await client.connect();
        connectionPool.set(ip, client);
        return client;
    }

    static async fetchMetrics(ip: string, user: string, pass: string): Promise<Partial<NodeMetrics>> {
        try {
            const client = await this.getClient(ip, user, pass);
            
            // Parallel fetch for resource and health
            const [resourceRes, healthRes] = await Promise.allSettled([
                client.write('/system/resource/print'),
                client.write('/system/health/print')
            ]);

            const resource = resourceRes.status === 'fulfilled' && resourceRes.value[0] ? resourceRes.value[0] : {};
            const health = healthRes.status === 'fulfilled' && healthRes.value[0] ? healthRes.value[0] : {};

            return {
                cpuLoad: parseInt(resource['cpu-load'] || '0', 10),
                uptime: resource['uptime'] || '',
                temperature: parseInt(health['temperature'] || '0', 10),
                voltage: parseFloat(health['voltage'] || '0')
            };
        } catch (error: any) {
            // If we fail to fetch, assume connection might be bad, remove from pool
            if (connectionPool.has(ip)) {
                const client = connectionPool.get(ip)!;
                try { client.close(); } catch(e){}
                connectionPool.delete(ip);
            }
            throw error;
        }
    }
    
    static closeAll() {
        for (const [ip, client] of connectionPool.entries()) {
            try {
                client.close();
            } catch (e) { /* ignore */ }
        }
        connectionPool.clear();
    }
}