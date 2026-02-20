
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
            tls: ssl ? { rejectUnauthorized: false } : undefined
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
            conn = await this.connect(ip, port, user, pass, ssl);
            const interfaces = await conn.write('/interface/print');

            return (interfaces || []).map((iface: any) => ({
                name: iface.name,
                type: iface.type,
                running: iface.running === 'true' || iface.running === true,
                disabled: iface.disabled === 'true' || iface.disabled === true,
                comment: iface.comment
            }));

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
            const resource = await conn.write('/system/resource/print');
            const health = await conn.write('/system/health/print').catch(() => []); // Health might fail on some devices

            const res = resource?.[0] || {};
            const h = health?.[0] || {};

            const totalMem = parseInt(res['total-memory'] || '0');
            const freeMem = parseInt(res['free-memory'] || '0');
            const memUsage = totalMem > 0
                ? Math.round(((totalMem - freeMem) / totalMem) * 100)
                : 0;

            let rxMbps = 0;
            let txMbps = 0;

            if (wanInterface) {
                try {
                    // Ensure interface name is clean
                    const iface = wanInterface.trim();
                    
                    const traffic = await conn.write('/interface/monitor-traffic', [
                        `=interface=${iface}`,
                        '=once='
                    ]);

                    const t = traffic?.[0] || {};
                    // Try multiple possible property names just in case
                    const rxBps = parseInt(t['rx-bits-per-second'] || t['rx-bits-per-second'] || '0');
                    const txBps = parseInt(t['tx-bits-per-second'] || t['tx-bits-per-second'] || '0');

                    rxMbps = parseFloat((rxBps / 1_000_000).toFixed(2));
                    txMbps = parseFloat((txBps / 1_000_000).toFixed(2));
                } catch (err) {
                    logger.warn(`Traffic monitor failed for ${ip} (iface: ${wanInterface})`, { err });
                }
            }

            let activePeers = 0;
            try {
                const ppp = await conn.write('/ppp/active/print');
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

        } catch (error) {
            logger.warn(`Fetch metrics failed for ${ip}`, { error });
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
