export enum NodeStatus {
  ONLINE = 'ONLINE',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
  OFFLINE = 'OFFLINE',
}

export type ViewMode = 'TOPOLOGY' | 'TRAFFIC';
export type MapStyle = 'DARK' | 'LIGHT' | 'SATELLITE';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface MikroTikStats {
  cpuLoad: number; // %
  memoryUsage: number; // %
  voltage: number; // V
  temperature: number; // C
  uptime: string;
  boardName: string; // e.g., CCR1036, RB4011
  version: string; // RouterOS version
  txRate: number; // Mbps
  rxRate: number; // Mbps
  packetLoss: number; // %
  activePeers: number; // PPPoE/Hotspot clients
}

export interface NetworkNode extends MikroTikStats {
  id: string;
  name: string;
  ipAddress: string; // New field for CRUD
  type: string; // Changed from union to string for custom types
  location: Coordinates;
  status: NodeStatus;
  latency: number; // ms
  region: string;
  snmpEnabled?: boolean;
  snmpCommunity?: string;
}

export interface Connection {
  id: string;
  source: string;
  target: string;
  status: 'ACTIVE' | 'IDLE' | 'CONGESTED';
  latency: number;
  controlPoints?: Coordinates[]; // Custom routing points
  direction?: 'FORWARD' | 'REVERSE';
}

export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
}

export interface AIAnalysisResult {
  summary: string;
  recommendations: string[];
  riskScore: number;
}
