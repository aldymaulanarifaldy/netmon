
import { RouterOSAPI } from 'node-routeros';
import { NodeMetrics } from '../types';
import { logger } from '../utils/logger';

export class MikroTikService {

    private static async connect(
        ip: string,
        port: number,
        user: string,
        pass: string,
        ssl: boolean
    ) {
        const conn = new RouterOSAPI({
            host: ip,
            port,
            user,
            password: pass,
            tls: ssl ? { rejectUnauthorized: false } : undefined,
            timeout: 10, // 10s timeout
            keepalive: false // Disable keepalive to prevent state issues
        });

        // Prevent connection-level errors from crashing the process
        conn.on('error', (err: any) => {
            logger.warn(`MikroTik connection error [${ip}]: ${err.message}`);
        });

        await conn.connect();
        return conn;
    }

    /**
     * =========================
     * TEST CONNECTION
     * =========================
     */
    static async testConnection(
        ip: string,
        port: number,
        user: string,
        pass: string,
        ssl: boolean
    ) {

        const start = Date.now();
        let conn;
        
        try {
            conn = await this.connect(ip, port, user, pass, ssl);
            const identity = await conn.write('/system/identity/print');
            const resource = await conn.write('/system/resource/print');

            const latency = Date.now() - start;

            return {
                success: true,
                identity: identity[0]?.name || 'MikroTik',
                version: resource[0]?.version || 'unknown',
                boardName: resource[0]?.['board-name'] || 'unknown',
                uptime: resource[0]?.uptime || '0s',
                latency
            };

        } catch (error: any) {
            const latency = Date.now() - start;
            throw new Error(error.message || 'Connection failed');
        } finally {
            if (conn) conn.close().catch(() => {});
        }
    }

    /**
     * =========================
     * GET INTERFACES
     * =========================
     */
    static async getInterfaces(
        ip: string,
        port: number,
        user: string,
        pass: string,
        ssl: boolean
    ) {
        let conn;
        try {
            logger.info(`Scanning interfaces for ${ip}...`);
            conn = await this.connect(ip, port, user, pass, ssl);
            
            let interfaces: any[] = [];
            
            try {
                // Try optimized fetch first
                interfaces = await conn.write('/interface/print', ['=.proplist=name,type,running,disabled,comment']);
            } catch (pError) {
                logger.warn(`Optimized interface scan failed for ${ip}, retrying with full print...`);
                // Fallback to full print
                interfaces = await conn.write('/interface/print');
            }
            
            logger.info(`Found ${interfaces?.length || 0} interfaces for ${ip}`);

            return (interfaces || []).map((iface: any) => ({
                name: iface.name,
                type: iface.type,
                running: iface.running === 'true' || iface.running === true,
                disabled: iface.disabled === 'true' || iface.disabled === true,
                comment: iface.comment
            }));

        } catch (error: any) {
            logger.error(`Interface scan failed for ${ip}`, { error: error.message });
            throw new Error(`Scan failed: ${error.message}`);
        } finally {
            if (conn) conn.close().catch(() => {});
        }
    }

    /**
     * =========================
     * GET LOGS
     * =========================
     */
    static async getLogs(
        ip: string,
        port: number,
        user: string,
        pass: string,
        ssl: boolean
    ) {
        let conn;
        try {
            conn = await this.connect(ip, port, user, pass, ssl);
            // Fetch last 50 logs without strict topic filtering to ensure we get data
            const logs = await conn.write('/log/print');
            
            return (logs || []).slice(-50).reverse().map((l: any) => ({
                timestamp: l.time,
                level: (l.topics || '').includes('error') ? 'ERROR' : (l.topics || '').includes('warning') ? 'WARN' : 'INFO',
                message: l.message
            }));

        } finally {
            if (conn) conn.close().catch(() => {});
        }
    }

    // Cache for traffic calculation: "ip:interface" -> { rx: number, tx: number, time: number }
    private static trafficCache = new Map<string, { rx: number, tx: number, time: number }>();

    /**
     * =========================
     * FETCH METRICS
     * =========================
     */
    static async fetchMetrics(
        ip: string,
        port: number,
        user: string,
        pass: string,
        ssl: boolean,
        wanInterface?: string
    ): Promise<Partial<NodeMetrics>> {

        let conn;
        try {
            conn = await this.connect(ip, port, user, pass, ssl);
            
            // 1. Resource (Basic info)
            let res: any = {};
            try {
                const resource = await conn.write('/system/resource/print');
                res = resource?.[0] || {};
            } catch (e: any) {
                logger.warn(`Failed to fetch resource for ${ip}: ${e.message}`);
            }

            // 2. Health (Optional, often fails on VM/CHR)
            let h: any = {};
            try {
                const health = await conn.write('/system/health/print');
                h = health?.[0] || {};
            } catch {}

            const totalMem = parseInt(res['total-memory'] || '0');
            const freeMem = parseInt(res['free-memory'] || '0');
            const memUsage = totalMem > 0
                ? Math.round(((totalMem - freeMem) / totalMem) * 100)
                : 0;

            let rxMbps = 0;
            let txMbps = 0;

            // 3. Traffic (Using byte counters)
            if (wanInterface) {
                try {
                    const ifaceName = wanInterface.trim();
                    
                    // Use /interface/print with stats to avoid monitor-traffic crashes
                    // We fetch specific properties to be efficient
                    const ifaceStats = await conn.write('/interface/print', [
                        `?name=${ifaceName}`,
                        '=.proplist=rx-byte,tx-byte'
                    ]);

                    if (ifaceStats && ifaceStats.length > 0) {
                        const rawRx = ifaceStats[0]['rx-byte'];
                        const rawTx = ifaceStats[0]['tx-byte'];
                        
                        const currentRx = parseInt(rawRx || '0');
                        const currentTx = parseInt(rawTx || '0');
                        const currentTime = Date.now();
                        const cacheKey = `${ip}:${ifaceName}`;

                        const last = this.trafficCache.get(cacheKey);

                        if (last) {
                            const timeDiff = (currentTime - last.time) / 1000; // seconds
                            if (timeDiff > 0) {
                                // Calculate bits per second: (diff bytes * 8) / seconds
                                // Handle counter wrap-around (simple check: if curr < prev, ignore or assume wrap)
                                if (currentRx >= last.rx && currentTx >= last.tx) {
                                    const rxBps = ((currentRx - last.rx) * 8) / timeDiff;
                                    const txBps = ((currentTx - last.tx) * 8) / timeDiff;
                                    
                                    rxMbps = parseFloat((rxBps / 1_000_000).toFixed(2));
                                    txMbps = parseFloat((txBps / 1_000_000).toFixed(2));
                                } else {
                                    logger.debug(`Traffic counter wrap/reset for ${ip}:${ifaceName} (prev: ${last.rx}, curr: ${currentRx})`);
                                }
                            }
                        } else {
                            logger.debug(`First traffic poll for ${ip}:${ifaceName} (rx: ${currentRx}, tx: ${currentTx})`);
                        }

                        // Update cache
                        this.trafficCache.set(cacheKey, {
                            rx: currentRx,
                            tx: currentTx,
                            time: currentTime
                        });
                    } else {
                        logger.warn(`No stats found for interface ${ifaceName} on ${ip}`);
                    }

                } catch (err: any) {
                    logger.warn(`Traffic fetch failed for ${ip} (iface: ${wanInterface})`, { error: err.message });
                }
            }

            let activePeers = 0;
            try {
                const ppp = await conn.write('/ppp/active/print', ['=.proplist=.id']); // Minimal fetch
                activePeers = ppp?.length || 0;
            } catch {}

            return {
                cpuLoad: parseInt(res['cpu-load'] || '0'),
                memoryUsage: memUsage,
                uptime: res['uptime'] || '',
                boardName: res['board-name'] || '',
                version: res['version'] || '',
                temperature: parseInt(h['temperature'] || '0'),
                voltage: parseFloat(h['voltage'] || '0'),
                txRate: txMbps,
                rxRate: rxMbps,
                activePeers,
                wanInterface
            };

        } catch (error: any) {
            logger.warn(`Fetch metrics failed for ${ip}`, { error: error.message });
            return {};
        } finally {
            if (conn) conn.close().catch(() => {});
        }
    }

    static closeAll() {
        // node-routeros does not maintain global pool
        return;
    }
}
