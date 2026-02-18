
import { Coordinates, NetworkNode } from './types';

// Center: Bangil/Pasuruan area, East Java (Regional HQ)
export const MAP_CENTER: Coordinates = { lat: -7.579042, lng: 112.710716 };
export const MAP_ZOOM = 13;

/**
 * Initial nodes and connections are now empty for a clean production environment.
 * Device data is managed via the Backend API and persisted in PostgreSQL.
 */
export const INITIAL_NODES: Omit<NetworkNode, 'status' | 'latency' | 'uptime' | 'txRate' | 'rxRate' | 'packetLoss' | 'cpuLoad' | 'memoryUsage' | 'voltage' | 'temperature' | 'activePeers'>[] = [];

export const INITIAL_CONNECTIONS: { source: string; target: string }[] = [];
