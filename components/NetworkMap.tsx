import React, { useMemo, useRef, useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { NetworkNode, Connection, NodeStatus, ViewMode, MapStyle, Coordinates } from '../types';
import { MAP_CENTER, MAP_ZOOM } from '../constants';
import { Server, Radio, Router, Wifi, Zap, Monitor, MapPin, ArrowUp, ArrowDown, Cpu, Activity, AlertTriangle, Link2 } from 'lucide-react';
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
  onNodeSelect: (nodeId: string) => void;
  onConnectionSelect?: (connId: string) => void;
  onConnectionUpdate?: (connId: string, updates: Partial<Connection>) => void;
  onCreateConnection?: (sourceId: string, targetId: string) => void;
  onMapClick?: (coords: { lat: number, lng: number }) => void;
}

const getNodeColor = (status: NodeStatus) => {
  switch (status) {
    case NodeStatus.ONLINE: return '#22c55e'; // Green
    case NodeStatus.WARNING: return '#eab308'; // Yellow
    case NodeStatus.CRITICAL: return '#ef4444'; // Red
    case NodeStatus.OFFLINE: return '#64748b'; // Grey
    default: return '#3b82f6';
  }
};

const getNodeRank = (type: string): number => {
    switch (type) {
        case 'CORE': return 0;
        case 'DISTRIBUTION': return 1;
        case 'BACKHAUL': return 2;
        case 'ACCESS': return 3;
        case 'CLIENT': return 4;
        default: return 99; // Fallback for custom types
    }
};

// Math helper for point-to-segment distance (squared)
function pointToSegmentDistanceSq(x: number, y: number, x1: number, y1: number, x2: number, y2: number) {
  const A = x - x1;
  const B = y - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const len_sq = C * C + D * D;
  let param = -1;
  if (len_sq !== 0) param = dot / len_sq;

  let xx, yy;

  if (param < 0) { xx = x1; yy = y1; }
  else if (param > 1) { xx = x2; yy = y2; }
  else { xx = x1 + param * C; yy = y1 + param * D; }

  const dx = x - xx;
  const dy = y - yy;
  return dx * dx + dy * dy;
}

const createCustomIcon = (node: NetworkNode, isSelected: boolean, isLinkSource: boolean) => {
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
    <div className="relative w-full h-full flex items-center justify-center overflow-visible">
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

const MapEvents = ({ onMapClick }: { onMapClick?: (coords: { lat: number, lng: number }) => void }) => {
  useMapEvents({
    click(e) {
      if (onMapClick) onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
};

// Draggable Marker for Line Editing
interface DragHandleProps {
    position: [number, number];
    onDrag: (lat: number, lng: number) => void;
    onRightClick?: () => void;
    onDoubleClick?: () => void;
    opacity?: number;
    isGhost?: boolean;
}

const DragHandle: React.FC<DragHandleProps> = ({ 
    position, 
    onDrag, 
    onRightClick,
    onDoubleClick,
    opacity = 1,
    isGhost = false
}) => {
    const onDragRef = useRef(onDrag);
    const onRightClickRef = useRef(onRightClick);
    const onDoubleClickRef = useRef(onDoubleClick);

    useEffect(() => {
        onDragRef.current = onDrag;
        onRightClickRef.current = onRightClick;
        onDoubleClickRef.current = onDoubleClick;
    }, [onDrag, onRightClick, onDoubleClick]);

    const eventHandlers = useMemo(() => ({
        dragend: (e: any) => {
            const marker = e.target;
            const pos = marker.getLatLng();
            if (onDragRef.current) {
                onDragRef.current(pos.lat, pos.lng);
            }
        },
        contextmenu: (e: any) => {
            if (onRightClickRef.current) {
                L.DomEvent.stopPropagation(e);
                onRightClickRef.current();
            }
        },
        dblclick: (e: any) => {
            if (onDoubleClickRef.current) {
                L.DomEvent.stopPropagation(e);
                onDoubleClickRef.current();
            }
        },
        click: (e: any) => {
             L.DomEvent.stopPropagation(e);
        }
    }), []); 

    const icon = useMemo(() => L.divIcon({
        className: 'bg-transparent border-0',
        html: `<div style="
            width: 12px; 
            height: 12px; 
            background-color: ${isGhost ? 'rgba(255,255,255,0.4)' : '#3b82f6'}; 
            border: 2px solid white; 
            border-radius: 50%; 
            box-shadow: 0 0 4px rgba(0,0,0,0.5);
            cursor: pointer;
        "></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6]
    }), [isGhost]);

    return (
        <Marker
            position={position}
            icon={icon}
            draggable={true}
            opacity={opacity}
            eventHandlers={eventHandlers}
        />
    );
};


const NetworkMap: React.FC<NetworkMapProps> = ({ 
    nodes, 
    connections, 
    selectedNodeId, 
    selectedConnectionId, 
    viewMode, 
    mapStyle, 
    isLinkMode,
    onNodeSelect, 
    onConnectionSelect, 
    onConnectionUpdate,
    onCreateConnection,
    onMapClick 
}) => {
    
    // Interaction State for Link Creation
    const [dragLink, setDragLink] = useState<{sourceId: string, end: Coordinates} | null>(null);
    const [linkSource, setLinkSource] = useState<string | null>(null);

    // Reset link source when mode disabled
    useEffect(() => {
        if (!isLinkMode) {
            setLinkSource(null);
            setDragLink(null);
        }
    }, [isLinkMode]);

    const tileUrl = useMemo(() => {
        switch (mapStyle) {
            case 'SATELLITE':
                return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
            case 'LIGHT':
            case 'DARK':
            default:
                return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        }
    }, [mapStyle]);

    // Handle global map interactions for dragging
    const InteractionHandler = () => {
        useMapEvents({
            mousemove(e) {
                if (dragLink) {
                    setDragLink(prev => prev ? { ...prev, end: e.latlng } : null);
                }
            },
            mouseup() {
                if (dragLink && !isLinkMode) { // Only clear if we were dragging via button press, not "click-click" mode
                    setDragLink(null); 
                }
            }
        });
        return null;
    };

    const links = useMemo(() => {
        return connections.map((conn, index) => {
            const sourceNode = nodes.find(n => n.id === conn.source);
            const targetNode = nodes.find(n => n.id === conn.target);
            
            if (!sourceNode || !targetNode) return null;

            const isSelected = selectedConnectionId === conn.id;

            // STATUS CALCULATION
            const maxLatency = Math.max(sourceNode.latency, targetNode.latency);
            const maxLoss = Math.max(sourceNode.packetLoss, targetNode.packetLoss);
            
            const isOffline = sourceNode.status === NodeStatus.OFFLINE || targetNode.status === NodeStatus.OFFLINE;
            const isRTO = isOffline || sourceNode.status === NodeStatus.CRITICAL || targetNode.status === NodeStatus.CRITICAL || maxLoss > 10;
            const isWarning = !isRTO && (sourceNode.status === NodeStatus.WARNING || targetNode.status === NodeStatus.WARNING || maxLatency > 35 || maxLoss > 0);

            // COLORS & STYLES
            let healthColor = '#22c55e'; // Default Green
            let packetColor = '#86efac';
            let statusClass = 'link-green';
            let packetGlowClass = 'packet-green';
            let animSpeedClass = 'speed-normal';
            let linkWeight = viewMode === 'TRAFFIC' ? 6 : 4;

            if (isRTO) {
                healthColor = '#ef4444';
                packetColor = '#fca5a5';
                statusClass = 'link-rto'; 
                packetGlowClass = 'packet-red';
                animSpeedClass = 'speed-stalled'; 
            } else if (isWarning) {
                healthColor = '#eab308';
                packetColor = '#fde047';
                statusClass = 'link-yellow';
                packetGlowClass = 'packet-yellow';
                animSpeedClass = 'speed-slow';
            } else if (maxLatency < 12) {
                animSpeedClass = 'speed-fast';
            }

            const throughput = Math.round((sourceNode.txRate + targetNode.rxRate) / 2);
            const isTrafficActive = viewMode === 'TRAFFIC' && !isOffline;
            
            // Flow Direction
            let reverseFlow = false;
            if (conn.direction) {
                reverseFlow = conn.direction === 'REVERSE';
            } else {
                const rankSource = getNodeRank(sourceNode.type);
                const rankTarget = getNodeRank(targetNode.type);
                reverseFlow = rankTarget < rankSource;
            }

            // PATH CALCULATION
            let pathPoints: [number, number][] = [];
            let intermediatePoints: Coordinates[] = [];
            let isAuto = false;

            if (conn.controlPoints && conn.controlPoints.length > 0) {
                // MANUAL MODE (Curve/Polyline via control points)
                intermediatePoints = conn.controlPoints;
                pathPoints = [
                    [sourceNode.location.lat, sourceNode.location.lng],
                    ...intermediatePoints.map(p => [p.lat, p.lng] as [number, number]),
                    [targetNode.location.lat, targetNode.location.lng]
                ];
            } else {
                // AUTO MODE: Straight Line
                isAuto = true;
                pathPoints = [
                    [sourceNode.location.lat, sourceNode.location.lng],
                    [targetNode.location.lat, targetNode.location.lng]
                ];
                intermediatePoints = [];
            }

            const packetPathPoints = reverseFlow ? [...pathPoints].reverse() : pathPoints;
            const visualKey = `${sourceNode.id}-${targetNode.id}-${statusClass}-${viewMode}-${isSelected ? 'sel' : ''}-${pathPoints.length}-${conn.direction}`;

            return (
                <React.Fragment key={visualKey}>
                    {/* Selected Highlight */}
                    {isSelected && (
                         <Polyline
                            positions={pathPoints}
                            pathOptions={{ 
                                color: '#ffffff',
                                weight: linkWeight + 6,
                                opacity: 0.3,
                                className: 'connection-highlight',
                                lineJoin: 'round'
                            }}
                        />
                    )}

                    {/* Connection Base Layer */}
                    <Polyline
                        positions={pathPoints}
                        pathOptions={{ 
                            color: healthColor,
                            weight: linkWeight,
                            opacity: isTrafficActive ? 0.6 : 0.4,
                            className: `connection-base ${statusClass}`,
                            dashArray: (viewMode === 'TOPOLOGY' && (isWarning || isRTO)) ? '10, 10' : undefined,
                            lineJoin: 'round'
                        }}
                        interactive={false}
                    />

                    {/* INTERACTION LAYER */}
                    <Polyline
                        positions={pathPoints}
                        pathOptions={{ 
                            color: 'transparent',
                            weight: 22,
                            opacity: 0,
                            className: 'connection-interaction',
                            lineJoin: 'round'
                        }}
                        eventHandlers={{
                            click: (e) => {
                                L.DomEvent.stopPropagation(e);
                                if (!isSelected) {
                                    if (onConnectionSelect) onConnectionSelect(conn.id);
                                } else if (onConnectionUpdate) {
                                    const { lat, lng } = e.latlng;
                                    let insertIndex = -1;
                                    let minD = Infinity;
                                    
                                    for(let i=0; i<pathPoints.length-1; i++) {
                                        const p1 = pathPoints[i];
                                        const p2 = pathPoints[i+1];
                                        const d = pointToSegmentDistanceSq(lat, lng, p1[0], p1[1], p2[0], p2[1]);
                                        if (d < minD) {
                                            minD = d;
                                            insertIndex = i; 
                                        }
                                    }
                                    
                                    // If currently Auto, convert current visual path to manual control points first
                                    const currentControlPoints = isAuto 
                                        ? pathPoints.slice(1, -1).map(p => ({lat: p[0], lng: p[1]}))
                                        : [...intermediatePoints];

                                    currentControlPoints.splice(insertIndex, 0, { lat, lng });
                                    onConnectionUpdate(conn.id, { controlPoints: currentControlPoints });
                                }
                            },
                            mouseover: (e) => {
                                e.target.openTooltip();
                            },
                            mouseout: (e) => {
                                e.target.closeTooltip();
                            }
                        }}
                    >
                         <Tooltip sticky direction="top" opacity={1} className="!bg-transparent !border-0 !shadow-none p-0">
                             <div className="bg-slate-900/95 backdrop-blur border border-slate-700 p-3 rounded-lg shadow-xl text-xs min-w-[140px]">
                                <div className="font-bold text-slate-200 mb-2 border-b border-slate-700 pb-1 flex justify-between items-center">
                                    <span>Link Metrics</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${isRTO ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                                        {isRTO ? 'DOWN' : 'ACTIVE'}
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center gap-4">
                                        <span className="text-slate-400 flex items-center gap-1"><Activity size={10}/> Latency</span>
                                        <span className={`font-mono font-bold ${maxLatency > 50 ? 'text-yellow-400' : 'text-white'}`}>
                                            {maxLatency}ms
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center gap-4">
                                        <span className="text-slate-400 flex items-center gap-1"><Zap size={10}/> Bandwidth</span>
                                        <span className="font-mono font-bold text-blue-400">
                                            {throughput} Mbps
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center gap-4 border-t border-slate-800 pt-2 mt-2">
                                        <span className="text-slate-500 text-[10px] uppercase">Flow</span>
                                        <span className="text-[10px] text-slate-300 font-bold">{reverseFlow ? 'Reverse' : 'Forward'}</span>
                                    </div>
                                </div>
                             </div>
                         </Tooltip>
                    </Polyline>

                    {isTrafficActive && !isRTO && (
                        <>
                        <Polyline
                            interactive={false}
                            positions={pathPoints}
                            pathOptions={{ 
                                color: healthColor,
                                weight: 14,
                                opacity: 0.1, 
                                className: `traffic-lane ${statusClass}`,
                                lineJoin: 'round'
                            }}
                        />
                        <Polyline
                            interactive={false}
                            positions={packetPathPoints}
                            pathOptions={{ 
                                weight: 8, 
                                opacity: 1,
                                className: `traffic-packet ${animSpeedClass} ${packetGlowClass}`,
                                color: packetColor,
                                lineJoin: 'round'
                            }}
                        />
                        </>
                    )}
                    
                    {isSelected && onConnectionUpdate && (
                        <>
                            {intermediatePoints.map((pt, i) => (
                                <DragHandle 
                                    key={`handle-${i}`}
                                    position={[pt.lat, pt.lng]}
                                    onDrag={(lat, lng) => {
                                        const newPoints = [...intermediatePoints];
                                        newPoints[i] = { lat, lng };
                                        onConnectionUpdate(conn.id, { controlPoints: newPoints });
                                    }}
                                    onRightClick={() => {
                                        const newPoints = intermediatePoints.filter((_, idx) => idx !== i);
                                        onConnectionUpdate(conn.id, { controlPoints: newPoints });
                                    }}
                                    onDoubleClick={() => {
                                        const newPoints = intermediatePoints.filter((_, idx) => idx !== i);
                                        onConnectionUpdate(conn.id, { controlPoints: newPoints });
                                    }}
                                />
                            ))}

                            {(() => {
                                const ghostHandles = [];
                                for (let i = 0; i < pathPoints.length - 1; i++) {
                                    const p1 = pathPoints[i];
                                    const p2 = pathPoints[i+1];
                                    const mid: [number, number] = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
                                    
                                    ghostHandles.push(
                                        <DragHandle 
                                            key={`ghost-${i}`}
                                            position={mid}
                                            isGhost={true}
                                            opacity={0.5}
                                            onDrag={(lat, lng) => {
                                                // If isAuto, materialize first
                                                const currentControlPoints = isAuto 
                                                    ? pathPoints.slice(1, -1).map(p => ({lat: p[0], lng: p[1]}))
                                                    : [...intermediatePoints];

                                                currentControlPoints.splice(i, 0, { lat, lng });
                                                onConnectionUpdate(conn.id, { controlPoints: currentControlPoints });
                                            }}
                                        />
                                    );
                                }
                                return ghostHandles;
                            })()}
                        </>
                    )}
                </React.Fragment>
            );
        });
    }, [nodes, connections, viewMode, selectedConnectionId, onConnectionSelect, onConnectionUpdate]);

  return (
    <MapContainer 
        center={[MAP_CENTER.lat, MAP_CENTER.lng]} 
        zoom={MAP_ZOOM} 
        style={{ height: "100%", width: "100%", background: "transparent", cursor: isLinkMode ? 'crosshair' : 'default' }}
        className={`z-0 ${mapStyle === 'DARK' ? 'map-dark' : ''}`}
    >
      <TileLayer
        attribution={mapStyle === 'SATELLITE' ? 'Tiles &copy; Esri' : '&copy; OpenStreetMap contributors'}
        url={tileUrl}
      />
      
      <MapEvents onMapClick={onMapClick} />
      <InteractionHandler />

      {/* Temporary Link Line (Dragging/Preview) */}
      {(dragLink || (isLinkMode && linkSource && dragLink)) && (
        <Polyline 
            positions={[
                [nodes.find(n => n.id === (dragLink?.sourceId || linkSource))!.location.lat, nodes.find(n => n.id === (dragLink?.sourceId || linkSource))!.location.lng],
                [dragLink!.end.lat, dragLink!.end.lng]
            ]}
            pathOptions={{ 
                color: '#eab308', 
                dashArray: '10, 10', 
                weight: 3, 
                opacity: 0.8,
                className: 'animate-pulse' 
            }}
        />
      )}

      {links}

      {nodes.map(node => (
        <Marker
          key={node.id}
          position={[node.location.lat, node.location.lng]}
          icon={createCustomIcon(node, selectedNodeId === node.id, linkSource === node.id)}
          eventHandlers={{
            click: (e) => {
                L.DomEvent.stopPropagation(e);
                if (isLinkMode) {
                    if (!linkSource) {
                        setLinkSource(node.id);
                    } else {
                        if (linkSource !== node.id && onCreateConnection) {
                            onCreateConnection(linkSource, node.id);
                        }
                        setLinkSource(null);
                    }
                } else {
                    onNodeSelect(node.id);
                }
            },
            mousedown: (e) => {
                // Keep the drag-to-create functionality if user prefers dragging
                if (isLinkMode && !linkSource) {
                    L.DomEvent.stopPropagation(e);
                    setDragLink({ sourceId: node.id, end: e.latlng });
                    e.target._map.dragging.disable();
                }
            },
            mouseup: (e) => {
                if (isLinkMode && dragLink) {
                    L.DomEvent.stopPropagation(e);
                    if (dragLink.sourceId !== node.id && onCreateConnection) {
                        onCreateConnection(dragLink.sourceId, node.id);
                    }
                    setDragLink(null);
                    e.target._map.dragging.enable();
                }
            }
          }}
        >
          <Tooltip direction="top" offset={[0, -20]} opacity={1} className="!bg-transparent !border-0 !shadow-none p-0">
             <div className="bg-slate-900/95 backdrop-blur border border-slate-700 rounded-xl p-3 shadow-2xl min-w-[180px] text-slate-100">
                 {/* Header */}
                 <div className="flex items-center justify-between border-b border-slate-700/50 pb-2 mb-2">
                     <div>
                        <div className="font-bold text-sm text-white">{node.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{node.ipAddress}</div>
                     </div>
                     <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_currentColor] ${node.status === NodeStatus.ONLINE ? 'bg-green-500 text-green-500' : 'bg-red-500 text-red-500'}`}></div>
                 </div>

                 {/* Latency & Loss */}
                 <div className="flex justify-between items-center bg-slate-950/50 rounded px-2 py-1.5 mb-2 border border-slate-800">
                    <div className="flex items-center gap-1.5">
                        <Activity size={12} className="text-slate-500" />
                        <span className="text-xs font-mono font-bold text-white">{node.latency}ms</span>
                    </div>
                    <span className={`text-[10px] font-bold ${node.packetLoss > 0 ? 'text-red-400' : 'text-slate-500'}`}>
                        {node.packetLoss}% Loss
                    </span>
                 </div>

                 {/* Resources */}
                 <div className="grid grid-cols-2 gap-2 mb-2">
                    <div className="bg-slate-800/30 p-1.5 rounded border border-slate-800">
                        <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                            <span className="flex items-center gap-1"><Cpu size={10} /> CPU</span>
                            <span>{node.cpuLoad}%</span>
                        </div>
                        <div className="w-full bg-slate-900 h-1 rounded-full overflow-hidden">
                             <div className={`h-full rounded-full transition-all duration-500 ${node.cpuLoad > 80 ? 'bg-red-500' : 'bg-blue-500'}`} style={{width: `${node.cpuLoad}%`}}></div>
                        </div>
                    </div>
                    <div className="bg-slate-800/30 p-1.5 rounded border border-slate-800">
                        <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                            <span className="flex items-center gap-1"><Server size={10} /> RAM</span>
                            <span>{node.memoryUsage}%</span>
                        </div>
                        <div className="w-full bg-slate-900 h-1 rounded-full overflow-hidden">
                             <div className="h-full rounded-full bg-purple-500 transition-all duration-500" style={{width: `${node.memoryUsage}%`}}></div>
                        </div>
                    </div>
                 </div>

                 {/* Traffic */}
                 <div className="grid grid-cols-2 gap-2 text-[10px]">
                     <div className="flex items-center justify-between text-blue-400 bg-blue-500/10 px-2 py-1 rounded">
                         <span className="flex items-center gap-1"><ArrowUp size={10}/> TX</span>
                         <span className="font-mono font-bold">{node.txRate}M</span>
                     </div>
                     <div className="flex items-center justify-between text-green-400 bg-green-500/10 px-2 py-1 rounded">
                         <span className="flex items-center gap-1"><ArrowDown size={10}/> RX</span>
                         <span className="font-mono font-bold">{node.rxRate}M</span>
                     </div>
                 </div>
             </div>
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
};

export default NetworkMap;