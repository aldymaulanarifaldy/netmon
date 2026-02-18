import { RouterOSClient } from 'routeros-client';
import { NodeMetrics } from '../types';
import { logger } from '../utils/logger';

export class MikroTikService {
    
    static async fetchMetrics(
        ip: string, 
        user: string, 
        pass: string
    ): Promise<Partial<NodeMetrics>> {
        const client = new RouterOSClient({
            host: ip,
            user: user,
            password: pass,
            keepalive: false,
            timeout: 5000 // Strict 5s timeout
        });

        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Connection Timeout')), 4500)
        );

        try {
            // Race connection against timeout
            await Promise.race([client.connect(), timeoutPromise]);

            // 1. System Resources
            const [resource] = await client.menu('/system/resource').get();
            
            // 2. Health (Voltage/Temp)
            let voltage = 0;
            let temperature = 0;
            try {
                const healthItems = await client.menu('/system/health').get();
                if (healthItems && healthItems.length > 0) {
                     const h = healthItems[0];
                     voltage = parseFloat(h.voltage || '0');
                     temperature = parseFloat(h.temperature || '0');
                }
            } catch (e) { /* Ignore health error */ }

            // 3. Active Peers
            let activePeers = 0;
            try {
                const active = await client.menu('/ip/hotspot/active').get();
                activePeers = active.length;
            } catch (e) {}

            // Cleanup
            await client.close();

            return {
                cpuLoad: parseInt(resource['cpu-load'] || '0'),
                memoryUsage: Math.floor((parseInt(resource['free-memory'] || '0') / parseInt(resource['total-memory'] || '1')) * 100),
                uptime: resource['uptime'],
                voltage,
                temperature,
                activePeers,
                txRate: 0, // Requires traffic monitor implementation
                rxRate: 0 
            };

        } catch (error: any) {
            // Ensure client is destroyed on error to prevent leaks
            try { client.close(); } catch(e) {} 
            
            logger.warn(`Failed to poll MikroTik node`, { ip, error: error.message });
            throw error;
        }
    }
}