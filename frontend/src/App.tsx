
import React, { useState, useEffect } from 'react';
import NetworkMap from './components/NetworkMap';
import StatsPanel from './components/StatsPanel';
import SystemDesignModal from './components/SystemDesignModal';
import DeviceModal from './components/DeviceModal';
import { NetworkNode, NodeStatus, LogEntry, ViewMode, Connection, MapStyle } from './types';
// Fix: Added missing 'Zap' import which was used in the Traffic Flow button
import { Activity, FileText, Plus, Moon, Sun, Globe, Share2, Cable, Zap } from 'lucide-react';
import { io } from 'socket.io-client';

function App() {
  const [nodes, setNodes] = useState<NetworkNode[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [nodeHistory, setNodeHistory] = useState<Record<string, { timestamp: string, value: number }[]>>({});
  const [connectionHistory, setConnectionHistory] = useState<Record<string, { timestamp: string, value: number }[]>>({});
  
  // UI States
  const [showDesignModal, setShowDesignModal] = useState(false);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [editingNode, setEditingNode] = useState<Partial<NetworkNode> | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('TOPOLOGY');
  const [mapStyle, setMapStyle] = useState<MapStyle>('DARK');
  const [isLinkMode, setIsLinkMode] = useState(false);

  // REAL BACKEND INTEGRATION
  useEffect(() => {
      const initConnection = async () => {
          try {
              const apiUrl = window.location.origin.includes('localhost') ? 'http://localhost:3001/api/nodes' : '/api/nodes';
              const res = await fetch(apiUrl);
              
              if (!res.ok) {
                  throw new Error('Backend unavailable');
              }

              const dbNodes = await res.json();
              if (Array.isArray(dbNodes)) {
                  console.log("Connected to Real Backend.");
                  
                  const mappedNodes = dbNodes.map((n: any) => ({
                    id: n.id,
                    name: n.name,
                    ipAddress: n.ip_address,
                    type: n.type,
                    location: { lat: parseFloat(n.location_lat), lng: parseFloat(n.location_lng) },
                    status: (n.status || 'OFFLINE') as NodeStatus,
                    latency: n.latency || 0,
                    cpuLoad: 0, memoryUsage: 0, voltage: 0, temperature: 0, 
                    uptime: '0', txRate: 0, rxRate: 0, packetLoss: 0, activePeers: 0,
                    boardName: n.model || 'Unknown', version: 'Unknown', region: 'Default'
                }));
                setNodes(mappedNodes);

                const socketUrl = window.location.origin.includes('localhost') ? 'http://localhost:3001' : '/';
                const socket = io(socketUrl);

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
              console.error("Critical: Could not connect to network management plane.", e);
              addLog('ERROR', 'Backend disconnected. Real-time updates paused.', 'System');
          }
      };

      initConnection();
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
          status: NodeStatus.OFFLINE,
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
          latency: 0,
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
    setNodes(prev => {
      const exists = prev.find(n => n.id === node.id);
      if (exists) return prev.map(n => n.id === node.id ? node : n);
      return [...prev, node];
    });

    const apiUrl = window.location.origin.includes('localhost') ? 'http://localhost:3001/api/nodes' : '/api/nodes';
    fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: node.name,
            ip_address: node.ipAddress,
            type: node.type,
            location_lat: node.location.lat,
            location_lng: node.location.lng,
            snmp_community: node.snmpCommunity
        })
    }).catch(err => console.error("Failed to persist node change", err));

    if (uplinkId !== undefined) {
        setConnections(prev => {
            const cleanConnections = prev.filter(c => c.target !== node.id);
            if (uplinkId) {
                return [...cleanConnections, {
                    id: `conn-${Date.now()}`,
                    source: uplinkId,
                    target: node.id,
                    status: 'ACTIVE',
                    latency: 0,
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

  // History tracking for real-time charts
  useEffect(() => {
    const interval = setInterval(() => {
        const now = new Date().toLocaleTimeString();
        
        setNodeHistory(prev => {
            const nextHistory = { ...prev };
            nodes.forEach(node => {
                if (!nextHistory[node.id]) nextHistory[node.id] = [];
                const newPoint = { timestamp: now, value: node.latency };
                nextHistory[node.id] = [...nextHistory[node.id], newPoint].slice(-20);
            });
            return nextHistory;
        });

        setConnectionHistory(prev => {
            const nextHistory = { ...prev };
            connections.forEach(conn => {
                if (!nextHistory[conn.id]) nextHistory[conn.id] = [];
                const newPoint = { timestamp: now, value: conn.latency };
                nextHistory[conn.id] = [...nextHistory[conn.id], newPoint].slice(-20);
            });
            return nextHistory;
        });

    }, 5000);
    return () => clearInterval(interval);
  }, [nodes, connections]);

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
                                <button onClick={() => setMapStyle('DARK')} className={`p-2 rounded-lg transition-all ${mapStyle === 'DARK' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`} title="Dark Map"><Moon size={18} /></button>
                                <button onClick={() => setMapStyle('LIGHT')} className={`p-2 rounded-lg transition-all ${mapStyle === 'LIGHT' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`} title="Light Map"><Sun size={18} /></button>
                                <button onClick={() => setMapStyle('SATELLITE')} className={`p-2 rounded-lg transition-all ${mapStyle === 'SATELLITE' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`} title="Satellite Map"><Globe size={18} /></button>
                             </div>

                             <div className="bg-slate-900/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-700 flex">
                                <button onClick={() => setViewMode('TOPOLOGY')} className={`p-2 rounded-lg flex items-center gap-2 text-sm font-bold transition-all ${viewMode === 'TOPOLOGY' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}><Share2 size={16} /> Topology</button>
                                <button onClick={() => setViewMode('TRAFFIC')} className={`p-2 rounded-lg flex items-center gap-2 text-sm font-bold transition-all ${viewMode === 'TRAFFIC' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-slate-400 hover:text-white'}`}><Zap size={16} /> Traffic Flow</button>
                             </div>
                        </div>

                        <div className="bg-slate-900/90 backdrop-blur-md p-2 rounded-xl border border-slate-700 flex gap-2">
                            <button onClick={handleAddNode} className="p-2 rounded-lg bg-green-600 hover:bg-green-500 text-white transition-colors" title="Add New Device"><Plus size={20} /></button>
                            <button onClick={() => { setIsLinkMode(!isLinkMode); setSelectedNodeId(null); setSelectedConnectionId(null); }} className={`p-2 rounded-lg transition-all ${isLinkMode ? 'bg-yellow-500 text-slate-900 shadow-[0_0_15px_rgba(234,179,8,0.5)]' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`} title={isLinkMode ? "Cancel Link Mode" : "Link Devices (Click Source then Target)"}><Cable size={20} /></button>
                            <button onClick={() => setShowDesignModal(true)} className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors" title="System Proposal"><FileText size={20} /></button>
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
