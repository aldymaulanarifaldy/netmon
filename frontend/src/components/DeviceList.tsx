import React, { useMemo } from 'react';
import { NetworkNode, NodeStatus } from '../types';
import { Wifi, Radio, Server, Zap, Monitor, AlertCircle } from 'lucide-react';

interface DeviceListProps {
  nodes: NetworkNode[];
  onSelect: (nodeId: string) => void;
}

const DeviceList: React.FC<DeviceListProps> = ({ nodes, onSelect }) => {
  const sortedNodes = useMemo(() => {
    return [...nodes].sort((a, b) => a.name.localeCompare(b.name));
  }, [nodes]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'CORE': return <Server size={14} />;
      case 'DISTRIBUTION': return <Radio size={14} />;
      case 'BACKHAUL': return <Zap size={14} />;
      case 'ACCESS': return <Wifi size={14} />;
      case 'CLIENT': return <Monitor size={14} />;
      default: return <Server size={14} />;
    }
  };

  return (
    <div className="mt-2 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-700 shadow-2xl overflow-hidden pointer-events-auto flex flex-col w-full max-h-[calc(100vh-220px)] transition-all duration-300">
      <div className="p-3 border-b border-slate-800 bg-slate-900/50 backdrop-blur flex justify-between items-center sticky top-0 z-10">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Devices ({nodes.length})</h3>
      </div>
      <div className="overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        {sortedNodes.map(node => (
          <div 
            key={node.id}
            onClick={() => onSelect(node.id)}
            className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/60 cursor-pointer transition-all group border border-transparent hover:border-slate-700/50"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`p-1.5 rounded-md flex-shrink-0 ${
                node.status === NodeStatus.ONLINE ? 'bg-green-500/10 text-green-400' : 
                node.status === NodeStatus.WARNING ? 'bg-yellow-500/10 text-yellow-400' : 
                'bg-red-500/10 text-red-400'
              }`}>
                {getIcon(node.type)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-slate-200 truncate group-hover:text-white transition-colors">
                  {node.name}
                </div>
                <div className="text-[10px] text-slate-500 font-mono truncate opacity-70 group-hover:opacity-100">
                  {node.ipAddress}
                </div>
              </div>
            </div>
            
            <div className="text-right pl-2 flex-shrink-0">
              {node.status === NodeStatus.OFFLINE || node.status === NodeStatus.CRITICAL ? (
                <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded flex items-center gap-1 border border-red-500/20">
                  DOWN
                </span>
              ) : (
                <span className={`text-[10px] font-mono font-bold ${
                  node.latency > 100 ? 'text-yellow-400' : 'text-green-400'
                }`}>
                  {node.latency}ms
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DeviceList;
