import React, { useState, useEffect } from 'react';
import { X, Save, Trash2, MapPin, Server, Share2, Shield, Edit2 } from 'lucide-react';
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
    type: 'ACCESS',
    boardName: 'Unknown',
    location: { lat: -7.5790, lng: 112.7107 },
    status: NodeStatus.ONLINE,
    snmpEnabled: true,
    snmpCommunity: 'public'
  });
  const [uplinkId, setUplinkId] = useState<string>('');
  const [customTypeMode, setCustomTypeMode] = useState(false);

  useEffect(() => {
    if (node) {
      setFormData({ 
        ...formData, 
        ...node,
        snmpEnabled: node.snmpEnabled ?? true,
        snmpCommunity: node.snmpCommunity ?? 'public'
      });
      
      // Check if type is custom
      if (node.type && !PRESET_TYPES.includes(node.type)) {
          setCustomTypeMode(true);
      }
      
      // Determine current uplink (Incoming connection where target === this node)
      if (node.id) {
          const parentConn = connections.find(c => c.target === node.id);
          setUplinkId(parentConn ? parentConn.source : '');
      } else {
          setUplinkId('');
      }
    }
  }, [node]); // connections implies node open refresh

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.ipAddress) return;
    
    onSave({
      ...formData,
      // Ensure required fields for new nodes
      id: formData.id || `node-${Date.now()}`,
      latency: formData.latency || 5,
      packetLoss: formData.packetLoss || 0,
      cpuLoad: formData.cpuLoad || 0,
      memoryUsage: formData.memoryUsage || 0,
      txRate: formData.txRate || 0,
      rxRate: formData.rxRate || 0,
      voltage: formData.voltage || 24,
      temperature: formData.temperature || 30,
      activePeers: formData.activePeers || 0,
      version: formData.version || '7.x',
      region: formData.region || 'East Java'
    } as NetworkNode, uplinkId);
    onClose();
  };

  const isEditing = !!node?.id;

  // Filter possible uplinks (exclude self)
  const availableUplinks = nodes.filter(n => n.id !== formData.id);

  return (
    <div className="fixed inset-0 z-[2000] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 w-full max-w-lg rounded-2xl border border-slate-700 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50 rounded-t-2xl shrink-0">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Server size={20} className="text-blue-400" />
            {isEditing ? 'Edit Device' : 'Add New Device'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Device Name</label>
              <input 
                type="text" 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white focus:border-blue-500 outline-none"
                placeholder="e.g. Bangil Tower"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">IP Address</label>
              <input 
                type="text" 
                value={formData.ipAddress}
                onChange={e => setFormData({...formData, ipAddress: e.target.value})}
                className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white font-mono focus:border-blue-500 outline-none"
                placeholder="192.168.88.1"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Device Type</label>
              {!customTypeMode ? (
                  <select 
                    value={PRESET_TYPES.includes(formData.type || '') ? formData.type : 'CUSTOM'}
                    onChange={e => {
                        if (e.target.value === 'CUSTOM') {
                            setCustomTypeMode(true);
                            setFormData({...formData, type: ''});
                        } else {
                            setFormData({...formData, type: e.target.value as any});
                        }
                    }}
                    className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white focus:border-blue-500 outline-none"
                  >
                    <option value="CORE">Core Router</option>
                    <option value="DISTRIBUTION">Distribution (Tower)</option>
                    <option value="BACKHAUL">Backhaul (PTP)</option>
                    <option value="ACCESS">Access Point</option>
                    <option value="CLIENT">Client / CPE</option>
                    <option value="CUSTOM">Custom Type...</option>
                  </select>
              ) : (
                  <div className="flex gap-1">
                      <input 
                          type="text"
                          value={formData.type}
                          onChange={e => setFormData({...formData, type: e.target.value})}
                          placeholder="Type..."
                          className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white focus:border-blue-500 outline-none"
                          autoFocus
                      />
                      <button 
                        type="button" 
                        onClick={() => { setCustomTypeMode(false); setFormData({...formData, type: 'ACCESS'}); }}
                        className="p-2 text-slate-400 hover:text-white bg-slate-800 border border-slate-600 rounded"
                        title="Use Preset"
                      >
                        <X size={16} />
                      </button>
                  </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Hardware Model</label>
              <input 
                type="text" 
                value={formData.boardName}
                onChange={e => setFormData({...formData, boardName: e.target.value})}
                className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white focus:border-blue-500 outline-none"
                placeholder="RB4011"
              />
            </div>
          </div>

          {/* SNMP Configuration Section */}
          <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
             <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase">
                    <Shield size={12} /> SNMP Monitoring
                </label>
                <div className="flex items-center cursor-pointer" onClick={() => setFormData({...formData, snmpEnabled: !formData.snmpEnabled})}>
                    <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${formData.snmpEnabled ? 'bg-blue-600' : 'bg-slate-600'}`}>
                        <div className={`w-3 h-3 rounded-full bg-white transition-transform ${formData.snmpEnabled ? 'translate-x-4' : 'translate-x-0'}`}></div>
                    </div>
                    <span className="ml-2 text-sm text-slate-300 select-none">
                        {formData.snmpEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                </div>
             </div>
             
             {formData.snmpEnabled && (
                 <div className="mt-3 animate-fade-in">
                    <label className="block text-xs text-slate-500 mb-1">Community String</label>
                    <input 
                        type="text" 
                        value={formData.snmpCommunity}
                        onChange={e => setFormData({...formData, snmpCommunity: e.target.value})}
                        className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white text-sm focus:border-blue-500 outline-none font-mono"
                        placeholder="public"
                    />
                 </div>
             )}
          </div>

          <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">
                  <Share2 size={12}/> Uplink / Parent Connection
              </label>
              <select 
                  value={uplinkId}
                  onChange={e => setUplinkId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white focus:border-blue-500 outline-none"
              >
                  <option value="">-- No Connection --</option>
                  {availableUplinks.map(node => (
                      <option key={node.id} value={node.id}>
                          {node.name} ({node.ipAddress})
                      </option>
                  ))}
              </select>
          </div>

          <div>
             <label className="block text-xs font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">
               <MapPin size={12}/> Coordinates (Lat, Lng)
             </label>
             <div className="grid grid-cols-2 gap-4">
               <input 
                  type="number" 
                  step="any"
                  value={formData.location?.lat}
                  onChange={e => setFormData({...formData, location: { ...formData.location!, lat: parseFloat(e.target.value) }})}
                  className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white font-mono text-sm"
                  placeholder="Latitude"
               />
               <input 
                  type="number" 
                  step="any"
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
                  <Save size={18} /> Save Device
                </button>
             </div>
          </div>

        </form>
      </div>
    </div>
  );
};

export default DeviceModal;
