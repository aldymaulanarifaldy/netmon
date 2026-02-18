
import { RouterOSClient } from 'routeros-client';
import { NodeMetrics } from '../types';
import { logger } from '../utils/logger';

// Enhanced type definition to match routeros-client's menu API
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

    /**
     * Fetch real-time metrics including traffic, resources, and health.
     */
    static async fetchMetrics(ip: string, user: string, pass: string): Promise<Partial<NodeMetrics>> {
        let client: RouterOSClientInstance | null = null;
        try {
            client = await this.getClient(ip, user, pass);
            
            // 1. Fetch System Resources, Health, and Default Route in parallel
            const [resourceRes, healthRes, routeRes] = await Promise.all([
                client.menu('/system/resource').get(),
                client.menu('/system/health').get(),
                client.menu('/ip/route').get({ 'dst-address': '0.0.0.0/0', 'active': 'true' })
            ]);

            const res = resourceRes[0] || {};
            const health = healthRes[0] || {};

            // 2. Auto-Detect WAN Interface from Default Route
            let wanInterface = 'ether1'; // Fallback
            if (routeRes && routeRes.length > 0) {
                const route = routeRes[0];
                // Try to parse interface from gateway-status (e.g. "1.1.1.1 reachable on pppoe-out1")
                if (route['gateway-status']) {
                    const parts = route['gateway-status'].split(' reachable on ');
                    if (parts.length > 1) {
                        wanInterface = parts[1].trim();
                    }
                } 
                // Sometimes gateway is directly the interface name
                else if (route.gateway && !route.gateway.match(/^\d+\.\d+\.\d+\.\d+$/)) {
                    wanInterface = route.gateway;
                }
            }

            // 3. Real-time Traffic Monitor (Snapshot)
            let rxMbps = 0;
            let txMbps = 0;
            
            try {
                const trafficStats = await client.menu('/interface').monitor(wanInterface, { 
                    once: true,
                    'aggregating-interval': 1 
                });
                
                if (trafficStats && trafficStats.length > 0) {
                    const t = trafficStats[0];
                    const rxBps = parseInt(t['rx-bits-per-second'] || '0', 10);
                    const txBps = parseInt(t['tx-bits-per-second'] || '0', 10);
                    
                    // Convert to Mbps with 2 decimal precision
                    rxMbps = parseFloat((rxBps / 1_000_000).toFixed(2));
                    txMbps = parseFloat((txBps / 1_000_000).toFixed(2));
                }
            } catch (err) {
                logger.warn(`Traffic monitor failed on ${wanInterface} for ${ip}`, { error: err });
            }

            // 4. Calculate Memory Usage %
            const totalMem = parseInt(res['total-memory'] || '0', 10);
            const freeMem = parseInt(res['free-memory'] || '0', 10);
            const memUsage = totalMem > 0 ? Math.round(((totalMem - freeMem) / totalMem) * 100) : 0;

            // 5. Active Peers (Optional: PPP/Hotspot count)
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
                // Latency and PacketLoss are typically measured by the poller (ICMP), not the device itself
                packetLoss: 0, 
                latency: 0 
            };

        } catch (error: any) {
            // If we fail to fetch, assume connection might be bad/stale, remove from pool
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
