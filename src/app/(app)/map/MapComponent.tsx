'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

let _taskIcon: L.Icon | null = null;
let _taskCompleteIcon: L.DivIcon | null = null;
let _startIcon: L.DivIcon | null = null;
let _userLocationIcon: L.DivIcon | null = null;

const getTaskIcon = (): L.Icon => {
  if (!_taskIcon) {
    _taskIcon = new L.Icon({
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
    });
  }
  return _taskIcon;
};

const getTaskCompleteIcon = (): L.DivIcon => {
  if (!_taskCompleteIcon) {
    _taskCompleteIcon = L.divIcon({
      className: '',
      html: `<div style="width:28px;height:28px;background:#10b981;border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(16,185,129,0.4);font-size:12px;font-weight:900;color:white;line-height:1">✓</div>`,
      iconSize: [28, 28], iconAnchor: [14, 14],
    });
  }
  return _taskCompleteIcon;
};

const getStartIcon = (): L.DivIcon => {
  if (!_startIcon) {
    _startIcon = L.divIcon({
      className: '',
      html: `<div style="width:32px;height:32px;background:#1e293b;border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
      iconSize: [32, 32], iconAnchor: [16, 32],
    });
  }
  return _startIcon;
};

const getUserLocationIcon = (): L.DivIcon => {
  if (!_userLocationIcon) {
    _userLocationIcon = L.divIcon({
      className: '',
      html: `
        <div style="position:relative;width:24px;height:24px">
          <div style="position:absolute;inset:0;border-radius:50%;background:#3b82f6;opacity:0.25;animation:user-ping 1.5s cubic-bezier(0,0,0.2,1) infinite"></div>
          <div style="position:absolute;inset:4px;border-radius:50%;background:#2563eb;border:3px solid white;box-shadow:0 2px 8px rgba(37,99,235,0.5)"></div>
        </div>
        <style>@keyframes user-ping{0%{transform:scale(1);opacity:.5}100%{transform:scale(2.5);opacity:0}}</style>
      `,
      iconSize: [24, 24], iconAnchor: [12, 12],
    });
  }
  return _userLocationIcon;
};

export interface MapTask {
  id: string;
  name: string;
  location: string;
  lat: number;
  lng: number;
  status: 'pending' | 'inprogress' | 'complete';
  work_time: string;
  color: string;
}

export interface MapComponentProps {
  tasks: MapTask[];
  orderedIds: string[];
  startPoint: [number, number] | null;
  gpsPos: [number, number] | null;
  gpsTrigger: number;
  showReturnRoute: boolean;
  onRouteReady: (ready: boolean) => void;
}

function FlyToGps({ pos, trigger }: { pos: [number, number] | null; trigger: number }) {
  const map = useMap();
  useEffect(() => {
    if (!pos) return;
    map.flyTo(pos, 15, { animate: true, duration: 1.5 });
  }, [trigger]);
  return null;
}

function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

const TIME_WINDOW_MIN = 90;

function groupByTimeWindow(tasks: MapTask[]): MapTask[][] {
  const sorted = [...tasks].sort((a, b) => timeToMinutes(a.work_time) - timeToMinutes(b.work_time));
  const groups: MapTask[][] = [];
  let current: MapTask[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const diff = timeToMinutes(sorted[i].work_time) - timeToMinutes(sorted[i - 1].work_time);
    if (diff <= TIME_WINDOW_MIN) current.push(sorted[i]);
    else { groups.push(current); current = [sorted[i]]; }
  }
  groups.push(current);
  return groups;
}

function nearestNeighbor(from: [number, number], group: MapTask[]): MapTask[] {
  const remaining = [...group];
  const result: MapTask[] = [];
  let cur = from;
  while (remaining.length > 0) {
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(cur, [remaining[i].lat, remaining[i].lng]);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    result.push(remaining[bestIdx]);
    cur = [remaining[bestIdx].lat, remaining[bestIdx].lng];
    remaining.splice(bestIdx, 1);
  }
  return result;
}

function orderTasksWithTime(start: [number, number], tasks: MapTask[]): MapTask[] {
  if (tasks.length === 0) return [];
  if (tasks.length === 1) return tasks;
  const groups = groupByTimeWindow(tasks);
  const ordered: MapTask[] = [];
  let curPos = start;
  for (const group of groups) {
    const optimized = nearestNeighbor(curPos, group);
    ordered.push(...optimized);
    const last = optimized[optimized.length - 1];
    curPos = [last.lat, last.lng];
  }
  return ordered;
}

interface OSRMRouteResponse {
  code: string;
  routes?: { geometry: { coordinates: [number, number][] } }[];
}

async function fetchOSRM(points: string): Promise<[number, number][]> {
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${points}?overview=full&geometries=geojson`);
    const data: OSRMRouteResponse = await res.json();
    if (data.code === 'Ok' && data.routes?.[0]) {
      return data.routes[0].geometry.coordinates.map((c): [number, number] => [c[1], c[0]]);
    }
  } catch (err) { console.error('OSRM error:', err); }
  return [];
}

export default function MapComponent({
  tasks,
  orderedIds,
  startPoint,
  gpsPos,
  gpsTrigger,
  showReturnRoute,
  onRouteReady,
}: MapComponentProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);

  const [segments, setSegments] = useState<[number, number][][]>([]);
  const [returnSeg, setReturnSeg] = useState<[number, number][]>([]);

  const prevCalcKey = useRef('');
  const onRouteReadyRef = useRef(onRouteReady);
  useEffect(() => { onRouteReadyRef.current = onRouteReady; }, [onRouteReady]);

  useEffect(() => { setIsMounted(true); }, []);

  useEffect(() => {
    if (!navigator?.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      pos => setUserPos([pos.coords.latitude, pos.coords.longitude]),
      err => console.warn('Geo:', err),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  useEffect(() => {
    if (!isMounted || !startPoint || orderedIds.length === 0) {
      setSegments([]);
      setReturnSeg([]);
      onRouteReadyRef.current(false);
      return;
    }

    const taskMap = new Map(tasks.map(t => [t.id, t]));
    const ordered = orderedIds.map(id => taskMap.get(id)).filter(Boolean) as MapTask[];
    if (ordered.length === 0) return;

    const calcKey = `${startPoint[0]},${startPoint[1]}|${orderedIds.join(',')}`;
    if (calcKey === prevCalcKey.current) return;
    prevCalcKey.current = calcKey;

    onRouteReadyRef.current(false);

    const calculate = async () => {
      const waypoints: [number, number][] = [startPoint, ...ordered.map(t => [t.lat, t.lng] as [number, number])];

      const segPromises = waypoints.slice(0, -1).map((from, i) => {
        const to = waypoints[i + 1];
        return fetchOSRM(`${from[1]},${from[0]};${to[1]},${to[0]}`);
      });

      const last = ordered[ordered.length - 1];
      const retPromise = fetchOSRM(`${last.lng},${last.lat};${startPoint[1]},${startPoint[0]}`);

      const [segsResult, retResult] = await Promise.all([
        Promise.all(segPromises),
        retPromise,
      ]);

      setSegments(segsResult);
      setReturnSeg(retResult);
      onRouteReadyRef.current(true);
    };

    calculate();
  }, [orderedIds, startPoint, isMounted, tasks]);

  if (!isMounted) return null;

  if (!startPoint) return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 rounded-[1.5rem] gap-3 text-slate-400">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      <p className="text-sm font-bold">กรอกจุดเริ่มต้นเพื่อแสดงแผนที่</p>
    </div>
  );

  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const ordered = orderedIds.map(id => taskMap.get(id)).filter(Boolean) as MapTask[];

  const visibleSegments = segments.map((seg, i) => {
    const targetTask = ordered[i];
    if (!targetTask) return null;
    if (targetTask.status === 'inprogress' || targetTask.status === 'complete') return null;
    return seg;
  }).filter((seg): seg is [number, number][] => seg !== null && seg.length > 0);

  const firstTask = ordered[0];
  const hasLeftStart = firstTask?.status === 'inprogress' || firstTask?.status === 'complete';
  const showReturn = hasLeftStart && returnSeg.length > 0;

  return (
    <div className="w-full h-full relative" style={{ isolation: 'isolate' }}>
      <style>{`
        .leaflet-pane { z-index: 1 !important; }
        .leaflet-top, .leaflet-bottom { z-index: 2 !important; }
      `}</style>

      <MapContainer
        center={startPoint as L.LatLngExpression}
        zoom={12}
        style={{ height: '100%', width: '100%', borderRadius: '1.5rem' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FlyToGps pos={gpsPos} trigger={gpsTrigger} />

        {visibleSegments.map((seg, i) => (
          <Polyline
            key={i}
            positions={seg}
            pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.85, lineJoin: 'round' }}
          />
        ))}
        {showReturn && (
          <Polyline
            positions={returnSeg}
            pathOptions={{ color: '#f97316', weight: 4, opacity: 0.7, dashArray: '10, 8', lineJoin: 'round' }}
          />
        )}
        <Marker position={startPoint as L.LatLngExpression} icon={getStartIcon()}>
          <Popup>
            <div className="font-sans font-bold text-sm text-slate-800">
              {hasLeftStart ? 'จุดสิ้นสุด' : 'จุดเริ่มต้น / บ้าน'}
            </div>
          </Popup>
        </Marker>
        {ordered.map((task, idx) => {
          const isDone = task.status === 'complete';
          return (
            <Marker
              key={task.id}
              position={[task.lat, task.lng] as L.LatLngExpression}
              icon={isDone ? getTaskCompleteIcon() : getTaskIcon()}
            >
              <Popup>
                <div className="font-sans font-bold text-sm leading-snug">
                  <span className="text-slate-400 text-xs font-normal">#{idx + 1}</span><br />
                  <span>{task.location}</span><br />
                  <span className="text-slate-500 font-normal text-xs">{task.name}</span><br />
                  <span className={`font-normal text-xs ${isDone ? 'text-emerald-500' : 'text-blue-500'}`}>
                    {isDone ? 'เสร็จแล้ว' : `${task.work_time} น.`}
                  </span>
                </div>
              </Popup>
            </Marker>
          );
        })}
        {userPos && (
          <Marker position={userPos as L.LatLngExpression} icon={getUserLocationIcon()}>
            <Popup><div className="font-sans font-bold text-sm text-blue-600">ตำแหน่งของคุณ</div></Popup>
          </Marker>
        )}
      </MapContainer>
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-2xl px-4 py-3 shadow-lg flex flex-col gap-1.5 z-[3]">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <div className="w-8 h-1 rounded-full bg-blue-600" /> ขาไป
        </div>
        {showReturn && (
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <div className="w-8 h-[3px]" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #f97316 0, #f97316 6px, transparent 6px, transparent 12px)' }} />
            ขากลับ
          </div>
        )}
      </div>
    </div>
  );
}