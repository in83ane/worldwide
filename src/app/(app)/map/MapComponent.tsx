'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// ===== Icons =====
const taskIcon: L.Icon = new L.Icon({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

const startIcon = L.divIcon({
  className: '',
  html: `<div style="width:32px;height:32px;background:#1e293b;border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

const userLocationIcon = L.divIcon({
  className: '',
  html: `
    <div style="position:relative;width:24px;height:24px">
      <div style="position:absolute;inset:0;border-radius:50%;background:#3b82f6;opacity:0.25;animation:user-ping 1.5s cubic-bezier(0,0,0.2,1) infinite"></div>
      <div style="position:absolute;inset:4px;border-radius:50%;background:#2563eb;border:3px solid white;box-shadow:0 2px 8px rgba(37,99,235,0.5)"></div>
    </div>
    <style>@keyframes user-ping{0%{transform:scale(1);opacity:.5}100%{transform:scale(2.5);opacity:0}}</style>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

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
  gpsTrigger: number; // เพิ่มขึ้นทุกครั้งที่กดปุ่ม GPS → force flyTo แม้พิกัดเดิม
  onOrderChange: (newOrder: MapTask[], isReady: boolean) => void;
}

function FlyToGps({ pos, trigger }: { pos: [number, number] | null; trigger: number }) {
  const map = useMap();
  useEffect(() => {
    if (!pos) return;
    map.flyTo(pos, 15, { animate: true, duration: 1.5 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]); // fly ทุกครั้งที่ trigger เปลี่ยน ไม่ pedant กับ pos
  return null;
}

// แปลง "HH:MM" → จำนวนนาทีนับจากเที่ยงคืน
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// งานที่เวลาห่างกัน ≤ TIME_WINDOW_MIN นาที ถือว่าอยู่ "ช่วงเดียวกัน" → optimize ระยะทางได้
const TIME_WINDOW_MIN = 90;

// จัดกลุ่มงานตาม time window (เรียงเวลาก่อนแล้วค่อยแบ่งกลุ่ม)
function groupByTimeWindow(tasks: MapTask[]): MapTask[][] {
  const sorted = [...tasks].sort(
    (a, b) => timeToMinutes(a.work_time) - timeToMinutes(b.work_time)
  );
  const groups: MapTask[][] = [];
  let current: MapTask[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const diff = timeToMinutes(sorted[i].work_time) - timeToMinutes(sorted[i - 1].work_time);
    if (diff <= TIME_WINDOW_MIN) {
      current.push(sorted[i]);
    } else {
      groups.push(current);
      current = [sorted[i]];
    }
  }
  groups.push(current);
  return groups;
}

// Haversine distance (km)
function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) *
      Math.cos((b[0] * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// Nearest-neighbor จาก from ในกลุ่มที่กำหนด
function nearestNeighbor(from: [number, number], group: MapTask[]): MapTask[] {
  const remaining = [...group];
  const result: MapTask[] = [];
  let cur = from;
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
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

// เรียงลำดับงานโดยคำนึงถึงเวลา + ระยะทาง (ไม่ต้อง call API)
function orderTasksWithTime(start: [number, number], tasks: MapTask[]): MapTask[] {
  if (tasks.length <= 1) return tasks;
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

// --- OSRM: ดึงเส้นทางจริงแยก 2 calls ---
// outbound: start → t1 → t2 → ... → lastTask
// returnPath: lastTask → start  (เส้นส้มเริ่มจากจุดสุดท้ายเท่านั้น)
interface OSRMRouteResponse {
  code: string;
  routes?: { geometry: { coordinates: [number, number][] } }[];
}

async function fetchRouteForOrder(
  start: [number, number],
  ordered: MapTask[]
): Promise<{ outbound: [number, number][]; returnPath: [number, number][] }> {
  const outboundPoints = [
    `${start[1]},${start[0]}`,
    ...ordered.map(t => `${t.lng},${t.lat}`),
  ].join(';');

  const last = ordered[ordered.length - 1];
  const returnPoints = `${last.lng},${last.lat};${start[1]},${start[0]}`;

  try {
    const [resOut, resRet] = await Promise.all([
      fetch(`https://router.project-osrm.org/route/v1/driving/${outboundPoints}?overview=full&geometries=geojson`),
      fetch(`https://router.project-osrm.org/route/v1/driving/${returnPoints}?overview=full&geometries=geojson`),
    ]);
    const [dataOut, dataRet]: [OSRMRouteResponse, OSRMRouteResponse] = await Promise.all([
      resOut.json(),
      resRet.json(),
    ]);

    const outbound =
      dataOut.code === 'Ok' && dataOut.routes?.[0]
        ? dataOut.routes[0].geometry.coordinates.map((c): [number, number] => [c[1], c[0]])
        : [];

    const returnPath =
      dataRet.code === 'Ok' && dataRet.routes?.[0]
        ? dataRet.routes[0].geometry.coordinates.map((c): [number, number] => [c[1], c[0]])
        : [];

    return { outbound, returnPath };
  } catch (err) {
    console.error('OSRM route error:', err);
    return { outbound: [], returnPath: [] };
  }
}

export default function MapComponent({ tasks, startPoint, gpsPos, gpsTrigger, onOrderChange }: MapComponentProps) {
  const [outboundRoute, setOutboundRoute] = useState<[number, number][]>([]);
  const [returnRoute, setReturnRoute] = useState<[number, number][]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);

  const onOrderChangeRef = useRef(onOrderChange);
  useEffect(() => { onOrderChangeRef.current = onOrderChange; }, [onOrderChange]);

  const prevCalcKey = useRef<string>('');

  useEffect(() => { setIsMounted(true); }, []);

  // Realtime GPS
  useEffect(() => {
    if (!navigator?.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      pos => setUserPos([pos.coords.latitude, pos.coords.longitude]),
      err => console.warn('Geolocation:', err),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // คำนวณเส้นทาง
  useEffect(() => {
    if (!isMounted || tasks.length === 0 || !startPoint) return;

    // รวม work_time ใน key เพื่อ recalculate เมื่อเวลาเปลี่ยนด้วย
    const calcKey = `${startPoint[0]},${startPoint[1]}|${tasks.map(t => `${t.id}:${t.work_time}`).join(',')}`;
    if (calcKey === prevCalcKey.current) return;
    prevCalcKey.current = calcKey;

    onOrderChangeRef.current([], false);

    const calculate = async () => {
      // step 1: เรียงลำดับ (local, เร็ว)
      const ordered = orderTasksWithTime(startPoint, tasks);
      // step 2: ดึงเส้นทางจริง 2 calls parallel
      const { outbound, returnPath } = await fetchRouteForOrder(startPoint, ordered);

      onOrderChangeRef.current(ordered, true);
      setOutboundRoute(outbound);
      setReturnRoute(returnPath);
    };

    calculate();
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

        {/* เส้นขาไป — น้ำเงิน */}
        {outboundRoute.length > 0 && (
          <Polyline
            positions={outboundRoute}
            pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.85, lineJoin: 'round' }}
          />
        )}

        {/* เส้นขากลับ — ส้ม dash (เริ่มจากจุดสุดท้ายเท่านั้น) */}
        {returnRoute.length > 0 && (
          <Polyline
            positions={returnRoute}
            pathOptions={{ color: '#f97316', weight: 4, opacity: 0.7, dashArray: '10, 8', lineJoin: 'round' }}
          />
        )}

        {/* จุดเริ่มต้น */}
        <Marker position={startPoint as L.LatLngExpression} icon={startIcon}>
          <Popup>
            <div className="font-sans font-bold text-sm text-slate-800">🏁 จุดเริ่มต้น</div>
          </Popup>
        </Marker>

        {/* จุดงาน */}
        {tasks.map((task, idx) => (
          <Marker key={task.id} position={[task.lat, task.lng] as L.LatLngExpression} icon={taskIcon}>
            <Popup>
              <div className="font-sans font-bold text-sm leading-snug">
                <span className="text-slate-400 text-xs font-normal">#{idx + 1}</span><br />
                <span>{task.location}</span><br />
                <span className="text-slate-500 font-normal text-xs">{task.name}</span><br />
                <span className="text-blue-500 font-normal text-xs">🕐 {task.work_time} น.</span>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ตำแหน่งผู้ใช้ realtime */}
        {userPos && (
          <Marker position={userPos as L.LatLngExpression} icon={userLocationIcon}>
            <Popup>
              <div className="font-sans font-bold text-sm text-blue-600">📍 ตำแหน่งของคุณ</div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-2xl px-4 py-3 shadow-lg flex flex-col gap-1.5 z-[3]">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <div className="w-8 h-1 rounded-full bg-blue-600" /> ขาไป
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <div
            className="w-8 h-[3px]"
            style={{ backgroundImage: 'repeating-linear-gradient(90deg, #f97316 0, #f97316 6px, transparent 6px, transparent 12px)' }}
          /> ขากลับ
        </div>
      </div>
    </div>
  );
}