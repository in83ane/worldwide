'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet default icon webpack issue
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

let _taskIcon: L.Icon | null = null;
let _taskCompleteIcon: L.DivIcon | null = null;
let _startIcon: L.DivIcon | null = null;
let _userLocationIcon: L.DivIcon | null = null;

const getTaskIcon = (): L.Icon => {
  if (!_taskIcon) _taskIcon = new L.Icon({
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
  });
  return _taskIcon;
};

const getTaskCompleteIcon = (): L.DivIcon => {
  if (!_taskCompleteIcon) _taskCompleteIcon = L.divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;background:#10b981;border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(16,185,129,0.4);font-size:12px;font-weight:900;color:white;line-height:1">✓</div>`,
    iconSize: [28, 28], iconAnchor: [14, 14],
  });
  return _taskCompleteIcon;
};

const getStartIcon = (): L.DivIcon => {
  if (!_startIcon) _startIcon = L.divIcon({
    className: '',
    html: `<div style="width:32px;height:32px;background:#1e293b;border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
    iconSize: [32, 32], iconAnchor: [16, 32],
  });
  return _startIcon;
};

const getUserLocationIcon = (): L.DivIcon => {
  if (!_userLocationIcon) _userLocationIcon = L.divIcon({
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
  return _userLocationIcon;
};

// ===== Types =====
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
  startPoint: [number, number] | null;
  gpsPos: [number, number] | null;
  gpsTrigger: number;
  onOrderChange: (newOrder: MapTask[], isReady: boolean) => void;
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
  const [h, m] = (t || '08:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function groupByTimeWindow(tasks: MapTask[], windowMin = 90): MapTask[][] {
  const sorted = [...tasks].sort((a, b) => timeToMinutes(a.work_time) - timeToMinutes(b.work_time));
  const groups: MapTask[][] = [];
  let current: MapTask[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (timeToMinutes(sorted[i].work_time) - timeToMinutes(sorted[i - 1].work_time) <= windowMin) {
      current.push(sorted[i]);
    } else {
      groups.push(current);
      current = [sorted[i]];
    }
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

function orderTasksLocal(start: [number, number], tasks: MapTask[]): MapTask[] {
  if (tasks.length <= 1) return [...tasks];
  const groups = groupByTimeWindow(tasks);
  const ordered: MapTask[] = [];
  let curPos = start;
  for (const group of groups) {
    const opt = nearestNeighbor(curPos, group);
    ordered.push(...opt);
    curPos = [opt[opt.length - 1].lat, opt[opt.length - 1].lng];
  }
  return ordered;
}

async function fetchOSRMRoute(waypoints: [number, number][]): Promise<[number, number][]> {
  if (waypoints.length < 2) return [];
  const coords = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    const data = await res.json();
    if (data.code === 'Ok' && data.routes?.[0]) {
      return data.routes[0].geometry.coordinates.map((c: [number, number]): [number, number] => [c[1], c[0]]);
    }
  } catch { /* fallback */ }
  return waypoints; // fallback เส้นตรง
}

export default function MapComponent({
  tasks,
  startPoint,
  gpsPos,
  gpsTrigger,
  onOrderChange,
}: MapComponentProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [orderedTasks, setOrderedTasks] = useState<MapTask[]>([]);
  const [outboundRoute, setOutboundRoute] = useState<[number, number][]>([]);
  const [returnRoute, setReturnRoute] = useState<[number, number][]>([]);

  const prevCalcKey = useRef('');
  const onOrderChangeRef = useRef(onOrderChange);

  const getInitialLastOrdered = (): MapTask[] => {
    try {
      const s = typeof window !== 'undefined' ? localStorage.getItem('map_lastOrdered') : null;
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  };
  const lastOrderedRef = useRef<MapTask[]>(getInitialLastOrdered());

  // persist ตำแหน่งงานสุดท้ายที่ทำเสร็จ — ใช้วาดเส้นส้มขากลับแม้ startPoint เปลี่ยน
  const getInitialLastTaskPos = (): [number, number] | null => {
    try {
      const s = typeof window !== 'undefined' ? localStorage.getItem('map_lastTaskPos') : null;
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  };
  const lastTaskPosRef = useRef<[number, number] | null>(getInitialLastTaskPos());

  useEffect(() => { onOrderChangeRef.current = onOrderChange; }, [onOrderChange]);

  useEffect(() => { setIsMounted(true); }, []);

  // เมื่อ startPoint เปลี่ยน → reset calcKey เพื่อบังคับคำนวณเส้นส้มขากลับใหม่
  useEffect(() => {
    prevCalcKey.current = '';
  }, [startPoint]);

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
    if (!isMounted || !startPoint) {
      setOrderedTasks([]);
      setOutboundRoute([]);
      setReturnRoute([]);
      onOrderChangeRef.current([], false);
      return;
    }

    const allActive = tasks.filter(t => t.status !== 'complete');
    const calcKey = `${startPoint[0]},${startPoint[1]}|${tasks.map(t => `${t.id}:${t.status}`).join(',')}`;

    if (allActive.length === 0) {
      // งานครบทั้งหมด
      if (calcKey === prevCalcKey.current) return;
      prevCalcKey.current = calcKey;

      const completedIds = new Set(tasks.filter(t => t.status === 'complete').map(t => t.id));
      const lastCompleted = lastOrderedRef.current.filter(t => completedIds.has(t.id)).at(-1) ?? null;

      // บันทึก lastTaskPos ถ้าพบ
      if (lastCompleted) {
        const pos: [number, number] = [lastCompleted.lat, lastCompleted.lng];
        lastTaskPosRef.current = pos;
        try { localStorage.setItem('map_lastTaskPos', JSON.stringify(pos)); } catch { /* ignore */ }
      }

      const returnFrom: [number, number] | null = lastCompleted
        ? [lastCompleted.lat, lastCompleted.lng]
        : lastTaskPosRef.current;

      if (returnFrom) {
        fetchOSRMRoute([returnFrom, startPoint]).then(ret => {
          setOrderedTasks([]);
          setOutboundRoute([]);
          setReturnRoute(ret);
          onOrderChangeRef.current([], true);
        });
      } else {
        setOrderedTasks([]);
        setOutboundRoute([]);
        setReturnRoute([]);
        onOrderChangeRef.current([], true);
      }
      return;
    }

    if (calcKey === prevCalcKey.current) return;
    prevCalcKey.current = calcKey;

    const inprogressTask = tasks.find(t => t.status === 'inprogress');
    const pendingTasks = tasks.filter(t => t.status === 'pending');

    const completedIds = new Set(tasks.filter(t => t.status === 'complete').map(t => t.id));
    const lastCompleted = lastOrderedRef.current
      .filter(t => completedIds.has(t.id))
      .at(-1) ?? null;

    // บันทึก lastTaskPos ทุกครั้งที่มีงาน complete ใหม่
    if (lastCompleted) {
      const pos: [number, number] = [lastCompleted.lat, lastCompleted.lng];
      lastTaskPosRef.current = pos;
      try { localStorage.setItem('map_lastTaskPos', JSON.stringify(pos)); } catch { /* ignore */ }
    }

    const departurePoint: [number, number] = inprogressTask
      ? [inprogressTask.lat, inprogressTask.lng]
      : lastCompleted
        ? [lastCompleted.lat, lastCompleted.lng]
        : startPoint;

    const remainingTasks = pendingTasks;
    const orderedRemaining = orderTasksLocal(departurePoint, remainingTasks);

    // เส้นฟ้า: departure → งานที่เหลือ
    const outboundWaypoints: [number, number][] =
      orderedRemaining.length > 0
        ? [departurePoint, ...orderedRemaining.map(t => [t.lat, t.lng] as [number, number])]
        : [];

    // เส้นส้มขากลับ: แสดงเฉพาะเมื่อถึงงานสุดท้ายแล้ว
    // = inprogress + ไม่มี pending เหลือ  หรือ  lastTaskPos ที่บันทึกไว้ (persist หลัง refresh / เปลี่ยน startPoint)
    const isOnLastTask = inprogressTask && remainingTasks.length === 0;
    const allTasksDone = tasks.length > 0 && tasks.every(t => t.status === 'complete');

    let returnFrom: [number, number] | null = null;
    if (isOnLastTask) {
      // กำลังทำงานสุดท้าย → ใช้ตำแหน่ง inprogress
      returnFrom = [inprogressTask.lat, inprogressTask.lng];
    } else if (allTasksDone && lastTaskPosRef.current) {
      // งานเสร็จหมดแล้ว → ใช้ lastTaskPos ที่บันทึกไว้
      returnFrom = lastTaskPosRef.current;
    }
    // ยังมีงานค้างอยู่ → ไม่แสดงเส้นส้ม

    const returnWaypoints: [number, number][] = returnFrom
      ? [returnFrom, startPoint]
      : [];

    const fullOrdered = inprogressTask
      ? [inprogressTask, ...orderedRemaining]
      : orderedRemaining;

    Promise.all([
      outboundWaypoints.length >= 2 ? fetchOSRMRoute(outboundWaypoints) : Promise.resolve([]),
      returnWaypoints.length >= 2 ? fetchOSRMRoute(returnWaypoints) : Promise.resolve([]),
    ]).then(([outbound, ret]) => {
      lastOrderedRef.current = fullOrdered;
      try { localStorage.setItem('map_lastOrdered', JSON.stringify(fullOrdered)); } catch { /* ignore */ }
      setOrderedTasks(fullOrdered);
      setOutboundRoute(outbound as [number, number][]);
      setReturnRoute(ret as [number, number][]);
      onOrderChangeRef.current(fullOrdered, true);
    });
  }, [tasks, startPoint, isMounted]);

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

        {outboundRoute.length > 0 && (
          <Polyline positions={outboundRoute} pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.85, lineJoin: 'round' }} />
        )}
        {returnRoute.length > 0 && (
          <Polyline positions={returnRoute} pathOptions={{ color: '#f97316', weight: 4, opacity: 0.7, dashArray: '10, 8', lineJoin: 'round' }} />
        )}

        <Marker position={startPoint as L.LatLngExpression} icon={getStartIcon()}>
          <Popup><div className="font-sans font-bold text-sm text-slate-800">จุดเริ่มต้น/สิ้นสุด</div></Popup>
        </Marker>

        {tasks.map((task) => {
          const isDone = task.status === 'complete';
          const orderIdx = orderedTasks.findIndex(t => t.id === task.id);
          const label = orderIdx >= 0 ? orderIdx + 1 : '?';
          return (
            <Marker
              key={task.id}
              position={[task.lat, task.lng] as L.LatLngExpression}
              icon={isDone ? getTaskCompleteIcon() : getTaskIcon()}
            >
              <Popup>
                <div className="font-sans font-bold text-sm leading-snug">
                  <span className="text-slate-400 text-xs font-normal">#{label}</span><br />
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
            <Popup><div className="font-sans font-bold text-sm text-blue-600">📍 ตำแหน่งของคุณ</div></Popup>
          </Marker>
        )}
      </MapContainer>

      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-2xl px-4 py-3 shadow-lg flex flex-col gap-1.5 z-[3]">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <div className="w-8 h-1 rounded-full bg-blue-600" /> ขาไป
        </div>
        {returnRoute.length > 0 && (
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <div className="w-8 h-[3px]" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #f97316 0, #f97316 6px, transparent 6px, transparent 12px)' }} />
            ขากลับ
          </div>
        )}
      </div>
    </div>
  );
}