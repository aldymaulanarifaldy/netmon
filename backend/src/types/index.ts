
export interface NetworkNode {
    id: string;
    name: string;
    ip_address: string;
    api_port: number;
    api_ssl: boolean;
    type: string;
    location_lat: number;
    location_lng: number;
    auth_user?: string;
    auth_password?: string;
    snmp_community?: string;
    status?: 'ONLINE' | 'OFFLINE' | 'WARNING' | 'CRITICAL';
    wan_interface?: string;
    lan_interface?: string;
    latency?: number;
    last_seen?: Date;
    board_name?: string;
    version?: string;
    uptime?: string;
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
    wanInterface?: string;
    boardName?: string;
    version?: string;
}

export interface Alert {
    id: string;
    node_id: string;
    type: string;
    message: string;
    severity: string;
    created_at: string;
}
