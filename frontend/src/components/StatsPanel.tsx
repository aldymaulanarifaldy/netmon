
import React, { useState, useEffect } from 'react';
import { NetworkNode, NodeStatus, LogEntry, AIAnalysisResult, Connection } from '../types';
import { Activity, Cpu, Server, Wifi, AlertTriangle, Sparkles, Thermometer, Radio, ArrowUp, ArrowDown, Zap, Edit, ArrowRightLeft, Clock } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Brush, CartesianGrid } from 'recharts';
import { analyzeNetworkNode } from '../services/geminiService';

interface StatsPanelProps {
  node: NetworkNode | null;
  connection?: Connection | null; // New optional prop for selected connection
  allNodes: NetworkNode[]; // Needed to resolve connection source/target names
  history: { timestamp: string, value: number }[];
  logs: LogEntry[];
  onClose: () => void;
  onEdit: (node: NetworkNode) => void;
  onConnectionUpdate?: (connId: string, updates: Partial<Connection>) => void;
}

type TimeRange = 'LIVE' | '1H' | '6H' | '12H' | '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL';

const TIME_RANGES: TimeRange[] = ['LIVE', '1H', '6H', '12H', '1D', '1W', '1M', '3M', '6M', '1Y', 'ALL'];

const generateMockHistory = (range: TimeRange, baseValue: number) => {
    const now = new Date();
    const points = [];
    let count = 20;
    let interval = 1000 * 60; // 1 min

    switch(range) {
      case '1H': count = 60; interval = 1000 * 60; break; // 1 min resolution
      case '6H': count = 72; interval = 1000 * 60 * 5; break; // 5 min
      case '12H': count = 72; interval = 1000 * 60 * 10; break; // 10 min
      case '1D': count = 96; interval = 1000 * 60 * 15; break; // 15 min
      case '1W': count = 84; interval = 1000 * 60 * 60 * 2; break; // 2 hours
      case '1M': count = 30; interval = 1000 * 60 * 60 * 24; break; // 1 day
      case '3M': count = 90; interval = 1000 * 60 * 60 * 24; break;
      case '6M': count = 180; interval = 1000 * 60 * 60 * 24; break;
      case '1Y': count = 52; interval = 1000 * 60 * 60 * 24 * 7; break; // 1 week
      case 'ALL': count = 100; interval = 1000 * 60 * 60 * 24 * 30; break; // 1 month
      default: count = 20;
    }

    for (let i = count; i >= 0; i--) {
      const time = new Date(now.getTime() - (i * interval));
      // Randomize value around base with some spikes/noise
      let variance = range === 'LIVE' ? 5 : 15;
      let val = baseValue + (Math.random() * variance - (variance/2));
      
      // Add occasional spikes
      if (Math.random() > 0.95) val += (baseValue * 0.5); 
      
      if (val < 1) val = 1; // Floor
      
      let timeStr = '';
      // Format logic
      if (['1M', '3M', '6M', '1Y', 'ALL'].includes(range)) {
           timeStr = time.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
           if (range === '1Y' || range === 'ALL') {
               timeStr = time.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
           }
      } else if (['1W'].includes(range)) {
           timeStr = time.toLocaleDateString(undefined, { weekday: 'short', hour: 'numeric' });
      } else {
           timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }

      points.push({
        timestamp: timeStr,
        value: Math.floor(val),
        rawTime: time.getTime()
      });
    }
    return points;
};

const TimeRangeSelector = ({ selected, onChange }: { selected: TimeRange, onChange: (r: TimeRange) => void }) => (
    <div className="flex gap-2 overflow-x-auto pb-2 mb-3 no-scrollbar mask-gradient-right">
        {TIME_RANGES.map(r => (
            <button 
                key={r} 
                onClick={() => onChange(r)}
                className={`
                    px-3 py-1 text-[10px] font-bold rounded-full whitespace-nowrap transition-all
                    ${selected === r 
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' 
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 border border-slate-700'}
                `}
            >
                {r}
            </button>
        ))}
    </div>
);

const StatsPanel: React.FC<StatsPanelProps> = ({ node, connection, allNodes, history, logs, onClose, onEdit, onConnectionUpdate }) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('LIVE');
  const [chartData, setChartData] = useState<{ timestamp: string, value: number }[]>([]);

  // Reset range when selection changes
  useEffect(() => {
      setTimeRange('LIVE');
  }, [node?.id, connection?.id]);

  // Compute chart data based on selection
  useEffect(() => {
      if (timeRange === 'LIVE') {
          setChartData(history);
      } else {
          // Generate mock history for non-live ranges
          const baseLatency = node ? node.latency : (connection ? connection.latency : 5);
          setChartData(generateMockHistory(timeRange, baseLatency));
      }
  }, [timeRange, history, node, connection]);

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

                    {/* Flow Direction Control */}
                    <div className="border-t border-slate-700 pt-3 mt-1 flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-400 uppercase">Flow Direction</span>
                        <div className="flex bg-slate-900 rounded p-1 border border-slate-700">
                             <button 
                                onClick={() => onConnectionUpdate && onConnectionUpdate(connection.id, { direction: 'FORWARD' })}
                                className={`px-3 py-1 text-xs rounded transition-colors ${!connection.direction || connection.direction === 'FORWARD' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                             >
                                Forward
                             </button>
                             <button 
                                onClick={() => onConnectionUpdate && onConnectionUpdate(connection.id, { direction: 'REVERSE' })}
                                className={`px-3 py-1 text-xs rounded transition-colors ${connection.direction === 'REVERSE' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                             >
                                Reverse
                             </button>
                        </div>
                    </div>
                </div>
            </div>

             {/* Connection Latency History Chart */}
             <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-700 mb-6 flex-1 min-h-[300px] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <Clock size={14}/> Latency History
                    </h3>
                </div>

                <TimeRangeSelector selected={timeRange} onChange={setTimeRange} />

                <div className="flex-1 w-full min-h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                            <defs>
                                <linearGradient id="connLatency" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis 
                                dataKey="timestamp" 
                                tick={{ fill: '#64748b', fontSize: 10 }} 
                                tickLine={false}
                                axisLine={false}
                                minTickGap={30}
                            />
                            <YAxis 
                                hide 
                                domain={[0, 'auto']} 
                            />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9', fontSize: '12px' }}
                                itemStyle={{ color: '#3b82f6' }}
                                labelStyle={{ color: '#94a3b8', marginBottom: '0.25rem' }}
                                formatter={(value: number) => [`${value}ms`, 'Latency']}
                            />
                            <Area type="monotone" dataKey="value" stroke="#3b82f6" fillOpacity={1} fill="url(#connLatency)" isAnimationActive={timeRange === 'LIVE'} />
                            {timeRange !== 'LIVE' && (
                                <Brush 
                                    dataKey="timestamp" 
                                    height={20} 
                                    stroke="#334155" 
                                    fill="#1e293b" 
                                    tickFormatter={() => ''}
                                />
                            )}
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
                <div className="text-center mt-2 border-t border-slate-800 pt-2">
                    <span className="text-xs text-slate-500 mr-2">Average:</span>
                    <span className="text-xl font-mono text-white">
                        {Math.round(chartData.reduce((acc, curr) => acc + curr.value, 0) / (chartData.length || 1))}
                    </span>
                    <span className="text-xs text-slate-500 ml-1">ms</span>
                </div>
             </div>
        </div>
      );
  }

  // --- NODE VIEW ---
  if (!node) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500">
        <div className="text-center">
            <Radio className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Select a device or link to view details</p>
        </div>
      </div>
    );
  }

  const handleAIAnalyze = async () => {
    setAnalyzing(true);
    setAnalysis(null);
    try {
        const result = await analyzeNetworkNode(node, logs.slice(0, 10)); // Analyze recent logs
        setAnalysis(result);
    } catch (e) {
        console.error(e);
    } finally {
        setAnalyzing(false);
    }
  };

  const statusColor = 
    node.status === NodeStatus.ONLINE ? 'text-green-400' :
    node.status === NodeStatus.WARNING ? 'text-yellow-400' :
    node.status === NodeStatus.CRITICAL ? 'text-red-400' : 'text-slate-400';

  return (
    <div className="h-full flex flex-col p-6 overflow-y-auto custom-scrollbar">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-100 leading-tight">{node.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs font-bold px-2 py-0.5 rounded bg-slate-800 ${statusColor} border border-slate-700`}>{node.status}</span>
            <span className="text-slate-500 text-xs font-mono">{node.ipAddress}</span>
          </div>
        </div>
        <div className="flex gap-2">
            <button onClick={() => onEdit(node)} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-blue-400 transition-colors" title="Edit Device">
                <Edit size={18} />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors">✕</button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 text-xs text-slate-400 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
         <div>
            <span className="block uppercase tracking-wider font-bold text-slate-500 mb-1">Model</span>
            <span className="text-white font-mono">{node.boardName}</span>
         </div>
         <div>
            <span className="block uppercase tracking-wider font-bold text-slate-500 mb-1">Firmware</span>
            <span className="text-white font-mono">v{node.version}</span>
         </div>
         <div>
            <span className="block uppercase tracking-wider font-bold text-slate-500 mb-1">Role</span>
            <span className="text-white">{node.type}</span>
         </div>
         <div>
            <span className="block uppercase tracking-wider font-bold text-slate-500 mb-1">Uptime</span>
            <span className="text-white font-mono">{node.uptime}</span>
         </div>
      </div>

      {/* Interface Traffic (TX/RX) */}
      <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 mb-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Interface Traffic (ether1)</h3>
          <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col">
                  <span className="text-xs text-slate-500 flex items-center gap-1"><ArrowUp size={12}/> TX Rate</span>
                  <span className="text-xl font-mono text-blue-400">{node.txRate} <span className="text-xs text-slate-600">Mbps</span></span>
              </div>
              <div className="flex flex-col">
                  <span className="text-xs text-slate-500 flex items-center gap-1"><ArrowDown size={12}/> RX Rate</span>
                  <span className="text-xl font-mono text-green-400">{node.rxRate} <span className="text-xs text-slate-600">Mbps</span></span>
              </div>
          </div>
          {/* Mini Bandwidth Chart (Simulated) */}
          <div className="h-16 mt-3 w-full opacity-50">
             <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={[
                     {v: node.txRate * 0.8}, {v: node.txRate}, {v: node.txRate * 0.9}, 
                     {v: node.rxRate * 0.7}, {v: node.rxRate}, {v: node.rxRate * 1.1}
                 ]}>
                     <Bar dataKey="v" fill="#3b82f6" radius={[2,2,0,0]} />
                 </BarChart>
             </ResponsiveContainer>
          </div>
      </div>

      {/* Node History Chart (Latency) */}
      <div className="bg-slate-800/30 p-3 rounded-lg border border-slate-700 mb-4 min-h-[250px] flex flex-col">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
            <Activity size={12}/> Latency History
        </h3>

        <TimeRangeSelector selected={timeRange} onChange={setTimeRange} />

        <div className="flex-1 w-full min-h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                    <defs>
                        <linearGradient id="nodeLatency" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis 
                        dataKey="timestamp" 
                        tick={{ fill: '#64748b', fontSize: 9 }} 
                        tickLine={false} 
                        axisLine={false}
                        minTickGap={25}
                    />
                    <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9', fontSize: '12px' }}
                        itemStyle={{ color: '#22c55e' }}
                        labelStyle={{ color: '#94a3b8', marginBottom: '0.25rem' }}
                        formatter={(value: number) => [`${value}ms`, 'Latency']}
                    />
                    <Area type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={2} fillOpacity={1} fill="url(#nodeLatency)" isAnimationActive={timeRange === 'LIVE'} />
                    {timeRange !== 'LIVE' && (
                        <Brush 
                            dataKey="timestamp" 
                            height={15} 
                            stroke="#334155" 
                            fill="#1e293b" 
                            tickFormatter={() => ''}
                        />
                    )}
                </AreaChart>
            </ResponsiveContainer>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-slate-800/30 p-3 rounded-lg border border-slate-700">
          <div className="flex items-center gap-2 text-slate-400 mb-1 text-xs">
            <Activity size={14} /> Latency
          </div>
          <div className={`text-lg font-mono ${node.latency > 100 ? 'text-red-400' : 'text-white'}`}>{node.latency}ms</div>
        </div>
        
        <div className="bg-slate-800/30 p-3 rounded-lg border border-slate-700">
          <div className="flex items-center gap-2 text-slate-400 mb-1 text-xs">
            <AlertTriangle size={14} /> Packet Loss
          </div>
          <div className={`text-lg font-mono ${node.packetLoss > 0 ? 'text-red-400' : 'text-white'}`}>{node.packetLoss}%</div>
        </div>

        <div className="bg-slate-800/30 p-3 rounded-lg border border-slate-700">
          <div className="flex items-center gap-2 text-slate-400 mb-1 text-xs">
            <Cpu size={14} /> CPU Load
          </div>
          <div className="w-full bg-slate-700 h-2 rounded-full mt-2">
             <div className={`h-full rounded-full ${node.cpuLoad > 80 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${node.cpuLoad}%` }}></div>
          </div>
          <div className="text-right text-xs mt-1 text-slate-400">{node.cpuLoad}%</div>
        </div>

        <div className="bg-slate-800/30 p-3 rounded-lg border border-slate-700">
          <div className="flex items-center gap-2 text-slate-400 mb-1 text-xs">
            <Server size={14} /> RAM Usage
          </div>
          <div className="w-full bg-slate-700 h-2 rounded-full mt-2">
             <div className="h-full rounded-full bg-purple-500" style={{ width: `${node.memoryUsage}%` }}></div>
          </div>
          <div className="text-right text-xs mt-1 text-slate-400">{node.memoryUsage}%</div>
        </div>

        <div className="bg-slate-800/30 p-3 rounded-lg border border-slate-700">
          <div className="flex items-center gap-2 text-slate-400 mb-1 text-xs">
            <Zap size={14} /> Voltage
          </div>
          <div className="text-lg font-mono text-white">{node.voltage}V</div>
        </div>

        <div className="bg-slate-800/30 p-3 rounded-lg border border-slate-700">
          <div className="flex items-center gap-2 text-slate-400 mb-1 text-xs">
            <Thermometer size={14} /> Temp
          </div>
          <div className="text-lg font-mono text-white">{node.temperature}°C</div>
        </div>
      </div>

      {/* AI Analysis Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
             <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Sparkles className="text-purple-400" size={16} /> Engineer Assistant
             </h3>
             <button 
                onClick={handleAIAnalyze}
                disabled={analyzing}
                className="px-3 py-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs rounded-full flex items-center gap-1 transition-colors"
             >
                {analyzing ? 'Diagnosing...' : 'Diagnose'}
             </button>
        </div>
        
        {analysis && (
            <div className="bg-slate-800/80 rounded-xl p-4 border border-purple-500/30 animate-fade-in">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-slate-400 uppercase tracking-wider">RouterOS Health</span>
                    <div className={`px-2 py-0.5 rounded text-xs font-bold ${analysis.riskScore > 50 ? 'bg-red-500/20 text-red-300' : 'bg-green-500/20 text-green-300'}`}>
                        Risk: {analysis.riskScore}/100
                    </div>
                </div>
                <p className="text-sm text-slate-200 mb-4 leading-relaxed border-l-2 border-purple-500 pl-3">
                    {analysis.summary}
                </p>
                <div>
                    <span className="text-xs text-slate-400 uppercase tracking-wider block mb-2">Actions</span>
                    <ul className="space-y-2">
                        {analysis.recommendations.map((rec, i) => (
                            <li key={i} className="text-xs text-purple-200 bg-purple-500/10 p-2 rounded border border-purple-500/20 flex gap-2">
                                <span className="text-purple-400 font-bold">/</span> <span className="font-mono">{rec}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        )}
      </div>

      {/* Live Logs */}
      <div className="flex-1 bg-slate-900 rounded-xl border border-slate-700 overflow-hidden flex flex-col min-h-[200px]">
        <div className="p-3 bg-slate-800/50 border-b border-slate-700">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">RouterOS Logs</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-xs">
            {logs.length === 0 ? (
                <div className="text-slate-600 p-2 italic">buffer is empty...</div>
            ) : (
                logs.map((log, idx) => (
                    <div key={idx} className="flex gap-2 border-b border-slate-800 pb-1 mb-1 last:border-0">
                        <span className="text-slate-500 shrink-0">{log.timestamp}</span>
                        <span className={
                            log.level === 'ERROR' ? 'text-red-400 font-bold' : 
                            log.level === 'WARN' ? 'text-yellow-400' : 'text-blue-400'
                        }>{log.level}</span>
                        <span className="text-slate-300 break-all">{log.message}</span>
                    </div>
                ))
            )}
        </div>
      </div>
    </div>
  );
};

export default StatsPanel;
