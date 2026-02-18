import { pgPool, writeApi } from '../config/db';
import { MikroTikService } from './mikrotik';
import { Point } from '@influxdata/influxdb-client';
import ping from 'net-ping';
import { logger } from '../utils/logger';
import { NetworkNode } from '../types';

// Ping session with timeout and retries
const pingSession = ping.createSession({
    retries: 1,
    timeout: 2000,
    packetSize: 16
});

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
let pollInterval: ReturnType<typeof setInterval> | null = null;

export const stopPoller = () => {
    if (pollInterval) clearInterval(pollInterval);
    MikroTikService.closeAll();
};

export const startPoller = (io: any) => {
    logger.info("Starting Polling Engine (30s interval)...");

    pollInterval = setInterval(async () => {
        if (isPolling) {
            logger.warn("Previous poll cycle still running. Skipping this cycle.");
            return;
        }

        isPolling = true;
        let dbClient;

        try {
            dbClient = await pgPool.connect();
            const res = await dbClient.query('SELECT * FROM nodes');
            const nodes: NetworkNode[] = res.rows;

            if (nodes.length === 0) {
                isPolling = false;
                dbClient.release();
                return;
            }

            const points: Point[] = [];
            const updates: any[] = [];
            const now = new Date();

            // Execute all polls in parallel but handle results safely
            const results = await Promise.allSettled(nodes.map(async (node) => {
                let status = 'OFFLINE';
                let latency = -1;
                let metrics: any = {};

                // 1. Check reachability via ICMP
                latency = await pingHost(node.ip_address);

                // 2. If reachable and credentials exist, fetch details
                if (latency !== -1) {
                    status = 'ONLINE';
                    if (node.auth_user && node.auth_password) {
                        try {
                            metrics = await MikroTikService.fetchMetrics(
                                node.ip_address,
                                node.auth_user,
                                node.auth_password
                            );
                        } catch (err: any) {
                            logger.debug(`MikroTik fetch failed for ${node.ip_address}: ${err.message}`);
                            // Keep status ONLINE but missing metrics
                        }
                    }
                }

                return {
                    node,
                    status,
                    latency: latency === -1 ? 0 : latency,
                    metrics
                };
            }));

            // 3. Process results sequentially for DB writes to avoid locks
            for (const result of results) {
                if (result.status === 'fulfilled') {
                    const { node, status, latency, metrics } = result.value;

                    // Update Status in Postgres
                    await dbClient.query(
                        `UPDATE nodes SET status = $1, last_seen = $2 WHERE id = $3`,
                        [status, now, node.id]
                    );

                    // Prepare InfluxDB Point
                    const point = new Point('device_metrics')
                        .tag('node_name', node.name)
                        .tag('node_id', node.id)
                        .floatField('latency', latency)
                        .stringField('status', status);

                    if (metrics.cpuLoad !== undefined) point.intField('cpu_load', metrics.cpuLoad);
                    if (metrics.voltage !== undefined) point.floatField('voltage', metrics.voltage);
                    if (metrics.temperature !== undefined) point.intField('temperature', metrics.temperature);

                    points.push(point);

                    updates.push({
                        id: node.id,
                        status,
                        latency,
                        ...metrics
                    });
                }
            }

            // 4. Batch Write to Influx
            if (points.length > 0) {
                writeApi.writePoints(points);
                await writeApi.flush();
            }

            // 5. Broadcast via Socket.io
            io.emit('metrics:update', updates);

        } catch (err: any) {
            logger.error("Poller Cycle Error", { error: err.message });
        } finally {
            if (dbClient) dbClient.release();
            isPolling = false;
        }
    }, 30000);
};