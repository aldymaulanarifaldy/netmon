
import { RouterOSClient } from 'routeros-client';
import { NodeMetrics } from '../types';
import { logger } from '../utils/logger';

interface RouterOSClientInstance {
    connect(): Promise<void>;
    close(): void;
    menu(path: string): {
        get(criteria?: any): Promise<any[]>;
        monitor(items: string | string[], options?: any): Promise<any[]>;
    };
    on(event: string, handler: (err?: any) => void): void;
    removeAllListeners(): void;
}

// Connection pool Key: "IP:PORT"
const connectionPool = new Map<string, RouterOSClientInstance>();

export class MikroTikService {
    
    private static getPoolKey(ip: string, port: number): string {
        return `${ip}:${port}`;
    }

    private static async getClient(ip: string, port: number, user: string, pass: string, ssl: boolean): Promise<RouterOSClientInstance> {
        const key = this.getPoolKey(ip, port);
        
        if (connectionPool.has(key)) {
            return connectionPool.get(key)!;
        }

        const client = new RouterOSClient({
            host: ip,
            port: port,
            user: user,
            password: pass,
            tls: ssl ? { rejectUnauthorized: false } : undefined,
            keepalive: true,
            timeout: 10 // seconds
        }) as unknown as RouterOSClientInstance;

        const cleanup = () => {
            if (connectionPool.get(key) === client) {
                connectionPool.delete(key);
                try {
                    client.removeAllListeners();
                    client.close();
                } catch (e) { /* ignore */ }
                logger.debug(`Cleaned up MikroTik connection for ${key}`);
            }
        };

        client.on('error', (err: any) => {
            logger.warn(`MikroTik connection error [${key}]: ${err.message}`);
            cleanup();
        });

        client.on('close', () => {
            cleanup();
        });

        // 5s timeout for connection attempt
        const connectPromise = client.connect();
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Connection timeout')), 5000)
        );

        await Promise.race([connectPromise, timeoutPromise]);
        
        connectionPool.set(key, client);
        return client;
    }

    /**
     * Discovery Method: Get all interfaces to populate dropdowns
     */
    static async getInterfaces(ip: string, port: number, user: string, pass: string, ssl: boolean): Promise<any[]> {
        // We create a temporary client for discovery to avoid polluting the pool with potentially bad configs
        // or we reuse the pool logic but ensure we close if it's a one-off. 
        // For production efficiency, we'll use the pool.
        try {
            const client = await this.getClient(ip, port, user, pass, ssl);
            const interfaces = await client.menu('/interface').get();
            return interfaces.map((iface: any) => ({
                name: iface.name,
                type: iface.type,
                running: iface.running === 'true' || iface.running === true,
                disabled: iface.disabled === 'true' || iface.disabled === true,
                comment: iface.comment
            }));
        } catch (error) {
            throw error;
        }
    }

    static async fetchMetrics(ip: string, port: number, user: string, pass: string, ssl: boolean, wanInterface?: string): Promise<Partial<NodeMetrics>> {
        let client: RouterOSClientInstance | null = null;
        try {
            client = await this.getClient(ip, port, user, pass, ssl);
            
            // 1. Parallel Fetch: Resources and Health
            const [resourceRes, healthRes] = await Promise.all([
                client.menu('/system/resource').get(),
                client.menu('/system/health').get(),
            ]);

            const res = resourceRes[0] || {};
            const health = healthRes[0] || {};

            // 2. Real-time Traffic Monitor (Snapshot)
            let rxMbps = 0;
            let txMbps = 0;
            
            // PRODUCTION RULE: Only monitor if WAN interface is explicitly defined.
            if (wanInterface) {
                try {
                    // Monitor traffic for 1 second (snapshot)
                    const trafficStats = await client.menu('/interface').monitor(wanInterface, { 
                        once: true,
                        'aggregating-interval': 1 
                    });
                    
                    if (trafficStats && trafficStats.length > 0) {
                        const t = trafficStats[0];
                        const rxBps = parseInt(t['rx-bits-per-second'] || '0', 10);
                        const txBps = parseInt(t['tx-bits-per-second'] || '0', 10);
                        
                        rxMbps = parseFloat((rxBps / 1_000_000).toFixed(2));
                        txMbps = parseFloat((txBps / 1_000_000).toFixed(2));
                    }
                } catch (err) {
                    // Do not crash, just log warning that specific metric failed
                    logger.warn(`Traffic monitor failed on configured interface ${wanInterface} for ${ip}`, { error: err });
                }
            }

            // 3. Memory Calculation
            const totalMem = parseInt(res['total-memory'] || '0', 10);
            const freeMem = parseInt(res['free-memory'] || '0', 10);
            const memUsage = totalMem > 0 ? Math.round(((totalMem - freeMem) / totalMem) * 100) : 0;

            // 4. Active Peers (PPP)
            let activePeers = 0;
            try {
                const pppActive = await client.menu('/ppp/active').get();
                activePeers = pppActive ? pppActive.length : 0;
            } catch (e) { /* ignore */ }

            return {
                cpuLoad: parseInt(res['cpu-load'] || '0', 10),
                memoryUsage: memUsage,
                uptime: res['uptime'] || '',
                temperature: parseInt(health['temperature'] || '0', 10),
                voltage: parseFloat(health['voltage'] || '0'),
                txRate: txMbps,
                rxRate: rxMbps,
                activePeers: activePeers,
                wanInterface: wanInterface
            };

        } catch (error: any) {
            // Force cleanup on logic errors to avoid stale sockets in pool
            const key = this.getPoolKey(ip, port);
            if (connectionPool.has(key)) {
                const c = connectionPool.get(key)!;
                try { c.close(); } catch(e){}
                connectionPool.delete(key);
            }
            throw error;
        }
    }
    
    static closeAll() {
        for (const [key, client] of connectionPool.entries()) {
            try { client.close(); } catch (e) { /* ignore */ }
        }
        connectionPool.clear();
    }
}
