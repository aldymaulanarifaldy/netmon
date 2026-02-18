import React, { useState, useEffect } from 'react';
import { X, Save, Trash2, MapPin, Server, Share2, Shield, Lock, Globe } from 'lucide-react';
import { NetworkNode, NodeStatus, Connection } from '../types';

interface DeviceModalProps {
  node: Partial<NetworkNode> | null;
  nodes: NetworkNode[];
  connections: Connection[];
  onSave: (node: NetworkNode, uplinkId?: string) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

const PRESET_TYPES = ['CORE', 'DISTRIBUTION', 'BACKHAUL', 'ACCESS', 'CLIENT'];

const DeviceModal: React.FC<DeviceModalProps> = ({ node, nodes, connections, onSave, onDelete, onClose }) => {
  const [formData, setFormData] = useState<Partial<NetworkNode>>({
    name: '',
    ipAddress: '',
    apiPort: 8728,
    apiSsl: false,
    type: 'ACCESS',
    boardName: 'Unknown',
    location: { lat: -7.5790, lng: 112.7107 },
    status: NodeStatus.ONLINE,
    snmpEnabled: true,
    snmpCommunity: 'public',
    authUser: 'admin',
    authPassword: ''
  });
  const [uplinkId, setUplinkId] = useState<string>('');
  const [customTypeMode, setCustomTypeMode] = useState(false);

  useEffect(() => {
    if (node) {
      setFormData({ 
        ...formData, 
        ...node,
        apiPort: node.apiPort || 8728,
        apiSsl: node.apiSsl || false,
        snmpEnabled: node.snmpEnabled ?? true,
        snmpCommunity: node.snmpCommunity ?? 'public'
      });
      
      if (node.type && !PRESET_TYPES.includes(node.type)) {
          setCustomTypeMode(true);
      }
      
      if (node.id) {
          const parentConn = connections.find(c => c.target === node.id);
          setUplinkId(parentConn ? parentConn.source : '');
      } else {
          setUplinkId('');
      }
    }
  }, [node]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.ipAddress) return;
    
    onSave({
      ...formData,
      id: formData.id || `node-${Date.now()}`,
      latency: formData.latency || 0,
      packetLoss: 0,
      cpuLoad: 0,
      memoryUsage: 0,
      txRate: 0,
      rxRate: 0,
      voltage: 0,
      temperature: 0,
      activePeers: 0,
      version: 'detecting...',
      region: 'Default'
    } as NetworkNode, uplinkId);
    onClose();
  };

  const isEditing = !!node?.id;
  const availableUplinks = nodes.filter(n => n.id !== formData.id);

  return (
    <div className="fixed inset-0 z-[2000] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 w-full max-w-lg rounded-2xl border border-slate-700 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50 rounded-t-2xl shrink-0">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Server size={20} className="text-blue-400" />
            {isEditing ? 'Edit Device' : 'Provision New Device'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
          
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Device Name</label>
              <input 
                type="text" 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white focus:border-blue-500 outline-none"
                placeholder="e.g. Bangil Core"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Type</label>
              <select 
                value={PRESET_TYPES.includes(formData.type || '') ? formData.type : 'CUSTOM'}
                onChange={e => setFormData({...formData, type: e.target.value as any})}
                className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white focus:border-blue-500 outline-none"
              >
                {PRESET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Network Config */}
          <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
             <div className="flex items-center gap-2 mb-3 text-blue-400 font-bold text-xs uppercase">
                <Globe size={12}/> Management Interface
             </div>
             <div className="grid grid-cols-12 gap-4 mb-3">
                 <div className="col-span-8">
                    <label className="block text-xs text-slate-500 mb-1">IP Address</label>
                    <input 
                        type="text" 
                        value={formData.ipAddress}
                        onChange={e => setFormData({...formData, ipAddress: e.target.value})}
                        className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white font-mono focus:border-blue-500 outline-none"
                        placeholder="192.168.88.1"
                        required
                    />
                 </div>
                 <div className="col-span-4">
                    <label className="block text-xs text-slate-500 mb-1">API Port</label>
                    <input 
                        type="number" 
                        value={formData.apiPort}
                        onChange={e => setFormData({...formData, apiPort: parseInt(e.target.value)})}
                        className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white font-mono focus:border-blue-500 outline-none"
                    />
                 </div>
             </div>
             <div className="flex items-center gap-2">
                 <input 
                    type="checkbox" 
                    id="ssl" 
                    checked={formData.apiSsl} 
                    onChange={e => setFormData({...formData, apiSsl: e.target.checked})}
                    className="rounded bg-slate-700 border-slate-600 text-blue-600 focus:ring-blue-500"
                 />
                 <label htmlFor="ssl" className="text-sm text-slate-300 flex items-center gap-1">
                    <Lock size={12}/> Use SSL (TLS)
                 </label>
             </div>
          </div>

          {/* Credentials */}
          <div className="grid grid-cols-2 gap-4">
              <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">API User</label>
                  <input 
                    type="text" 
                    value={formData.authUser}
                    onChange={e => setFormData({...formData, authUser: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white focus:border-blue-500 outline-none"
                  />
              </div>
              <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">API Password</label>
                  <input 
                    type="password" 
                    value={formData.authPassword}
                    onChange={e => setFormData({...formData, authPassword: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white focus:border-blue-500 outline-none"
                  />
              </div>
          </div>

          <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">
                  <Share2 size={12}/> Uplink / Topology Parent
              </label>
              <select 
                  value={uplinkId}
                  onChange={e => setUplinkId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white focus:border-blue-500 outline-none"
              >
                  <option value="">-- Root Node --</option>
                  {availableUplinks.map(node => (
                      <option key={node.id} value={node.id}>
                          {node.name} ({node.ipAddress})
                      </option>
                  ))}
              </select>
          </div>

          <div>
             <label className="block text-xs font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">
               <MapPin size={12}/> Coordinates
             </label>
             <div className="grid grid-cols-2 gap-4">
               <input 
                  type="number" step="any"
                  value={formData.location?.lat}
                  onChange={e => setFormData({...formData, location: { ...formData.location!, lat: parseFloat(e.target.value) }})}
                  className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white font-mono text-sm"
                  placeholder="Latitude"
               />
               <input 
                  type="number" step="any"
                  value={formData.location?.lng}
                  onChange={e => setFormData({...formData, location: { ...formData.location!, lng: parseFloat(e.target.value) }})}
                  className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white font-mono text-sm"
                  placeholder="Longitude"
               />
             </div>
          </div>

          <div className="pt-4 flex justify-between items-center border-t border-slate-700 mt-4">
             {isEditing && (
                 <button 
                   type="button" 
                   onClick={() => onDelete(formData.id!)}
                   className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg flex items-center gap-2 transition-colors"
                 >
                   <Trash2 size={18} /> Delete
                 </button>
             )}
             <div className="flex gap-2 ml-auto">
                <button type="button" onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white">Cancel</button>
                <button type="submit" className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center gap-2 font-bold shadow-lg shadow-blue-500/20">
                  <Save size={18} /> Provision
                </button>
             </div>
          </div>

        </form>
      </div>
    </div>
  );
};

export default DeviceModal;