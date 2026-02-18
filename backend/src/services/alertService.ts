import { pgPool } from '../config/db';
import { NetworkNode, NodeMetrics } from '../types';
import { logger } from '../utils/logger';

export class AlertService {
    
    static async checkThresholds(node: NetworkNode, metrics: Partial<NodeMetrics>) {
        const alerts = [];

        // CPU Threshold
        if (metrics.cpuLoad && metrics.cpuLoad > 85) {
            alerts.push({
                type: 'CPU_HIGH',
                message: `CPU Load critical: ${metrics.cpuLoad}%`,
                severity: 'CRITICAL'
            });
        }

        // Temperature Threshold
        if (metrics.temperature && metrics.temperature > 65) {
            alerts.push({
                type: 'TEMP_HIGH',
                message: `Temperature critical: ${metrics.temperature}C`,
                severity: 'WARNING'
            });
        }

        // Voltage Threshold
        if (metrics.voltage && metrics.voltage < 20) {
             alerts.push({
                type: 'VOLTAGE_LOW',
                message: `Voltage low: ${metrics.voltage}V`,
                severity: 'WARNING'
            });
        }

        // Save alerts to DB
        for (const alert of alerts) {
            await this.createAlert(node.id, alert.type, alert.message, alert.severity);
        }
    }

    static async createAlert(nodeId: string, type: string, message: string, severity: string) {
        // Prevent duplicate active alerts of same type
        const existing = await pgPool.query(
            `SELECT id FROM alerts WHERE node_id = $1 AND type = $2 AND active = TRUE`,
            [nodeId, type]
        );

        if (existing.rows.length === 0) {
            await pgPool.query(
                `INSERT INTO alerts (node_id, type, message, severity, active) VALUES ($1, $2, $3, $4, TRUE)`,
                [nodeId, type, message, severity]
            );
            logger.warn(`New Alert [${severity}]: ${message} (Node: ${nodeId})`);
        }
    }

    static async resolveAlerts(nodeId: string, types: string[]) {
        if (types.length === 0) return;
        // Resolve alerts that are NOT in the current types list (basic implementation)
        // For a full implementation, we'd check if the condition is cleared.
        // Here, we simply auto-resolve if CPU drops.
        
        // This is a simplified "Resolve All" for the Node when it comes back Online or healthy
        // specific metric resolution requires more state tracking.
    }
    
    static async createOfflineAlert(node: NetworkNode) {
         await this.createAlert(node.id, 'OFFLINE', `Device ${node.name} (${node.ip_address}) is unreachable`, 'CRITICAL');
    }
}