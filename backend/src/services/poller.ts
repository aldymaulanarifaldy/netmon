import { pgPool, writeApi } from '../config/db';
import { MikroTikService } from './mikrotik';
import { Point } from '@influxdata/influxdb-client';
import ping from 'net-ping';
import { logger } from '../utils/logger';

// Ping session with non-root privileges (requires setcap or net.ipv4.ping_group_range)
const pingSession = ping.createSession({ 
    retries: 1, 
    timeout: 2000,
    packetSize: 16 
});

const pingHost = (ip: string): Promise<number> => {
    return new Promise((resolve) => {
        const start = Date.now();
        pingSession.pingHost(ip, (error: Error | null) => {
            if (error) resolve(-1); 
            else resolve(Date.now() - start);
        });
    });
};

export const startPoller = (io: any) => {
    logger.info("Starting Polling Engine...");

    setInterval(async () => {
        let client;
        try {
            // 1. Get Inventory
            client = await pgPool.connect();
            const res = await client.query('SELECT * FROM nodes');
            const nodes = res.rows;
            client.release();

            // 2. Poll All Nodes Concurrently
            const results = await Promise.allSettled(nodes.map(async (node) => {
                
                // A. Check Latency/Availability
                const latency = await pingHost(node.ip_address);
                if (latency === -1) {
                    return { nodeId: node.id, status: 'OFFLINE', latency: 0 };
                }

                // B. Fetch detailed stats if Online and Creds exist
                let details = {};
                if (node.auth_user && node.auth_password) {
                    try {
                        details = await MikroTikService.fetchMetrics(node.ip_address, node.auth_user, node.auth_password);
                    } catch (e) {
                        // Logged in service
                    }
                }

                return {
                    nodeId: node.id,
                    status: 'ONLINE',
                    latency,
                    ...details
                };
            }));

            // 3. Process & Broadcast Results
            const processedUpdates: any[] = [];
            
            // Batch Influx writes
            const points: Point[] = [];

            results.forEach((res, index) => {
                if (res.status === 'fulfilled') {
                    const data: any = res.value;
                    const node = nodes[index];

                    const point = new Point('device_metrics')
                        .tag('node_name', node.name)
                        .tag('node_id', node.id)
                        .floatField('latency', data.latency)
                        .stringField('status', data.status);

                    if (data.cpuLoad !== undefined) point.intField('cpu_load', data.cpuLoad);
                    if (data.voltage !== undefined) point.floatField('voltage', data.voltage);
                    if (data.temperature !== undefined) point.intField('temperature', data.temperature);
                    
                    points.push(point);

                    processedUpdates.push({
                        id: node.id,
                        ...data
                    });
                }
            });

            if (points.length > 0) {
                writeApi.writePoints(points);
                await writeApi.flush();
            }

            // Broadcast
            io.emit('metrics:update', processedUpdates);

        } catch (error: any) {
             logger.error("Critical Poller Error", { error: error.message, stack: error.stack });
             if (client) (client as any).release();
        }

    }, 10000); // Increased to 10s for production stability
};