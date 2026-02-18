import React, { useState, useEffect, useCallback, useRef } from 'react';
import NetworkMap from './components/NetworkMap';
import StatsPanel from './components/StatsPanel';
import SystemDesignModal from './components/SystemDesignModal';
import DeviceModal from './components/DeviceModal';
import { NetworkNode, NodeStatus, LogEntry, ViewMode, Connection, MapStyle, Coordinates } from './types';
import { INITIAL_NODES, INITIAL_CONNECTIONS } from './constants';
import { LayoutDashboard, Zap, Activity, FileText, Plus, Moon, Sun, Globe, Share2, Cable, Lock } from 'lucide-react';
import { io } from 'socket.io-client';

const generateRandomLatency = (base: number) => Math.max(1, Math.floor(base + (Math.random() * 20 - 10)));

function App() {
  const [nodes, setNodes] = useState<NetworkNode[]>(
    INITIAL_NODES.map(n => ({
        ...n,
        status: NodeStatus.ONLINE,
        latency: Math.floor(Math.random() * 10) + 2,
        uptime: '23d 04:12:33',
        cpuLoad: Math.floor(Math.random() * 20),
        memoryUsage: Math.floor(Math.random() * 60),
        voltage: 24.1,
        temperature: 45,
        txRate: Math.floor(Math.random() * 50),
        rxRate: Math.floor(Math.random() * 50),
        packetLoss: 0,
        activePeers: Math.floor(Math.random() * 50)
    }))
  );
  
  const [connections, setConnections] = useState<Connection[]>(INITIAL_CONNECTIONS.map(c => ({
      ...c,
      latency: Math.floor(Math.random() * 5) + 1
  })) as Connection[]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [nodeHistory, setNodeHistory] = useState<Record<string, { timestamp: string, value: number }[]>>({});
  const [connectionHistory, setConnectionHistory] = useState<Record<string, { timestamp: string, value: number }[]>>({});
  
  const [isSimulating, setIsSimulating] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(localStorage.getItem('token'));
  
  // UI States
  const [showDesignModal, setShowDesignModal] = useState(false);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [editingNode, setEditingNode] = useState<Partial<NetworkNode> | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('TOPOLOGY');
  const [mapStyle, setMapStyle] = useState<MapStyle>('DARK');
  const [isLinkMode, setIsLinkMode] = useState(false);

  // REAL BACKEND INTEGRATION
  useEffect(() => {
      // 1. Attempt connection
      const initConnection = async () => {
          if (!authToken) {
              console.log("No token found. Running in simulation mode.");
              setShowLoginModal(true);
              return;
          }

          try {
              const res = await fetch('http://localhost:3001/api/nodes', {
                  headers: { 'Authorization': `Bearer ${authToken}` }
              });
              
              if (res.status === 401 || res.status === 403) {
                  localStorage.removeItem('token');
                  setAuthToken(null);
                  setShowLoginModal(true);
                  return;
              }

              const dbNodes = await res.json();
              if (Array.isArray(dbNodes)) {
                  console.log("Connected to Real Backend.");
                  setIsAuthenticated(true);
                  setIsSimulating(false);
                  
                  // Map DB nodes to Frontend format
                  const mappedNodes = dbNodes.map((n: any) => ({
                    id: n.id,
                    name: n.name,
                    ipAddress: n.ip_address,
                    type: n.type,
                    location: { lat: parseFloat(n.location_lat), lng: parseFloat(n.location_lng) },
                    status: NodeStatus.OFFLINE,
                    latency: 0,
                    cpuLoad: 0, memoryUsage: 0, voltage: 0, temperature: 0, 
                    uptime: '0', txRate: 0, rxRate: 0, packetLoss: 0, activePeers: 0,
                    boardName: 'Unknown', version: 'Unknown', region: 'Default'
                }));
                setNodes(mappedNodes);

                // Setup Socket
                const socket = io('http://localhost:3001', {
                    auth: { token: authToken }
                });

                socket.on('connect_error', (err) => {
                    console.error("Socket Auth Error", err.message);
                });

                socket.on('metrics:update', (updates: any[]) => {
                    setNodes(prev => prev.map(node => {
                        const update = updates.find(u => u.nodeId === node.id);
                        if (update) {
                            return { ...node, ...update, status: update.status === 'ONLINE' ? NodeStatus.ONLINE : NodeStatus.OFFLINE };
                        }
                        return node;
                    }));
                });

                return () => socket.disconnect();
              }
          } catch (e) {
              console.log("Backend offline, running in Simulation Mode");
          }
      };

      initConnection();
  }, [authToken]);

  const handleLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const username = (form.elements.namedItem('username') as HTMLInputElement).value;
      const password = (form.elements.namedItem('password') as HTMLInputElement).value;

      try {
          const res = await fetch('http://localhost:3001/api/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username, password })
          });
          
          if (res.ok) {
              const data = await res.json();
              localStorage.setItem('token', data.token);
              setAuthToken(data.token);
              setShowLoginModal(false);
          } else {
              alert("Login Failed");
          }
      } catch(err) { alert("Server Error"); }
  };

  // CRUD Handlers
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

  const handleNodeSelect = (nodeId: string) => {
      setSelectedNodeId(nodeId);
      setSelectedConnectionId(null);
  };

  const handleConnectionSelect = (connId: string) => {
      setSelectedConnectionId(connId);
      setSelectedNodeId(null);
  };

  const handleConnectionUpdate = (connId: string, updates: Partial<Connection>) => {
      setConnections(prev => prev.map(c => 
          c.id === connId ? { ...c, ...updates } : c
      ));
  };

  const handleCreateConnection = (sourceId: string, targetId: string) => {
      if (sourceId === targetId) return;
      const exists = connections.some(c => 
          (c.source === sourceId && c.target === targetId) || 
          (c.source === targetId && c.target === sourceId)
      );

      if (exists) {
          addLog('WARN', 'Connection already exists', 'System');
          return;
      }

      const newConn: Connection = {
          id: `conn-${Date.now()}`,
          source: sourceId,
          target: targetId,
          status: 'ACTIVE',
          latency: 2,
          controlPoints: [],
          direction: 'FORWARD'
      };

      setConnections(prev => [...prev, newConn]);
      setIsLinkMode(false); 
  };

  const handleEditNode = (node: NetworkNode) => {
    setEditingNode(node);
    setShowDeviceModal(true);
  };

  const handleSaveNode = (node: NetworkNode, uplinkId?: string) => {
    // Optimistic Update
    setNodes(prev => {
      const exists = prev.find(n => n.id === node.id);
      if (exists) return prev.map(n => n.id === node.id ? node : n);
      return [...prev, node];
    });

    // Send to Backend
    if (isAuthenticated) {
        fetch('http://localhost:3001/api/nodes', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                name: node.name,
                ip_address: node.ipAddress,
                type: node.type,
                location_lat: node.location.lat,
                location_lng: node.location.lng,
                // Add auth fields if in modal
            })
        });
    }

    if (uplinkId !== undefined) {
        setConnections(prev => {
            const cleanConnections = prev.filter(c => c.target !== node.id);
            if (uplinkId) {
                return [...cleanConnections, {
                    id: `conn-${Date.now()}`,
                    source: uplinkId,
                    target: node.id,
                    status: 'ACTIVE',
                    latency: 2,
                    direction: 'FORWARD'
                }];
            }
            return cleanConnections;
        });
    }
  };

  const handleDeleteNode = (nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setConnections(prev => prev.filter(c => c.source !== nodeId && c.target !== nodeId));
    setSelectedNodeId(null);
    setShowDeviceModal(false);
  };

  // Simulation Logic
  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(() => {
      // 1. Simulate Node Updates
      setNodes(prevNodes => prevNodes.map(node => {
        let newLatency = generateRandomLatency(node.latency < 5 ? 3 : node.latency);
        const trafficFactor = Math.random() > 0.8 ? 50 : 0;
        const newTx = Math.max(0, node.txRate + (Math.random() * 20 - 10) + trafficFactor);
        const newRx = Math.max(0, node.rxRate + (Math.random() * 20 - 10) + trafficFactor);
        const newCpu = Math.min(100, Math.floor((newTx + newRx) / 10) + 10);

        let newStatus = NodeStatus.ONLINE;
        let newPacketLoss = 0;

        if (newCpu > 80) {
            newLatency += 50; 
            newStatus = NodeStatus.WARNING;
        }
        
        if (Math.random() > 0.98 && (node.type === 'ACCESS' || node.type === 'BACKHAUL')) {
            newLatency += 200;
            newPacketLoss = Math.floor(Math.random() * 15);
            newStatus = NodeStatus.CRITICAL;
        }

        if (Math.random() > 0.998) {
             newStatus = NodeStatus.OFFLINE;
             newPacketLoss = 100;
        }

        if (newStatus !== node.status) {
            const level = newStatus === NodeStatus.ONLINE ? 'INFO' : newStatus === NodeStatus.WARNING ? 'WARN' : 'ERROR';
            addLog(level, `state: ${newStatus}`, node.name);
        }

        return {
          ...node,
          latency: newStatus === NodeStatus.OFFLINE ? 0 : newLatency,
          cpuLoad: newCpu,
          txRate: Math.floor(newTx),
          rxRate: Math.floor(newRx),
          status: newStatus,
          packetLoss: newPacketLoss,
          temperature: 45 + (newCpu > 80 ? 10 : 0)
        };
      }));

      // 2. Simulate Connection Updates
      setConnections(prevConns => prevConns.map(conn => {
          const jitter = Math.random() * 2 - 1;
          const newLatency = Math.max(1, Math.min(100, conn.latency + jitter));
          
          // Occasional spike
          const finalLatency = Math.random() > 0.95 ? newLatency + 20 : newLatency;

          return {
              ...conn,
              latency: Math.floor(finalLatency),
              status: finalLatency > 50 ? 'CONGESTED' : 'ACTIVE'
          };
      }));

    }, 2000);

    return () => clearInterval(interval);
  }, [isSimulating]);

  // History Tracking Effect
  useEffect(() => {
    if (!isSimulating) return;
    const interval = setInterval(() => {
        const now = new Date().toLocaleTimeString();
        
        // Track Node History
        setNodeHistory(prev => {
            const nextHistory = { ...prev };
            nodes.forEach(node => {
                if (!nextHistory[node.id]) nextHistory[node.id] = [];
                const newPoint = { timestamp: now, value: node.latency };
                nextHistory[node.id] = [...nextHistory[node.id], newPoint].slice(-20);
            });
            return nextHistory;
        });

        // Track Connection History
        setConnectionHistory(prev => {
            const nextHistory = { ...prev };
            connections.forEach(conn => {
                if (!nextHistory[conn.id]) nextHistory[conn.id] = [];
                const newPoint = { timestamp: now, value: conn.latency };
                nextHistory[conn.id] = [...nextHistory[conn.id], newPoint].slice(-20);
            });
            return nextHistory;
        });

    }, 2000);
    return () => clearInterval(interval);
  }, [nodes, connections, isSimulating]);

  const addLog = (level: 'INFO' | 'WARN' | 'ERROR', message: string, nodeName: string) => {
    setLogs(prev => [{
        timestamp: new Date().toLocaleTimeString(),
        level,
        message: `${nodeName}: ${message}`
    }, ...prev].slice(0, 50));
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId) || null;
  const selectedConnection = connections.find(c => c.id === selectedConnectionId) || null;
  
  let historyData: { timestamp: string, value: number }[] = [];
  if (selectedNodeId) {
      historyData = nodeHistory[selectedNodeId] || [];
  } else if (selectedConnectionId) {
      historyData = connectionHistory[selectedConnectionId] || [];
  }

  const onlineCount = nodes.filter(n => n.status === NodeStatus.ONLINE).length;
  const warningCount = nodes.filter(n => n.status === NodeStatus.WARNING).length;
  const criticalCount = nodes.filter(n => n.status === NodeStatus.CRITICAL || n.status === NodeStatus.OFFLINE).length;

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 font-sans overflow-hidden relative">
        
        {/* Login Modal */}
        {showLoginModal && (
            <div className="absolute inset-0 z-[3000] bg-slate-950/90 backdrop-blur flex items-center justify-center">
                <div className="bg-slate-900 p-8 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-sm">
                    <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                        <Lock className="text-blue-500"/> System Login
                    </h2>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Username</label>
                            <input name="username" type="text" className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white" required />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Password</label>
                            <input name="password" type="password" className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white" required />
                        </div>
                        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded transition-colors">
                            Authenticate
                        </button>
                        <button type="button" onClick={() => setShowLoginModal(false)} className="w-full text-slate-500 text-xs hover:text-white">
                            Continue in Simulation Mode
                        </button>
                    </form>
                </div>
            </div>
        )}

        <div className="flex-1 relative">
            
            <div className="absolute top-0 left-0 right-0 z-[1000] p-4 pointer-events-none">
                <div className="flex justify-between items-start">
                    <div className="bg-slate-900/90 backdrop-blur-md p-4 rounded-2xl border border-slate-700 shadow-2xl pointer-events-auto">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-blue-600 rounded-lg">
                                <Activity className="text-white" size={24} fill="white" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight">NetSentry ISP</h1>
                                <p className="text-xs text-slate-400">East Java Regional Monitor</p>
                            </div>
                        </div>
                        
                        <div className="flex gap-6">
                            <div>
                                <div className="text-xs text-slate-500 uppercase font-black">Online</div>
                                <div className="text-2xl font-mono text-green-400">{onlineCount}</div>
                            </div>
                            <div>
                                <div className="text-xs text-slate-500 uppercase font-black">Loss/Jitter</div>
                                <div className="text-2xl font-mono text-yellow-400">{warningCount}</div>
                            </div>
                            <div>
                                <div className="text-xs text-slate-500 uppercase font-black">Down</div>
                                <div className="text-2xl font-mono text-red-500 animate-pulse">{criticalCount}</div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 pointer-events-auto">
                        <div className="flex gap-2">
                             <div className="bg-slate-900/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-700 flex gap-1">
                                <button 
                                    onClick={() => setMapStyle('DARK')}
                                    className={`p-2 rounded-lg transition-all ${mapStyle === 'DARK' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                                    title="Dark Map"
                                >
                                    <Moon size={18} />
                                </button>
                                <button 
                                    onClick={() => setMapStyle('LIGHT')}
                                    className={`p-2 rounded-lg transition-all ${mapStyle === 'LIGHT' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                                    title="Light Map"
                                >
                                    <Sun size={18} />
                                </button>
                                <button 
                                    onClick={() => setMapStyle('SATELLITE')}
                                    className={`p-2 rounded-lg transition-all ${mapStyle === 'SATELLITE' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                                    title="Satellite Map"
                                >
                                    <Globe size={18} />
                                </button>
                             </div>

                             <div className="bg-slate-900/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-700 flex">
                                <button
                                    onClick={() => setViewMode('TOPOLOGY')}
                                    className={`p-2 rounded-lg flex items-center gap-2 text-sm font-bold transition-all ${viewMode === 'TOPOLOGY' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
                                >
                                    <Share2 size={16} /> Topology
                                </button>
                                <button
                                    onClick={() => setViewMode('TRAFFIC')}
                                    className={`p-2 rounded-lg flex items-center gap-2 text-sm font-bold transition-all ${viewMode === 'TRAFFIC' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-slate-400 hover:text-white'}`}
                                >
                                    <Zap size={16} /> Traffic Flow
                                </button>
                             </div>
                        </div>

                        <div className="bg-slate-900/90 backdrop-blur-md p-2 rounded-xl border border-slate-700 flex gap-2">
                            <button 
                                onClick={handleAddNode}
                                className="p-2 rounded-lg bg-green-600 hover:bg-green-500 text-white transition-colors"
                                title="Add New Device"
                            >
                                <Plus size={20} />
                            </button>
                            <button
                                onClick={() => {
                                    setIsLinkMode(!isLinkMode);
                                    setSelectedNodeId(null);
                                    setSelectedConnectionId(null);
                                }}
                                className={`p-2 rounded-lg transition-all ${isLinkMode ? 'bg-yellow-500 text-slate-900 shadow-[0_0_15px_rgba(234,179,8,0.5)]' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                                title={isLinkMode ? "Cancel Link Mode" : "Link Devices (Click Source then Target)"}
                            >
                                <Cable size={20} />
                            </button>
                            <button 
                                onClick={() => setShowDesignModal(true)}
                                className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                                title="System Proposal"
                            >
                                <FileText size={20} />
                            </button>
                            <button 
                                onClick={() => setIsSimulating(!isSimulating)}
                                className={`p-2 rounded-lg transition-colors ${isSimulating ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30' : 'bg-slate-700 text-slate-400'}`}
                                title={isSimulating ? "Pause Simulation" : "Resume Simulation"}
                            >
                                <Activity size={20} />
                            </button>
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
                onConnectionSelect={handleConnectionSelect}
                onConnectionUpdate={handleConnectionUpdate}
                onCreateConnection={handleCreateConnection}
                onMapClick={handleMapClick}
            />
        </div>

        <div className={`w-96 bg-slate-900 border-l border-slate-800 transition-all duration-300 transform ${selectedNodeId || selectedConnectionId ? 'translate-x-0' : 'translate-x-full absolute right-0'}`}>
            <StatsPanel 
                node={selectedNode} 
                connection={selectedConnection}
                allNodes={nodes}
                history={historyData}
                logs={logs.filter(l => selectedNode ? l.message.includes(selectedNode.name) : true)}
                onClose={() => { setSelectedNodeId(null); setSelectedConnectionId(null); }}
                onEdit={handleEditNode}
                onConnectionUpdate={handleConnectionUpdate}
            />
        </div>

        {showDesignModal && <SystemDesignModal onClose={() => setShowDesignModal(false)} />}
        {showDeviceModal && (
            <DeviceModal 
                node={editingNode} 
                nodes={nodes}
                connections={connections}
                onSave={handleSaveNode} 
                onDelete={handleDeleteNode}
                onClose={() => setShowDeviceModal(false)} 
            />
        )}
    </div>
  );
}

export default App;