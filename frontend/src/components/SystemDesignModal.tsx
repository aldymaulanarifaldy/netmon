import React, { useState } from 'react';
import { X, Server, Database, Activity, Code } from 'lucide-react';

interface SystemDesignModalProps {
  onClose: () => void;
}

const SystemDesignModal: React.FC<SystemDesignModalProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'arch' | 'db' | 'integration'>('arch');

  return (
    <div className="fixed inset-0 z-[2000] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 w-full max-w-4xl h-[80vh] rounded-2xl border border-slate-700 shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Activity className="text-blue-400" /> ISP Network Monitoring Proposal
            </h2>
            <p className="text-slate-400 text-sm mt-1">Target Area: -7.579042, 112.710716 (East Java, ID)</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700">
          <button 
            onClick={() => setActiveTab('arch')}
            className={`px-6 py-3 text-sm font-semibold transition-colors ${activeTab === 'arch' ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-400' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            System Architecture
          </button>
          <button 
             onClick={() => setActiveTab('db')}
             className={`px-6 py-3 text-sm font-semibold transition-colors ${activeTab === 'db' ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-400' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            Database Schema
          </button>
          <button 
             onClick={() => setActiveTab('integration')}
             className={`px-6 py-3 text-sm font-semibold transition-colors ${activeTab === 'integration' ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-400' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            MikroTik Integration
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 text-slate-300">
          
          {activeTab === 'arch' && (
            <div className="space-y-8">
              <section>
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <Server size={20} className="text-green-400"/> Infrastructure Overview
                </h3>
                <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700">
                  <ul className="space-y-4">
                    <li className="flex gap-4">
                      <div className="font-bold text-white w-32">Frontend</div>
                      <div>React 19 + Leaflet + Tailwind CSS. Real-time visualization via WebSockets.</div>
                    </li>
                    <li className="flex gap-4">
                      <div className="font-bold text-white w-32">Backend</div>
                      <div>Node.js (Express) or Python (FastAPI). Polling engine for SNMP/MikroTik API.</div>
                    </li>
                    <li className="flex gap-4">
                      <div className="font-bold text-white w-32">Database</div>
                      <div>
                        <span className="text-blue-300">TimescaleDB / InfluxDB</span> for telemetry history.<br/>
                        <span className="text-blue-300">PostgreSQL</span> for device inventory and topology.
                      </div>
                    </li>
                    <li className="flex gap-4">
                      <div className="font-bold text-white w-32">Alerting</div>
                      <div>Prometheus Alertmanager integrated with Telegram/WhatsApp bots for ISP field techs.</div>
                    </li>
                  </ul>
                </div>
              </section>

              <section>
                <h3 className="text-xl font-bold text-white mb-4">Real-Time Data Flow</h3>
                <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700 font-mono text-sm">
                  [MikroTik Device] <br/>
                  &nbsp;&nbsp;|<br/>
                  &nbsp;&nbsp;+-- (API/SNMP every 30s) --> [Poller Service]<br/>
                  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;|<br/>
                  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+--> [InfluxDB (Storage)]<br/>
                  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;|<br/>
                  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+--> [Redis (Hot Cache)]<br/>
                  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;|<br/>
                  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+--> [WebSocket Server] --> [React Frontend]
                </div>
              </section>
            </div>
          )}

          {activeTab === 'db' && (
            <div className="space-y-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Database size={20} className="text-purple-400"/> Recommended Schema
              </h3>
              
              <div className="space-y-4">
                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 font-mono text-xs text-green-400">
                  <div className="text-slate-500 mb-2">// Table: devices</div>
                  CREATE TABLE devices (<br/>
                  &nbsp;&nbsp;id UUID PRIMARY KEY,<br/>
                  &nbsp;&nbsp;hostname VARCHAR(255),<br/>
                  &nbsp;&nbsp;ip_address INET,<br/>
                  &nbsp;&nbsp;snmp_community VARCHAR(50),<br/>
                  &nbsp;&nbsp;api_user VARCHAR(50),<br/>
                  &nbsp;&nbsp;api_password_encrypted TEXT,<br/>
                  &nbsp;&nbsp;latitude DECIMAL(9,6),<br/>
                  &nbsp;&nbsp;longitude DECIMAL(9,6),<br/>
                  &nbsp;&nbsp;model VARCHAR(100),<br/>
                  &nbsp;&nbsp;firmware_version VARCHAR(50)<br/>
                  );
                </div>

                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 font-mono text-xs text-blue-400">
                  <div className="text-slate-500 mb-2">// Table: device_metrics (Hypertable)</div>
                  CREATE TABLE device_metrics (<br/>
                  &nbsp;&nbsp;time TIMESTAMPTZ NOT NULL,<br/>
                  &nbsp;&nbsp;device_id UUID REFERENCES devices(id),<br/>
                  &nbsp;&nbsp;cpu_load INT,<br/>
                  &nbsp;&nbsp;memory_usage INT,<br/>
                  &nbsp;&nbsp;temperature INT,<br/>
                  &nbsp;&nbsp;voltage REAL,<br/>
                  &nbsp;&nbsp;uptime BIGINT<br/>
                  );<br/>
                  SELECT create_hypertable('device_metrics', 'time');
                </div>

                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 font-mono text-xs text-yellow-400">
                  <div className="text-slate-500 mb-2">// Table: interface_traffic (Hypertable)</div>
                  CREATE TABLE interface_traffic (<br/>
                  &nbsp;&nbsp;time TIMESTAMPTZ NOT NULL,<br/>
                  &nbsp;&nbsp;device_id UUID REFERENCES devices(id),<br/>
                  &nbsp;&nbsp;interface_name VARCHAR(50),<br/>
                  &nbsp;&nbsp;tx_bits_sec BIGINT,<br/>
                  &nbsp;&nbsp;rx_bits_sec BIGINT,<br/>
                  &nbsp;&nbsp;packet_loss_percent REAL<br/>
                  );<br/>
                  SELECT create_hypertable('interface_traffic', 'time');
                </div>
              </div>
            </div>
          )}

          {activeTab === 'integration' && (
             <div className="space-y-6">
               <h3 className="text-xl font-bold text-white flex items-center gap-2">
                 <Code size={20} className="text-orange-400"/> MikroTik Integration Strategy
               </h3>

               <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700">
                 <p className="mb-4 text-sm leading-relaxed">
                   The best approach for real-time monitoring of MikroTik devices involves a hybrid of 
                   <strong> API</strong> (for detailed config/stats) and <strong>SNMP</strong> (for lightweight traffic polling).
                 </p>
                 
                 <h4 className="font-bold text-white mt-4 mb-2">Node.js Example (using routeros-client)</h4>
                 <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto">
{`const { RouterOSClient } = require('routeros-client');

async function pollDevice(ip, user, password) {
  const connection = new RouterOSClient({
    host: ip,
    user: user,
    password: password,
    keepalive: true
  });

  await connection.connect();
  
  // 1. Get System Resource
  const [resources] = await connection.menu('/system/resource').get();
  
  // 2. Get Interface Traffic (Monitor)
  // This is better than get() because it gives instantaneous rate
  const trafficStream = connection.menu('/interface').monitor(['ether1', 'wlan1'], {
    once: true,
    'aggregating-interval': 1
  });
  
  // 3. Get Active Hotspot Users
  const activeUsers = await connection.menu('/ip/hotspot/active').get();

  return {
    cpu: resources['cpu-load'],
    uptime: resources['uptime'],
    traffic: trafficStream,
    clients: activeUsers.length
  };
}`}
                 </div>

                 <h4 className="font-bold text-white mt-6 mb-2">Recommended OIDs for SNMP (Backup)</h4>
                 <ul className="list-disc list-inside text-sm space-y-1 text-slate-400">
                   <li><code className="bg-slate-800 px-1 rounded">1.3.6.1.2.1.1.3.0</code> - Uptime</li>
                   <li><code className="bg-slate-800 px-1 rounded">1.3.6.1.4.1.14988.1.1.3.10.0</code> - Total Active Wireless Clients</li>
                   <li><code className="bg-slate-800 px-1 rounded">1.3.6.1.4.1.14988.1.1.1.3.1.4.1</code> - Signal Strength</li>
                 </ul>
               </div>
             </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default SystemDesignModal;
