
import React, { useState, useEffect } from 'react';
import { X, Save, Trash2, MapPin, Server, Shield, Lock, Settings, Play, CheckCircle, AlertCircle, RefreshCw, Network, Share2 } from 'lucide-react';
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
  useEffect(() => {
    // Component Mount
  }, []);

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

  // Test Connection States
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; latency?: number; version?: string; identity?: string; error?: string } | null>(null);

  // Interface Detection State
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedInterfaces, setDetectedInterfaces] = useState<any[]>([]);

  useEffect(() => {
    if (node) {
      setFormData({ 
        ...formData, 
        ...node,
        apiPort: node.apiPort || 8728,
        snmpEnabled: node.snmpEnabled ?? true,
        snmpCommunity: node.snmpCommunity ?? 'public',
        authUser: node.authUser || 'admin',
        authPassword: node.authPassword || ''
      });
      
      if (node.type && !PRESET_TYPES.includes(node.type)) {
          setCustomTypeMode(true);
      }
      
      if (node.id) {
          const parentConn = connections.find(c => c.target === node.id);
          setUplinkId(parentConn ? parentConn.source : '');
      }
      
      if (node.wanInterface) {
          setDetectedInterfaces([{ name: node.wanInterface }]);
      }
    }
  }, [node]);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
        const apiUrl = window.location.origin.includes('localhost') ? 'http://localhost:3001' : '';
        const res = await fetch(`${apiUrl}/api/devices/test-connection`, {
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
        
        if (!res.ok) throw new Error(data.error || 'Request failed');
        // Handle logical failure even if HTTP is 200
        if (data.success === false) throw new Error(data.error || 'Connection failed');

        setTestResult({
            success: true,
            latency: data.latency,
            version: data.version,
            identity: data.identity
        });

        // Auto-fill details
        setFormData(prev => ({
            ...prev,
            boardName: data.boardName || prev.boardName,
            version: data.version || prev.version,
            // Only update name if generic or empty
            name: (!prev.name || prev.name.toLowerCase().includes('device') || prev.name === '') 
                ? data.identity 
                : prev.name
        }));
        
        handleDetectInterfaces();

    } catch (err: any) {
        setTestResult({
            success: false,
            error: err.message || "Unknown error"
        });
    } finally {
        setIsTesting(false);
    }
  };

  const handleDetectInterfaces = async () => {
      setIsDetecting(true);
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
          if (Array.isArray(data)) {
              setDetectedInterfaces(data);
              const wan = data.find((i: any) => i.name.match(/ether1|wan|sfp/i));
              if (wan && !formData.wanInterface) setFormData(prev => ({...prev, wanInterface: wan.name}));
          }
      } catch (e) { console.error(e); } 
      finally { setIsDetecting(false); }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.ipAddress) return;
    
    onSave({
      ...formData,
      id: formData.id || `node-${Date.now()}`,
      status: formData.status || NodeStatus.ONLINE,
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
      region: formData.region || 'Default'
    } as NetworkNode, uplinkId);
    onClose();
  };

  const isEditing = !!node?.id;
  const availableUplinks = nodes.filter(n => n.id !== formData.id);
  const inputClass = "w-full bg-slate-800 border border-slate-600 rounded p-2 text-white focus:border-blue-500 outline-none transition-colors text-sm";
  const labelClass = "block text-xs font-bold text-slate-400 uppercase mb-1";

  return (
    <div className="fixed inset-0 z-[2000] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 w-full max-w-lg rounded-2xl border border-slate-700 shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50 rounded-t-2xl shrink-0">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Server size={20} className="text-blue-400" />
            {isEditing ? 'Edit Device' : 'Add New Device'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
          
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Device Name</label>
              <input 
                type="text" 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className={inputClass}
                placeholder="e.g. Bangil Tower"
                required
              />
            </div>
            <div>
              <label className={labelClass}>IP Address</label>
              <input 
                type="text" 
                value={formData.ipAddress}
                onChange={e => setFormData({...formData, ipAddress: e.target.value})}
                className={`${inputClass} font-mono`}
                placeholder="192.168.88.1"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Device Type</label>
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
                    className={inputClass}
                  >
                    {PRESET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    <option value="CUSTOM">Custom Type...</option>
                  </select>
              ) : (
                  <div className="flex gap-1">
                      <input 
                          type="text"
                          value={formData.type}
                          onChange={e => setFormData({...formData, type: e.target.value})}
                          placeholder="Type..."
                          className={inputClass}
                      />
                      <button 
                        type="button" 
                        onClick={() => { setCustomTypeMode(false); setFormData({...formData, type: 'ACCESS'}); }}
                        className="p-2 text-slate-400 hover:text-white bg-slate-800 border border-slate-600 rounded"
                      >
                        <X size={16} />
                      </button>
                  </div>
              )}
            </div>
            <div>
              <label className={labelClass}>Hardware Model</label>
              <input 
                type="text" 
                value={formData.boardName}
                readOnly
                className={`${inputClass} text-slate-400 cursor-not-allowed bg-slate-900/50`}
                placeholder="Unknown"
              />
            </div>
          </div>

          {/* Management Access Section */}
          <div className="bg-slate-950 border border-slate-700 rounded-lg p-4">
             <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-2">
                 <Settings size={14} className="text-blue-400"/> 
                 <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Management Access (API)</span>
             </div>

             <div className="space-y-3">
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>API User</label>
                        <input 
                            type="text" 
                            value={formData.authUser}
                            onChange={e => setFormData({...formData, authUser: e.target.value})}
                            className={inputClass}
                            placeholder="admin"
                        />
                    </div>
                    <div>
                        <label className={labelClass}>API Password</label>
                        <input 
                            type="password" 
                            value={formData.authPassword}
                            onChange={e => setFormData({...formData, authPassword: e.target.value})}
                            className={inputClass}
                            placeholder="••••••"
                        />
                    </div>
                 </div>

                 <div className="grid grid-cols-12 gap-3 items-end">
                    <div className="col-span-3">
                        <label className={labelClass}>Port</label>
                        <input 
                            type="number" 
                            value={formData.apiPort}
                            onChange={e => setFormData({...formData, apiPort: parseInt(e.target.value)})}
                            className={inputClass}
                        />
                    </div>
                    <div className="col-span-9 pb-2">
                         <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input 
                                type="checkbox" 
                                checked={formData.apiSsl} 
                                onChange={e => setFormData({...formData, apiSsl: e.target.checked})}
                                className="w-4 h-4 rounded bg-slate-800 border-slate-600 text-blue-600 focus:ring-offset-0 focus:ring-0"
                            />
                            <span className="text-xs text-slate-400 flex items-center gap-1"><Lock size={10}/> Use SSL</span>
                         </label>
                    </div>
                 </div>

                 {/* Test Connection Button */}
                 <div className="pt-2">
                     <button 
                        type="button"
                        onClick={handleTestConnection}
                        disabled={isTesting || !formData.ipAddress}
                        className={`w-full p-2.5 rounded-lg flex items-center justify-center gap-2 text-sm font-bold transition-all shadow-lg border ${
                            isTesting 
                                ? 'bg-slate-800 border-slate-700 text-slate-400 cursor-wait' 
                                : 'bg-blue-600 border-blue-500 hover:bg-blue-500 text-white shadow-blue-900/20'
                        }`}
                     >
                         {isTesting ? (
                             <> <RefreshCw size={16} className="animate-spin"/> Testing Connectivity... </>
                         ) : (
                             <> <Play size={16} fill="currentColor"/> Test Connection </>
                         )}
                     </button>
                 </div>

                 {/* Test Result Display */}
                 {testResult && (
                     <div className={`p-3 rounded-lg border text-sm flex items-start gap-3 animate-in fade-in slide-in-from-top-2 ${
                        testResult.success 
                            ? 'bg-green-500/10 border-green-500/30 text-green-400' 
                            : 'bg-red-500/10 border-red-500/30 text-red-400'
                     }`}>
                         <div className={`p-1.5 rounded-full shrink-0 ${testResult.success ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                            {testResult.success ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                         </div>
                         <div className="flex-1">
                            <div className="font-bold mb-0.5">
                                {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                            </div>
                            {testResult.success ? (
                                <div className="text-xs space-y-1 opacity-90">
                                    <div className="flex justify-between">
                                        <span>Latency:</span> <span className="font-mono font-bold">{testResult.latency}ms</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Identity:</span> <span className="font-mono">{testResult.identity}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Version:</span> <span className="font-mono">v{testResult.version}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-xs opacity-90 leading-relaxed">
                                    {testResult.error}
                                </div>
                            )}
                         </div>
                     </div>
                 )}

                 <div className="pt-3 mt-2 border-t border-slate-800/50">
                     <div className="flex justify-between items-center mb-2">
                        <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500 uppercase">
                            <Network size={12} /> Interface Mapping
                        </label>
                        <button 
                            type="button" 
                            onClick={handleDetectInterfaces}
                            disabled={isDetecting}
                            className="text-[10px] text-indigo-400 hover:text-white flex items-center gap-1 px-2 py-0.5 rounded transition-colors disabled:opacity-50"
                        >
                            <RefreshCw size={10} className={isDetecting ? "animate-spin" : ""}/> 
                            {isDetecting ? 'Scanning...' : 'Scan Interfaces'}
                        </button>
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                         <div>
                             <select 
                                value={formData.wanInterface}
                                onChange={e => setFormData({...formData, wanInterface: e.target.value})}
                                className={inputClass}
                             >
                                 <option value="">-- WAN (Up) --</option>
                                 {detectedInterfaces.length > 0 ? (
                                     detectedInterfaces.map(i => <option key={i.name} value={i.name}>{i.name}</option>)
                                 ) : (
                                     formData.wanInterface && <option value={formData.wanInterface}>{formData.wanInterface}</option>
                                 )}
                                 {!detectedInterfaces.length && <option value="ether1">ether1 (Default)</option>}
                             </select>
                         </div>
                         <div>
                             <select 
                                value={formData.lanInterface}
                                onChange={e => setFormData({...formData, lanInterface: e.target.value})}
                                className={inputClass}
                             >
                                 <option value="">-- LAN (Down) --</option>
                                 {detectedInterfaces.length > 0 ? (
                                     detectedInterfaces.map(i => <option key={i.name} value={i.name}>{i.name}</option>)
                                 ) : (
                                     <option value="">Select...</option>
                                 )}
                             </select>
                         </div>
                     </div>
                 </div>
             </div>
          </div>

          {/* SNMP Section */}
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
                    <label className={labelClass}>Community String</label>
                    <input 
                        type="text" 
                        value={formData.snmpCommunity}
                        onChange={e => setFormData({...formData, snmpCommunity: e.target.value})}
                        className={`${inputClass} font-mono`}
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
                  className={inputClass}
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
                  className={`${inputClass} font-mono`}
                  placeholder="Latitude"
               />
               <input 
                  type="number" 
                  step="any"
                  value={formData.location?.lng}
                  onChange={e => setFormData({...formData, location: { ...formData.location!, lng: parseFloat(e.target.value) }})}
                  className={`${inputClass} font-mono`}
                  placeholder="Longitude"
               />
             </div>
          </div>

          <div className="pt-4 flex justify-between items-center border-t border-slate-700 mt-4">
             {isEditing && (
                 <button 
                   type="button" 
                   onClick={() => onDelete(formData.id!)}
                   className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg flex items-center gap-2 transition-colors text-sm font-bold"
                 >
                   <Trash2 size={16} /> Delete
                 </button>
             )}
             <div className="flex gap-2 ml-auto">
                <button type="button" onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white text-sm font-bold">Cancel</button>
                <button type="submit" className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center gap-2 font-bold shadow-lg shadow-blue-500/20 text-sm">
                  <Save size={16} /> Save Device
                </button>
             </div>
          </div>

        </form>
      </div>
    </div>
  );
};

export default DeviceModal;
