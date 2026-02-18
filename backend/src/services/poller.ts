import { pgPool, writeApi } from '../config/db';
import { MikroTikService } from './mikrotik';
import { Point } from '@influxdata/influxdb-client';
import ping from 'net-ping';
import { logger } from '../utils/logger';

// Ping session with standard timeout
const pingSession = ping.createSession({ 
    retries: 1, 
    timeout: 2000,
    packetSize: 16 
});

// Promisified Ping
const pingHost = (ip: string): Promise<number> => {
    return new Promise((resolve) => {
        const start = Date.now();
        pingSession.pingHost(ip, (error: Error | null) => {
            if (error) {
                resolve(-1); // Offline
            } else {
                resolve(Date.now() - start);
            }
        });
    });
};

let isPolling = false;

export const startPoller = (io: any) => {
    logger.info("Starting Polling Engine (30s interval)...");

    setInterval(async () => {
        if (isPolling) {
            logger.warn("Previous poll cycle still running. Skipping this cycle.");
            return;
        }

        isPolling = true;
        let dbClient;

        try {
            // 1. Get Inventory
            dbClient = await pgPool.connect();
            const res = await dbClient.query('SELECT * FROM nodes');
            const nodes = res.rows;

            // 2. Poll All Nodes Concurrently
            const results = await Promise.allSettled(nodes.map(async (node) => {
                let status = 'OFFLINE';
                let latency = -1;
                let details = {};

                // A. Check Reachability (ICMP)
                latency = await pingHost(node.ip_address);

                if (latency !== -1) {
                    status = 'ONLINE';
                    
                    // B. Fetch detailed stats if Online and Creds exist
                    if (node.auth_user && node.auth_password) {
                        try {
                            details = await MikroTikService.fetchMetrics(
                                node.ip_address, 
                                node.auth_user, 
                                node.auth_password
                            );
                        } catch (e: any) {
                            logger.warn(`MikroTik fetch failed for ${node.name}: ${e.message}`);
                        }
                    }
                }

                return {
                    nodeId: node.id,
                    status,
                    latency: latency === -1 ? 0 : latency,
                    ...details
                };
            }));

            // 3. Process & Broadcast Results
            const processedUpdates: any[] = [];
            const points: Point[] = [];
            const now = new Date();

            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                if (result.status === 'fulfilled') {
                    const data: any = result.value;
                    const node = nodes[i];

                    // Persist Status to Postgres
                    await dbClient.query(
                        `UPDATE nodes 
                         SET status = $1, last_seen = $2 
                         WHERE id = $3`,
                        [data.status, now, node.id]
                    );

                    // Prepare Influx Point
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
            }

            // Batch Write to InfluxDB
            if (points.length > 0) {
                writeApi.writePoints(points);
                await writeApi.flush();
            }

            // Broadcast to Frontend
            io.emit('metrics:update', processedUpdates);

        } catch (error: any) {
             logger.error("Critical Poller Error", { error: error.message, stack: error.stack });
        } finally {
            if (dbClient) dbClient.release();
            isPolling = false;
        }

    }, 30000); // 30 seconds interval
};