export interface NetworkNode {
    id: string;
    name: string;
    ip_address: string;
    type: string;
    location_lat: number;
    location_lng: number;
    auth_user?: string;
    auth_password?: string; // Encrypted in DB
    snmp_community?: string;
    status?: 'ONLINE' | 'OFFLINE' | 'WARNING' | 'CRITICAL';
    latency?: number;
}

export interface NodeMetrics {
    nodeId: string;
    cpuLoad: number;
    memoryUsage: number;
    voltage: number;
    temperature: number;
    uptime: string;
    txRate: number; // Mbps
    rxRate: number; // Mbps
    packetLoss: number;
    latency: number;
    activePeers: number;
}
