import React, { useState, useEffect } from 'react';
import { NetworkNode, Connection, AIAnalysisResult, LogEntry } from '../types';
import { Activity, Cpu, Server, Sparkles, Thermometer, ArrowUp, ArrowDown, Zap, Edit, Clock, ArrowRightLeft, Wifi, FileText } from 'lucide-react';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer, CartesianGrid, Brush } from 'recharts';
import { analyzeNetworkNode } from '../services/geminiService';
import { Socket } from 'socket.io-client';

interface StatsPanelProps {
  node: NetworkNode | null;
  connection?: Connection | null;
  allNodes: NetworkNode[];
  logs: LogEntry[];
  onClose: () => void;
  onEdit: (node: NetworkNode) => void;
  onConnectionUpdate?: (connId: string, updates: Partial<Connection>) => void;
  socket: Socket;
}

type TimeRange = '1h' | '6h' | '24h';
const TIME_RANGES: TimeRange[] = ['1h', '6h', '24h'];

const StatsPanel: React.FC<StatsPanelProps> = ({ node, connection, allNodes, logs, onClose, onEdit, socket }) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null);
  const [chartData, setChartData] = useState<{ timestamp: string, value: number }[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRange>('1h');
  const [trafficData, setTrafficData] = useState<{ timestamp: string, tx: number, rx: number }[]>([]);
  const [logFilter, setLogFilter] = useState('');
  
  // Real-time state (overrides node prop for high-frequency updates)
  const [liveMetrics, setLiveMetrics] = useState<Partial<NetworkNode>>({});
  const [deviceLogs, setDeviceLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    // Reset chart data when selection changes
    setChartData([]);
    setTrafficData([]);
    setDeviceLogs([]);
    
    if (node) {
        // 1. Subscribe to Node Room
        socket.emit('subscribe_node', node.id);

        const handleUpdate = (update: any) => {
            if (update.nodeId === node.id) {
                setLiveMetrics(update);
                
                const timeLabel = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
                
                if (timeRange === '1h') {
                    // Update Latency Chart
                    setChartData(prev => [...prev.slice(-59), {
                        timestamp: timeLabel,
                        value: update.latency || 0
                    }]);

                    // Update Traffic Chart
                    setTrafficData(prev => [...prev.slice(-59), {
                        timestamp: timeLabel,
                        tx: update.txRate || 0,
                        rx: update.rxRate || 0
                    }]);
                }
            }
        };
        socket.on('node:full_update', handleUpdate);

        // 2. Fetch Historical Data
        const apiUrl = window.location.origin.includes('localhost') ? 'http://localhost:3001' : '';
        fetch(`${apiUrl}/api/nodes/${node.id}/history?range=${timeRange}`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    // Process Latency
                    const latencyPoints = data
                        .filter((d: any) => d.field === 'latency')
                        .map((d: any) => ({
                            timestamp: new Date(d.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                            value: parseFloat(d.value.toFixed(2)) // Keep decimal precision
                        }));
                    setChartData(latencyPoints);

                    // Process Traffic
                    const txPoints = data.filter((d: any) => d.field === 'tx_rate');
                    const rxPoints = data.filter((d: any) => d.field === 'rx_rate');
                    
                    // Merge TX and RX by timestamp (assuming aligned timestamps from Influx aggregateWindow)
                    const trafficPoints = txPoints.map((tx: any, i: number) => ({
                        timestamp: new Date(tx.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                        tx: parseFloat(tx.value.toFixed(2)),
                        rx: parseFloat(rxPoints[i]?.value.toFixed(2) || 0)
                    }));
                    setTrafficData(trafficPoints);
                }
            })
            .catch(err => console.error("Failed to fetch history:", err));

        // 3. Fetch Device Logs
        fetch(`${apiUrl}/api/nodes/${node.id}/logs`)
            .then(res => res.json())
            .then(fetchedLogs => {
                if (Array.isArray(fetchedLogs)) {
                    setDeviceLogs(fetchedLogs);
                }
            })
            .catch(err => console.error("Failed to fetch logs:", err));

        return () => {
            socket.emit('unsubscribe_node', node.id);
            socket.off('node:full_update', handleUpdate);
            setLiveMetrics({});
        };
    }
  }, [node?.id, timeRange, socket]);

  const handleAIAnalyze = async () => {
    if (!node) return;
    setAnalyzing(true);
    setAnalysis(null);
    try {
        const mergedNode = { ...node, ...liveMetrics };
        const result = await analyzeNetworkNode(mergedNode, []); 
        setAnalysis(result);
    } catch (e) { console.error(e); } 
    finally { setAnalyzing(false); }
  };

  // --- CONNECTION VIEW ---
  if (connection && !node) {
      const sourceNode = allNodes.find(n => n.id === connection.source);
      const targetNode = allNodes.find(n => n.id === connection.target);

      return (
        <div className="h-full flex flex-col p-6 overflow-y-auto custom-scrollbar">
             {/* Header */}
             <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-100 leading-tight flex items-center gap-2">
                      <ArrowRightLeft className="text-blue-400" /> Link Details
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded bg-slate-800 ${connection.status === 'CONGESTED' ? 'text-red-400' : 'text-green-400'} border border-slate-700`}>
                        {connection.status}
                    </span>
                    <span className="text-slate-500 text-xs font-mono">{connection.id}</span>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors">✕</button>
            </div>

            {/* Connection Topology Card */}
            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 mb-6">
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-900 rounded border border-slate-700">
                             <Server size={16} className="text-slate-400"/>
                        </div>
                        <div>
                             <div className="text-xs text-slate-500 font-bold uppercase">Source</div>
                             <div className="text-sm font-bold text-white">{sourceNode?.name || 'Unknown'}</div>
                             <div className="text-xs text-slate-400 font-mono">{sourceNode?.ipAddress}</div>
                        </div>
                    </div>
                    
                    <div className="flex items-center justify-center">
                        <div className="h-8 w-0.5 bg-slate-700"></div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-900 rounded border border-slate-700">
                             <Wifi size={16} className="text-slate-400"/>
                        </div>
                        <div>
                             <div className="text-xs text-slate-500 font-bold uppercase">Target</div>
                             <div className="text-sm font-bold text-white">{targetNode?.name || 'Unknown'}</div>
                             <div className="text-xs text-slate-400 font-mono">{targetNode?.ipAddress}</div>
                        </div>
                    </div>
                </div>
            </div>

             {/* Connection Latency History Chart (Uses Mock Data for now as no backend connection history endpoint provided) */}
             <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-700 mb-6 flex-1 min-h-[300px] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <Clock size={14}/> Latency History
                    </h3>
                </div>

                <div className="flex items-center justify-center h-full text-slate-600 text-sm italic">
                    Historical data not available for passive links
                </div>
             </div>
        </div>
      );
  }

  // --- NODE VIEW ---
  if (!node) return null;

  // Merge static node data with live updates
  const displayNode = { ...node, ...liveMetrics };

  return (
    <div className="h-full flex flex-col p-6 overflow-y-auto custom-scrollbar">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-100 leading-tight">{displayNode.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs font-bold px-2 py-0.5 rounded bg-slate-800 border border-slate-700 ${displayNode.status === 'ONLINE' ? 'text-green-400' : 'text-red-400'}`}>{displayNode.status}</span>
            <span className="text-slate-500 text-xs font-mono">{displayNode.ipAddress}</span>
          </div>
        </div>
        <div className="flex gap-2">
            <button onClick={() => onEdit(displayNode)} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-blue-400 transition-colors">
                <Edit size={18} />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors">✕</button>
        </div>
      </div>

      {/* Device Details */}
      <div className="grid grid-cols-3 gap-2 mb-4 text-[10px] text-slate-400 bg-slate-800/30 p-2 rounded border border-slate-700/50">
          <div><span className="font-bold text-slate-500 block">MODEL</span> {displayNode.boardName || 'Unknown'}</div>
          <div><span className="font-bold text-slate-500 block">VERSION</span> {displayNode.version || 'Unknown'}</div>
          <div><span className="font-bold text-slate-500 block">UPTIME</span> {displayNode.uptime || '0s'}</div>
      </div>

      {/* Traffic Section (Real Data Only) */}
      <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 mb-4">
          <div className="flex justify-between items-center mb-3">
             <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Interface Traffic</h3>
             <span className="text-[10px] text-slate-500 font-mono">{displayNode.wanInterface || 'ether1'}</span>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="flex flex-col">
                  <span className="text-xs text-slate-500 flex items-center gap-1"><ArrowUp size={12}/> TX</span>
                  <span className="text-xl font-mono text-blue-400">{displayNode.txRate} <span className="text-xs text-slate-600">Mbps</span></span>
              </div>
              <div className="flex flex-col">
                  <span className="text-xs text-slate-500 flex items-center gap-1"><ArrowDown size={12}/> RX</span>
                  <span className="text-xl font-mono text-green-400">{displayNode.rxRate} <span className="text-xs text-slate-600">Mbps</span></span>
              </div>
          </div>
          
          {/* Traffic History Chart */}
          <div className="w-full h-[150px]">
            {trafficData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trafficData}>
                        <defs>
                            <linearGradient id="txGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="rxGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis dataKey="timestamp" tick={{ fill: '#64748b', fontSize: 9 }} tickLine={false} axisLine={false} minTickGap={30}/>
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} itemStyle={{ fontSize: '12px' }}/>
                        <Area type="monotone" dataKey="tx" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#txGradient)" isAnimationActive={false} name="TX (Mbps)" />
                        <Area type="monotone" dataKey="rx" stroke="#22c55e" strokeWidth={2} fillOpacity={1} fill="url(#rxGradient)" isAnimationActive={false} name="RX (Mbps)" />
                    </AreaChart>
                </ResponsiveContainer>
            ) : (
                <div className="flex items-center justify-center h-full text-slate-600 text-xs italic">
                    Waiting for traffic data...
                </div>
            )}
          </div>
      </div>

      {/* Latency Chart */}
      <div className="bg-slate-800/30 p-3 rounded-lg border border-slate-700 mb-4 min-h-[200px] flex flex-col">
        <div className="flex justify-between items-center mb-2">
             <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Activity size={12}/> Latency
            </h3>
            <div className="flex gap-1">
                {TIME_RANGES.map(r => (
                    <button 
                        key={r}
                        onClick={() => setTimeRange(r)}
                        className={`text-[10px] px-2 py-0.5 rounded ${timeRange === r ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}
                    >
                        {r.toUpperCase()}
                    </button>
                ))}
            </div>
        </div>
        
        <div className="flex-1 w-full min-h-[150px]">
            {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                        <defs>
                            <linearGradient id="nodeLatency" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis dataKey="timestamp" tick={{ fill: '#64748b', fontSize: 9 }} tickLine={false} axisLine={false} minTickGap={30}/>
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} itemStyle={{ color: '#22c55e' }}/>
                        <Area type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={2} fillOpacity={1} fill="url(#nodeLatency)" isAnimationActive={false} />
                        <Brush dataKey="timestamp" height={15} stroke="#334155" fill="#1e293b" />
                    </AreaChart>
                </ResponsiveContainer>
            ) : (
                <div className="flex items-center justify-center h-full text-slate-600 text-xs italic">
                    No history data available
                </div>
            )}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-slate-800/30 p-3 rounded-lg border border-slate-700">
          <div className="flex items-center gap-2 text-slate-400 mb-1 text-xs"><Cpu size={14} /> CPU Load</div>
          <div className="w-full bg-slate-700 h-2 rounded-full mt-2">
             <div className={`h-full rounded-full ${displayNode.cpuLoad! > 80 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${displayNode.cpuLoad}%` }}></div>
          </div>
          <div className="text-right text-xs mt-1 text-slate-400">{displayNode.cpuLoad}%</div>
        </div>

        <div className="bg-slate-800/30 p-3 rounded-lg border border-slate-700">
          <div className="flex items-center gap-2 text-slate-400 mb-1 text-xs"><Server size={14} /> Memory</div>
          <div className="w-full bg-slate-700 h-2 rounded-full mt-2">
             <div className="h-full rounded-full bg-purple-500" style={{ width: `${displayNode.memoryUsage}%` }}></div>
          </div>
          <div className="text-right text-xs mt-1 text-slate-400">{displayNode.memoryUsage}%</div>
        </div>

        <div className="bg-slate-800/30 p-3 rounded-lg border border-slate-700">
          <div className="flex items-center gap-2 text-slate-400 mb-1 text-xs"><Zap size={14} /> Voltage</div>
          <div className="text-lg font-mono text-white">{displayNode.voltage}V</div>
        </div>

        <div className="bg-slate-800/30 p-3 rounded-lg border border-slate-700">
          <div className="flex items-center gap-2 text-slate-400 mb-1 text-xs"><Thermometer size={14} /> Temp</div>
          <div className="text-lg font-mono text-white">{displayNode.temperature}°C</div>
        </div>
      </div>

      {/* AI Assistant */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
             <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Sparkles className="text-purple-400" size={16} /> AI Diagnosis
             </h3>
             <button onClick={handleAIAnalyze} disabled={analyzing} className="px-3 py-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs rounded-full">
                {analyzing ? 'Diagnosing...' : 'Analyze Now'}
             </button>
        </div>
        
        {analysis && (
            <div className="bg-slate-800/80 rounded-xl p-4 border border-purple-500/30">
                <p className="text-sm text-slate-200 mb-2 border-l-2 border-purple-500 pl-3">{analysis.summary}</p>
                <ul className="space-y-1">
                    {analysis.recommendations.map((rec, i) => (
                        <li key={i} className="text-xs text-purple-200 bg-purple-500/10 p-1 rounded font-mono">{rec}</li>
                    ))}
                </ul>
            </div>
        )}
      </div>
      {/* Logs Section with Grep */}
      <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-700 mb-6">
          <div className="flex justify-between items-center mb-3">
             <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <FileText size={12}/> System Logs
             </h3>
             <input 
                type="text" 
                placeholder="grep..." 
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-white focus:border-blue-500 outline-none w-24"
             />
          </div>
          <div className="max-h-32 overflow-y-auto font-mono text-[10px] space-y-1 custom-scrollbar">
              {deviceLogs.filter(l => 
                  l.message.toLowerCase().includes(logFilter.toLowerCase()) || 
                  l.level.toLowerCase().includes(logFilter.toLowerCase())
              ).length > 0 ? (
                  deviceLogs.filter(l => 
                      l.message.toLowerCase().includes(logFilter.toLowerCase()) || 
                      l.level.toLowerCase().includes(logFilter.toLowerCase())
                  ).map((log, i) => (
                      <div key={i} className="flex gap-2 text-slate-300 border-b border-slate-800/50 pb-0.5 last:border-0">
                          <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
                          <span className={`${log.level === 'ERROR' ? 'text-red-400' : log.level === 'WARN' ? 'text-yellow-400' : 'text-slate-300'} break-all`}>
                              {log.message}
                          </span>
                      </div>
                  ))
              ) : (
                  <div className="text-slate-600 italic text-center py-2">No logs found</div>
              )}
          </div>
      </div>
    </div>
  );
};

export default StatsPanel;