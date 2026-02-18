import { pgPool, writeApi } from '../config/db';
import { MikroTikService } from './mikrotik';
import { AlertService } from './alertService';
import { Point } from '@influxdata/influxdb-client';
import ping from 'net-ping';
import { logger } from '../utils/logger';
import { NetworkNode } from '../types';

// Ping session configuration
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

// Chunk array for concurrency limiting
const chunkArray = <T>(arr: T[], size: number): T[][] => {
    return Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
        arr.slice(i * size, i * size + size)
    );
};

export const stopPoller = () => {
    if (pollInterval) clearInterval(pollInterval);
    MikroTikService.closeAll();
};

export const startPoller = (io: any) => {
    logger.info("Starting ISP Polling Engine (30s interval)...");

    pollInterval = setInterval(async () => {
        if (isPolling) {
            logger.warn("Previous poll cycle overlapped. Skipping.");
            return;
        }

        isPolling = true;

        try {
            // 1. Fetch all nodes
            const res = await pgPool.query('SELECT * FROM nodes');
            const nodes: NetworkNode[] = res.rows;

            if (nodes.length === 0) {
                isPolling = false;
                return;
            }

            const points: Point[] = [];
            const dashboardUpdates: any[] = [];
            const now = new Date();

            // 2. Batch Processing (Concurrency Limit: 20)
            const batches = chunkArray(nodes, 20);

            for (const batch of batches) {
                await Promise.all(batch.map(async (node) => {
                    let status = 'OFFLINE';
                    let latency = -1;
                    let metrics: any = {};

                    // A. ICMP Check (Fast)
                    latency = await pingHost(node.ip_address);

                    if (latency !== -1) {
                        status = 'ONLINE';
                        
                        // B. Deep Metric Fetch (If authenticated)
                        if (node.auth_user && node.auth_password) {
                            try {
                                metrics = await MikroTikService.fetchMetrics(
                                    node.ip_address,
                                    node.api_port || 8728,
                                    node.auth_user,
                                    node.auth_password,
                                    node.api_ssl
                                );

                                // Check Thresholds
                                await AlertService.checkThresholds(node, metrics);

                            } catch (err: any) {
                                logger.debug(`MikroTik API failed for ${node.ip_address}: ${err.message}`);
                                // Node is reachable via Ping, but API is down.
                                status = 'WARNING';
                            }
                        }
                    } else {
                        await AlertService.createOfflineAlert(node);
                    }

                    // C. InfluxDB Point Construction
                    const point = new Point('device_metrics')
                        .tag('node_id', String(node.id))
                        .tag('node_name', node.name)
                        .floatField('latency', latency >= 0 ? latency : 0)
                        .intField('status_code', status === 'ONLINE' ? 1 : 0);

                    if (metrics.cpuLoad !== undefined) point.intField('cpu', metrics.cpuLoad);
                    if (metrics.memoryUsage !== undefined) point.intField('memory', metrics.memoryUsage);
                    if (metrics.voltage !== undefined) point.floatField('voltage', metrics.voltage);
                    if (metrics.temperature !== undefined) point.intField('temperature', metrics.temperature);
                    if (metrics.txRate !== undefined) point.floatField('tx_rate', metrics.txRate);
                    if (metrics.rxRate !== undefined) point.floatField('rx_rate', metrics.rxRate);

                    points.push(point);

                    // D. Prepare Updates
                    
                    // 1. Dashboard Update (Lightweight - Broadcast to Map)
                    dashboardUpdates.push({
                        nodeId: node.id,
                        status,
                        latency: latency >= 0 ? latency : 0,
                        // Include basic traffic for map link visualization if available
                        txRate: metrics.txRate || 0,
                        rxRate: metrics.rxRate || 0
                    });

                    // 2. Room Update (Heavy - Emit only to subscribers)
                    io.to(`node:${node.id}`).emit('node:full_update', {
                        nodeId: node.id,
                        status,
                        latency,
                        lastSeen: now,
                        ...metrics
                    });

                    // E. DB State Update
                    await pgPool.query(
                        `UPDATE nodes SET status = $1, last_seen = $2 WHERE id = $3`,
                        [status, now, node.id]
                    );
                }));
            }

            // 3. Persist Time-Series
            if (points.length > 0) {
                writeApi.writePoints(points);
                await writeApi.flush();
            }

            // 4. Emit Dashboard Summary
            io.to('dashboard').emit('dashboard:update', dashboardUpdates);

        } catch (err: any) {
            logger.error("Poller Cycle Critical Failure", { error: err.message });
        } finally {
            isPolling = false;
        }

    }, 30000); // 30s Interval
};