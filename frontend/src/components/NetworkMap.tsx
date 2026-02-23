
import React, { useMemo, useRef, useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { NetworkNode, Connection, NodeStatus, ViewMode, MapStyle, Coordinates } from '../types';
import { MAP_CENTER, MAP_ZOOM } from '../constants';
import { Server, Radio, Router, Wifi, Zap, Monitor, MapPin, ArrowUp, ArrowDown, Cpu, Activity, Link2 } from 'lucide-react';
import { renderToString } from 'react-dom/server';

// Fix for default Leaflet marker icons
const iconUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const iconShadowUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: iconUrl,
    shadowUrl: iconShadowUrl,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

interface NetworkMapProps {
  nodes: NetworkNode[];
  connections: Connection[];
  selectedNodeId: string | null;
  selectedConnectionId?: string | null;
  viewMode: ViewMode;
  mapStyle: MapStyle;
  isLinkMode?: boolean;
  rotation: number; // New prop
  onNodeSelect: (nodeId: string) => void;
  onConnectionSelect?: (connId: string) => void;
  onConnectionUpdate?: (connId: string, updates: Partial<Connection>) => void;
  onCreateConnection?: (sourceId: string, targetId: string) => void;
  onMapClick?: (coords: { lat: number, lng: number }) => void;
}

// ... (keep existing code)

const createCustomIcon = (node: NetworkNode, isSelected: boolean, isLinkSource: boolean, rotation: number) => {
  const color = isLinkSource ? '#f59e0b' : getNodeColor(node.status); // Amber if source of link
  const size = isSelected || isLinkSource ? 'w-12 h-12' : 'w-9 h-9';
  const iconSizePx = isSelected || isLinkSource ? 48 : 36;
  
  let IconComponent = Router; 
  if (node.type === 'CORE') IconComponent = Server;
  else if (node.type === 'DISTRIBUTION') IconComponent = Radio;
  else if (node.type === 'BACKHAUL') IconComponent = Zap;
  else if (node.type === 'ACCESS') IconComponent = Wifi;
  else if (node.type === 'CLIENT') IconComponent = Monitor;
  // Fallback to Router for custom types

  const iconHtml = renderToString(
    <div className="relative w-full h-full flex items-center justify-center overflow-visible" style={{ transform: `rotate(-${rotation}deg)` }}>
        {isSelected && !isLinkSource && (
           <div className="absolute -top-10 left-1/2 -translate-x-1/2 text-white animate-bounce drop-shadow-[0_4px_6px_rgba(0,0,0,0.9)] z-50">
               <MapPin size={32} fill={color} className="text-white" strokeWidth={1} />
           </div>
        )}
        
        {isLinkSource && (
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 text-yellow-500 animate-pulse drop-shadow-[0_4px_6px_rgba(0,0,0,0.9)] z-50">
                <Link2 size={28} strokeWidth={3} />
            </div>
        )}

        <div className={`relative flex items-center justify-center ${size} bg-slate-900 border-2 rounded-full transition-all duration-300 z-10 shadow-2xl`} style={{ borderColor: color, boxShadow: `0 0 15px ${color}80` }}>
            <div className="text-white p-1.5">
                <IconComponent size={isSelected || isLinkSource ? 24 : 18} />
            </div>
            {node.status !== NodeStatus.OFFLINE && (
                <>
                    <span className="absolute -inset-2 rounded-full border-2 opacity-30 marker-ping pointer-events-none" style={{ borderColor: color }}></span>
                    <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: color }}></span>
                        <span className="relative inline-flex rounded-full h-3.5 w-3.5 border-2 border-slate-900 shadow-sm" style={{ backgroundColor: color }}></span>
                    </span>
                </>
            )}
        </div>
        
        <div className="absolute top-full mt-2 px-2 py-0.5 bg-slate-900/90 backdrop-blur-md border border-slate-700/50 rounded text-[10px] font-bold text-slate-100 whitespace-nowrap shadow-xl z-20 pointer-events-none">
            {node.name}
        </div>
    </div>
  );

  return L.divIcon({
    html: iconHtml,
    className: 'custom-marker-icon',
    iconSize: [iconSizePx, iconSizePx],
    iconAnchor: [iconSizePx / 2, iconSizePx / 2],
  });
};

// ... (keep existing code)

const NetworkMap: React.FC<NetworkMapProps> = ({ 
    nodes, 
    connections, 
    selectedNodeId, 
    selectedConnectionId, 
    viewMode, 
    mapStyle, 
    isLinkMode,
    rotation,
    onNodeSelect, 
    onConnectionSelect, 
    onConnectionUpdate,
    onCreateConnection,
    onMapClick 
}) => {
    
    // ... (keep existing code)

    return (
    <div style={{ 
        height: "150vmax", 
        width: "150vmax", 
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
        transition: 'transform 0.5s ease-out',
        zIndex: 0
    }}>
    <MapContainer 
        center={[MAP_CENTER.lat, MAP_CENTER.lng]} 
        zoom={MAP_ZOOM} 
        style={{ height: "100%", width: "100%", background: "transparent", cursor: isLinkMode ? 'crosshair' : 'default' }}
        className={`map-container ${mapStyle === 'DARK' ? 'map-dark' : ''}`}
    >
      {/* ... (keep existing code) */}

      {nodes.map(node => (
        <Marker
          key={node.id}
          position={[node.location.lat, node.location.lng]}
          icon={createCustomIcon(node, selectedNodeId === node.id, linkSource === node.id, rotation)}
          eventHandlers={{
            // ... (keep existing code)
          }}
        >
          <Tooltip direction="top" offset={[0, -20]} opacity={1} className="!bg-transparent !border-0 !shadow-none p-0">
             <div style={{ transform: `rotate(-${rotation}deg)` }}>
              <div className="bg-slate-900/95 backdrop-blur border border-slate-700 rounded-xl p-3 shadow-2xl min-w-[180px] text-slate-100">
                  {/* ... (keep existing code) */}
              </div>
             </div>
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
    </div>
  );
};

export default NetworkMap;
