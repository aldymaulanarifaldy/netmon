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
  boardName: string;
  version: string;
  txRate: number; // Mbps
  rxRate: number; // Mbps
  packetLoss: number; // %
  activePeers: number;
  wanInterface?: string;
}

export interface NetworkNode extends MikroTikStats {
  id: string;
  name: string;
  ipAddress: string;
  apiPort?: number;
  apiSsl?: boolean;
  type: string;
  location: Coordinates;
  status: NodeStatus;
  latency: number; // ms
  region: string;
  snmpEnabled?: boolean;
  snmpCommunity?: string;
  authUser?: string;
  authPassword?: string;
}

export interface Connection {
  id: string;
  source: string;
  target: string;
  status: 'ACTIVE' | 'IDLE' | 'CONGESTED';
  latency: number;
  controlPoints?: Coordinates[];
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