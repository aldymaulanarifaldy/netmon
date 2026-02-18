import { Coordinates, NetworkNode, NodeStatus } from './types';

// Requested Center: -7.579042, 112.710716 (Bangil/Pasuruan area, East Java)
export const MAP_CENTER: Coordinates = { lat: -7.579042, lng: 112.710716 };
export const MAP_ZOOM = 13;

export const INITIAL_NODES: Omit<NetworkNode, 'status' | 'latency' | 'uptime' | 'txRate' | 'rxRate' | 'packetLoss' | 'cpuLoad' | 'memoryUsage' | 'voltage' | 'temperature' | 'activePeers'>[] = [
  // Core Gateway
  { 
    id: 'core-bangil', 
    name: 'Bangil Main GW (CCR1072)', 
    ipAddress: '10.50.1.1',
    type: 'CORE', 
    location: { lat: -7.5980, lng: 112.7350 }, 
    region: 'Bangil District',
    boardName: 'CCR1072-1G-8S+',
    version: '7.12.1'
  },
  // Distribution Towers
  { 
    id: 'dist-kraton', 
    name: 'Kraton Tower (RB4011)', 
    ipAddress: '10.50.2.1',
    type: 'DISTRIBUTION', 
    location: { lat: -7.5850, lng: 112.7600 }, 
    region: 'Kraton Sector',
    boardName: 'RB4011iGS+',
    version: '7.11.2'
  },
  { 
    id: 'dist-rembang', 
    name: 'Rembang Hub (RB1100AH)', 
    ipAddress: '10.50.3.1',
    type: 'DISTRIBUTION', 
    location: { lat: -7.6100, lng: 112.7800 }, 
    region: 'Rembang Industrial',
    boardName: 'RB1100AHx4',
    version: '7.11.2'
  },
  // Backhaul Links
  { 
    id: 'bh-beji', 
    name: 'Beji Relay (NetMetal)', 
    ipAddress: '10.50.4.1',
    type: 'BACKHAUL', 
    location: { lat: -7.5600, lng: 112.7200 }, 
    region: 'Beji Area',
    boardName: 'NetMetal 5',
    version: '6.49.10'
  },
  // Access Points (Villages)
  { 
    id: 'acc-sidowayah', 
    name: 'Sidowayah Village (LHG)', 
    ipAddress: '10.50.100.1',
    type: 'ACCESS', 
    location: { lat: -7.5790, lng: 112.7107 }, // The exact coordinate requested
    region: 'Sidowayah',
    boardName: 'LHG 5 ac',
    version: '7.10'
  },
  { 
    id: 'acc-kalirejo', 
    name: 'Kalirejo Omni (MantBox)', 
    ipAddress: '10.50.101.1',
    type: 'ACCESS', 
    location: { lat: -7.5700, lng: 112.7400 }, 
    region: 'Kalirejo',
    boardName: 'MantBox 15s',
    version: '7.12'
  },
  { 
    id: 'acc-pogar', 
    name: 'Pogar Endpoint (SXT)', 
    ipAddress: '10.50.102.1',
    type: 'ACCESS', 
    location: { lat: -7.5900, lng: 112.7250 }, 
    region: 'Pogar',
    boardName: 'SXTsq 5 ac',
    version: '7.12'
  }
];

export const INITIAL_CONNECTIONS = [
  // Backbone Ring
  { source: 'core-bangil', target: 'dist-kraton' },
  { source: 'core-bangil', target: 'dist-rembang' },
  { source: 'core-bangil', target: 'bh-beji' },
  
  // Access Links
  { source: 'bh-beji', target: 'acc-sidowayah' }, // Connection to center point
  { source: 'bh-beji', target: 'acc-pogar' },
  { source: 'dist-kraton', target: 'acc-kalirejo' },
];