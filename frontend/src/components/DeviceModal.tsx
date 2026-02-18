
import React, { useState, useEffect } from 'react';
import { X, Save, Trash2, MapPin, Server, Share2, Shield, Lock, Globe, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
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
    authPassword: '',
    wanInterface: '',
    lanInterface: ''
  });
  const [uplinkId, setUplinkId] = useState<string>('');
  const [customTypeMode, setCustomTypeMode] = useState(false);
  
  // Interface Discovery State
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedInterfaces, setDetectedInterfaces] = useState<any[]>([]);
  const [detectionError, setDetectionError] = useState<string | null>(null);

  useEffect(() => {
    if (node) {
      setFormData({ 
        ...formData, 
        ...node,
        apiPort: node.apiPort || 8728,
        apiSsl: node.apiSsl || false,
        snmpEnabled: node.snmpEnabled ?? true,
        snmpCommunity: node.snmpCommunity ?? 'public',
        wanInterface: node.wanInterface || '',
        lanInterface: node.lanInterface || ''
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

  const handleDetectInterfaces = async () => {
      setIsDetecting(true);
      setDetectionError(null);
      setDetectedInterfaces([]);

      try {
          const apiUrl = window.location.origin.includes('localhost') ? 'http://localhost:3001' : '';
          const res = await fetch(`${apiUrl}/api/devices/detect-interfaces`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  ip: formData.ipAddress,
                  port: formData.apiPort,
                  username: formData.authUser,
                  password: formData.authPassword,
                  ssl: formData.apiSsl
              })
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Detection failed');
          
          setDetectedInterfaces(data);
          
          // Auto-select likely candidates if not set
          if (!formData.wanInterface && data.length > 0) {
              const likelyWan = data.find((i: any) => i.name.toLowerCase().includes('wan') || i.name.toLowerCase().includes('ether1'));
              if (likelyWan) setFormData(prev => ({...prev, wanInterface: likelyWan.name}));
          }

      } catch (err: any) {
          setDetectionError(err.message);
      } finally {
          setIsDetecting(false);
      }
  };

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
             
             {/* Credentials */}
             <div className="grid grid-cols-2 gap-4 mb-3">
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

             <div className="flex justify-between items-center border-t border-slate-700 pt-3">
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
                 
                 <button 
                    type="button" 
                    onClick={handleDetectInterfaces}
                    disabled={isDetecting || !formData.ipAddress}
                    className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded text-xs font-bold transition-colors"
                 >
                     {isDetecting ? <RefreshCw size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
                     {isDetecting ? 'Detecting...' : 'Test & Detect Interfaces'}
                 </button>
             </div>

             {/* Detection Feedback */}
             {detectionError && (
                 <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded flex items-center gap-2 text-red-300 text-xs">
                     <AlertCircle size={14} /> {detectionError}
                 </div>
             )}
             
             {detectedInterfaces.length > 0 && (
                 <div className="mt-3 p-2 bg-green-500/10 border border-green-500/30 rounded flex items-center gap-2 text-green-300 text-xs">
                     <CheckCircle size={14} /> Connection Successful. Found {detectedInterfaces.length} interfaces.
                 </div>
             )}
          </div>

          {/* Interface Selection */}
          <div className="grid grid-cols-2 gap-4">
              <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">WAN Interface (Monitor)</label>
                  <select 
                     value={formData.wanInterface}
                     onChange={e => setFormData({...formData, wanInterface: e.target.value})}
                     className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white focus:border-blue-500 outline-none"
                  >
                      <option value="">-- Select WAN --</option>
                      {detectedInterfaces.length > 0 ? (
                          detectedInterfaces.map((iface: any) => (
                              <option key={iface.name} value={iface.name}>{iface.name} ({iface.type})</option>
                          ))
                      ) : (
                          // If editing and didn't re-detect, show existing value as option
                          formData.wanInterface && <option value={formData.wanInterface}>{formData.wanInterface}</option>
                      )}
                      {!detectedInterfaces.length && <option value="ether1">ether1 (Default)</option>}
                  </select>
                  <div className="text-[10px] text-slate-500 mt-1">Interface used for traffic graphs</div>
              </div>
              <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">LAN Interface (Optional)</label>
                   <select 
                     value={formData.lanInterface}
                     onChange={e => setFormData({...formData, lanInterface: e.target.value})}
                     className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white focus:border-blue-500 outline-none"
                  >
                      <option value="">-- Select LAN --</option>
                      {detectedInterfaces.length > 0 ? (
                          detectedInterfaces.map((iface: any) => (
                              <option key={iface.name} value={iface.name}>{iface.name} ({iface.type})</option>
                          ))
                      ) : (
                          formData.lanInterface && <option value={formData.lanInterface}>{formData.lanInterface}</option>
                      )}
                  </select>
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
