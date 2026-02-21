import { useState, useEffect } from 'react';
import NetworkMap from './components/NetworkMap';
import StatsPanel from './components/StatsPanel';
import SystemDesignModal from './components/SystemDesignModal';
import DeviceModal from './components/DeviceModal';
import { NetworkNode, NodeStatus, LogEntry, ViewMode, Connection, MapStyle } from './types';
import { Activity, FileText, Plus, Moon, Sun, Globe, Share2, Cable, Zap } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

// Global Socket Instance
let socket: Socket;

function App() {
  const [nodes, setNodes] = useState<NetworkNode[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  // logs are currently static/empty as simulation is removed, removing setter to fix TS error
  const [logs] = useState<LogEntry[]>([]);
  
  // Selection
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  
  // UI States
  const [showDesignModal, setShowDesignModal] = useState(false);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [editingNode, setEditingNode] = useState<Partial<NetworkNode> | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('TOPOLOGY');
  const [mapStyle, setMapStyle] = useState<MapStyle>('DARK');
  const [isLinkMode, setIsLinkMode] = useState(false);
  const [connected, setConnected] = useState(false);

  // Initial Fetch & Socket Connection
  useEffect(() => {
      const apiUrl = window.location.origin.includes('localhost') ? 'http://localhost:3001' : '';
      
      // 1. Fetch Inventory
      fetch(`${apiUrl}/api/nodes`)
        .then(res => res.json())
        .then(dbNodes => {
            if (Array.isArray(dbNodes)) {
                const mappedNodes = dbNodes.map((n: any) => ({
                    id: n.id,
                    name: n.name,
                    ipAddress: n.ip_address,
                    apiPort: n.api_port,
                    apiSsl: n.api_ssl,
                    type: n.type,
                    location: { lat: parseFloat(n.location_lat), lng: parseFloat(n.location_lng) },
                    status: (n.status || 'OFFLINE') as NodeStatus,
                    latency: 0,
                    cpuLoad: 0, memoryUsage: 0, voltage: 0, temperature: 0, 
                    uptime: n.uptime || '', 
                    txRate: 0, rxRate: 0, packetLoss: 0, activePeers: 0,
                    boardName: n.board_name || 'Unknown', 
                    version: n.version || 'Unknown', 
                    region: 'Default',
                    authUser: '', authPassword: '',
                    wanInterface: n.wan_interface,
                    lanInterface: n.lan_interface
                }));
                setNodes(mappedNodes);
            }
        })
        .catch(err => console.error("Failed to fetch nodes", err));

      // 1.5 Fetch Connections
      fetch(`${apiUrl}/api/connections`)
        .then(res => res.json())
        .then(dbConns => {
            if (Array.isArray(dbConns)) {
                setConnections(dbConns.map((c: any) => ({
                    id: c.id,
                    source: c.source,
                    target: c.target,
                    status: c.status,
                    latency: c.latency,
                    direction: 'FORWARD'
                })));
            }
        })
        .catch(err => console.error("Failed to fetch connections", err));

      // 2. Connect Socket
      socket = io(apiUrl);
      
      socket.on('connect', () => {
          console.log("Connected to ISP Backend");
          setConnected(true);
      });

      socket.on('disconnect', () => setConnected(false));

      // 3. Listen for Dashboard Broadcasts (Map Summary)
      socket.on('dashboard:update', (updates: any[]) => {
          setNodes(prev => prev.map(node => {
              const update = updates.find(u => u.nodeId === node.id);
              if (update) {
                  return { 
                      ...node, 
                      status: update.status as NodeStatus,
                      latency: update.latency,
                      txRate: update.txRate || node.txRate,
                      rxRate: update.rxRate || node.rxRate,
                      cpuLoad: update.cpuLoad || node.cpuLoad,
                      memoryUsage: update.memoryUsage || node.memoryUsage
                  };
              }
              return node;
          }));
      });

      return () => {
          socket.disconnect();
      };
  }, []);

  const handleAddNode = () => {
    setEditingNode(null);
    setShowDeviceModal(true);
    setIsLinkMode(false);
  };

  const handleMapClick = (coords: { lat: number; lng: number }) => {
    if (selectedNodeId || selectedConnectionId) {
        setSelectedNodeId(null);
        setSelectedConnectionId(null);
        return;
    }
    if (!isLinkMode) {
        setEditingNode({
          name: '',
          ipAddress: '',
          type: 'ACCESS',
          status: NodeStatus.ONLINE,
          location: coords
        });
        setShowDeviceModal(true);
    }
  };

  const handleSaveNode = (node: NetworkNode, uplinkId?: string) => {
    const apiUrl = window.location.origin.includes('localhost') ? 'http://localhost:3001/api/nodes' : '/api/nodes';
    
    // Check if we are updating an existing node
    const isUpdate = nodes.some(n => n.id === node.id);
    const method = isUpdate ? 'PUT' : 'POST';
    const url = isUpdate ? `${apiUrl}/${node.id}` : apiUrl;

    fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: node.name,
            ip_address: node.ipAddress,
            api_port: node.apiPort,
            api_ssl: node.apiSsl,
            type: node.type,
            location_lat: node.location.lat,
            location_lng: node.location.lng,
            auth_user: node.authUser,
            auth_password: node.authPassword,
            snmp_community: node.snmpCommunity,
            wan_interface: node.wanInterface,
            lan_interface: node.lanInterface
        })
    })
    .then(res => res.json())
    .then(savedNode => {
        if (isUpdate) {
            // Update existing node in state
            setNodes(prev => prev.map(n => n.id === savedNode.id ? { ...n, ...node, ...savedNode } : n));
        } else {
            // Add new node
            const newNode = { ...node, id: savedNode.id };
            setNodes(prev => [...prev, newNode]);
            
            if (uplinkId) {
                // Persist new connection
                fetch(apiUrl.replace('/nodes', '/connections'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        source: uplinkId,
                        target: newNode.id,
                        type: 'FIBER'
                    })
                })
                .then(res => res.json())
                .then(newConn => {
                    setConnections(prev => [...prev, {
                        id: newConn.id,
                        source: newConn.source,
                        target: newConn.target,
                        status: 'ACTIVE',
                        latency: 1,
                        direction: 'FORWARD'
                    }]);
                });
            }
        }
    })
    .catch(err => console.error("Provision/Update failed", err));
  };

  const handleNodeSelect = (nodeId: string) => {
      setSelectedNodeId(nodeId);
      setSelectedConnectionId(null);
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId) || null;
  const selectedConnection = connections.find(c => c.id === selectedConnectionId) || null;

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 font-sans overflow-hidden relative">
        <div className="flex-1 relative">
            <div className="absolute top-0 left-0 right-0 z-[1000] p-4 pointer-events-none">
                <div className="flex justify-between items-start">
                    <div className="bg-slate-900/90 backdrop-blur-md p-4 rounded-2xl border border-slate-700 shadow-2xl pointer-events-auto">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-blue-600 rounded-lg">
                                <Activity className="text-white" size={24} />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight">INK Networks</h1>
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}></div>
                                    <span className="text-xs text-slate-400">{connected ? 'System Operational' : 'Connecting to Backend...'}</span>
                                </div>
                            </div>
                        </div>
                        {/* Stats Counters */}
                        <div className="flex gap-6">
                            <div>
                                <div className="text-xs text-slate-500 uppercase font-black">Online</div>
                                <div className="text-2xl font-mono text-green-400">{nodes.filter(n => n.status === NodeStatus.ONLINE).length}</div>
                            </div>
                            <div>
                                <div className="text-xs text-slate-500 uppercase font-black">Issues</div>
                                <div className="text-2xl font-mono text-yellow-400">{nodes.filter(n => n.status === NodeStatus.WARNING).length}</div>
                            </div>
                            <div>
                                <div className="text-xs text-slate-500 uppercase font-black">Offline</div>
                                <div className="text-2xl font-mono text-red-500">{nodes.filter(n => n.status === NodeStatus.OFFLINE || n.status === NodeStatus.CRITICAL).length}</div>
                            </div>
                        </div>
                    </div>

                    {/* Toolbar */}
                    <div className="flex flex-col items-end gap-2 pointer-events-auto">
                        <div className="bg-slate-900/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-700 flex gap-1">
                            <button onClick={() => setMapStyle('DARK')} className={`p-2 rounded-lg ${mapStyle === 'DARK' ? 'bg-slate-700' : ''}`}><Moon size={18} /></button>
                            <button onClick={() => setMapStyle('LIGHT')} className={`p-2 rounded-lg ${mapStyle === 'LIGHT' ? 'bg-slate-700' : ''}`}><Sun size={18} /></button>
                            <button onClick={() => setMapStyle('SATELLITE')} className={`p-2 rounded-lg ${mapStyle === 'SATELLITE' ? 'bg-slate-700' : ''}`}><Globe size={18} /></button>
                        </div>
                        <div className="flex gap-2">
                             <div className="bg-slate-900/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-700 flex">
                                <button onClick={() => setViewMode('TOPOLOGY')} className={`p-2 rounded-lg flex items-center gap-2 text-sm font-bold transition-all ${viewMode === 'TOPOLOGY' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}><Share2 size={16} /> Topology</button>
                                <button onClick={() => setViewMode('TRAFFIC')} className={`p-2 rounded-lg flex items-center gap-2 text-sm font-bold transition-all ${viewMode === 'TRAFFIC' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-slate-400 hover:text-white'}`}><Zap size={16} /> Traffic Flow</button>
                             </div>
                        </div>
                        <div className="bg-slate-900/90 backdrop-blur-md p-2 rounded-xl border border-slate-700 flex gap-2">
                            <button onClick={handleAddNode} className="p-2 rounded-lg bg-green-600 hover:bg-green-500 text-white"><Plus size={20} /></button>
                            <button onClick={() => setIsLinkMode(!isLinkMode)} className={`p-2 rounded-lg ${isLinkMode ? 'bg-yellow-500 text-black' : 'bg-slate-700'}`}><Cable size={20} /></button>
                            <button onClick={() => setShowDesignModal(true)} className="p-2 rounded-lg bg-slate-700"><FileText size={20} /></button>
                        </div>
                    </div>
                </div>
            </div>

            <NetworkMap 
                nodes={nodes} 
                connections={connections}
                selectedNodeId={selectedNodeId} 
                selectedConnectionId={selectedConnectionId}
                viewMode={viewMode}
                mapStyle={mapStyle}
                isLinkMode={isLinkMode}
                onNodeSelect={handleNodeSelect}
                onConnectionSelect={(id) => { setSelectedConnectionId(id); setSelectedNodeId(null); }}
                onCreateConnection={(s, t) => {
                    const apiUrl = window.location.origin.includes('localhost') ? 'http://localhost:3001/api/connections' : '/api/connections';
                    fetch(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ source: s, target: t, type: 'FIBER' })
                    })
                    .then(res => res.json())
                    .then(newConn => {
                        setConnections(p => [...p, { 
                            id: newConn.id, 
                            source: newConn.source, 
                            target: newConn.target, 
                            status: 'ACTIVE', 
                            latency: 1 
                        }]);
                    });
                }}
                onMapClick={handleMapClick}
            />
        </div>

        <div className={`w-96 bg-slate-900 border-l border-slate-800 transition-all duration-300 transform ${selectedNodeId || selectedConnectionId ? 'translate-x-0' : 'translate-x-full absolute right-0'}`}>
            <StatsPanel 
                node={selectedNode} 
                connection={selectedConnection}
                allNodes={nodes}
                logs={logs}
                onClose={() => { setSelectedNodeId(null); setSelectedConnectionId(null); }}
                onEdit={(n) => { setEditingNode(n); setShowDeviceModal(true); }}
                socket={socket} 
            />
        </div>

        {showDesignModal && <SystemDesignModal onClose={() => setShowDesignModal(false)} />}
        {showDeviceModal && (
            <DeviceModal 
                node={editingNode} 
                nodes={nodes}
                connections={connections}
                onSave={handleSaveNode} 
                onDelete={(id) => {
                    const apiUrl = window.location.origin.includes('localhost') ? 'http://localhost:3001/api/nodes' : '/api/nodes';
                    fetch(`${apiUrl}/${id}`, { method: 'DELETE' })
                        .then(() => {
                            setNodes(p => p.filter(n => n.id !== id));
                            setConnections(p => p.filter(c => c.source !== id && c.target !== id));
                            setSelectedNodeId(null);
                            setShowDeviceModal(false);
                        })
                        .catch(err => console.error("Delete failed", err));
                }}
                onClose={() => setShowDeviceModal(false)} 
            />
        )}
    </div>
  );
}

export default App;