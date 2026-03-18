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
  onOrderChange: (newOrder: MapTask[]) => void;
}

function FlyToUser({ pos }: { pos: [number, number] | null }) {
  const map = useMap();
  const hasFlown = useRef(false);
  useEffect(() => {
    if (pos && !hasFlown.current) {
      map.flyTo(pos, map.getZoom(), { animate: true, duration: 1.2 });
      hasFlown.current = true;
    }
  }, [pos, map]);
  return null;
}

// pan ไปตำแหน่ง GPS เมื่อ gpsPos เปลี่ยน (กดปุ่ม GPS)
function FlyToGps({ pos }: { pos: [number, number] | null }) {
  const map = useMap();
  const prevPos = useRef<string>('');
  useEffect(() => {
    if (!pos) return;
    const key = `${pos[0]},${pos[1]}`;
    if (key === prevPos.current) return;
    prevPos.current = key;
    map.flyTo(pos, 15, { animate: true, duration: 1.5 });
  }, [pos, map]);
  return null;
}

interface OSRMTripFullResponse {
  code: string;
  trips?: {
    geometry: { coordinates: [number, number][] };
    legs: { steps: unknown[] }[];
  }[];
  waypoints?: { waypoint_index: number; location_index: number; trips_index: number }[];
}

// call เดียว — ได้ทั้งลำดับที่เหมาะสม + เส้นทางขาไป + เส้นทางขากลับ
async function fetchTripAll(
  start: [number, number],
  tasks: MapTask[]
): Promise<{
  ordered: MapTask[];
  outbound: [number, number][];
  returnPath: [number, number][];
}> {
  const startCoord = `${start[1]},${start[0]}`;
  const taskCoords = tasks.map(t => `${t.lng},${t.lat}`).join(';');

  try {
    const res = await fetch(
      `https://router.project-osrm.org/trip/v1/driving/${startCoord};${taskCoords}` +
      `?source=first&roundtrip=true&overview=full&geometries=geojson`
    );
    const data: OSRMTripFullResponse = await res.json();

    if (data.code === 'Ok' && data.trips?.[0] && data.waypoints) {
      // ลำดับที่เหมาะสม
      const ordered = data.waypoints
        .filter(wp => wp.location_index !== 0)
        .sort((a, b) => a.waypoint_index - b.waypoint_index)
        .map(wp => tasks[wp.location_index - 1])
        .filter((t): t is MapTask => t !== undefined);

      // เส้นทางทั้งหมดจาก trip geometry
      const allCoords = data.trips[0].geometry.coordinates.map(
        (c): [number, number] => [c[1], c[0]]
      );

      // แบ่งขาไป vs ขากลับโดยใช้จำนวน coords แบ่งครึ่ง
      const half = Math.ceil(allCoords.length * 0.75);
      const outbound = allCoords.slice(0, half);
      const returnPath = allCoords.slice(half - 1); // overlap 1 จุดให้ต่อกัน

      return { ordered, outbound, returnPath };
    }
  } catch (err) { console.error('OSRM trip error:', err); }

  return { ordered: tasks, outbound: [], returnPath: [] };
}

export default function MapComponent({ tasks, startPoint, gpsPos, onOrderChange }: MapComponentProps) {
  const [outboundRoute, setOutboundRoute] = useState<[number, number][]>([]);
  const [returnRoute, setReturnRoute] = useState<[number, number][]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  // ใช้ ref เก็บ onOrderChange เพื่อไม่ให้ useEffect loop เมื่อ reference เปลี่ยน
  const onOrderChangeRef = useRef(onOrderChange);
  useEffect(() => { onOrderChangeRef.current = onOrderChange; }, [onOrderChange]);
  // track startPoint+tasks ก่อนหน้าเพื่อกัน recalculate ซ้ำ
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

  // คำนวณเส้นทางเมื่อมี startPoint และ tasks
  useEffect(() => {
    if (!isMounted || tasks.length === 0 || !startPoint) return;

    // กัน recalculate ซ้ำเมื่อ tasks/startPoint ไม่ได้เปลี่ยนจริง
    const calcKey = `${startPoint[0]},${startPoint[1]}|${tasks.map(t => t.id).join(',')}`;
    if (calcKey === prevCalcKey.current) return;
    prevCalcKey.current = calcKey;

    const calculate = async () => {
      const { ordered, outbound, returnPath } = await fetchTripAll(startPoint, tasks);
      onOrderChangeRef.current(ordered);
      setOutboundRoute(outbound);
      setReturnRoute(returnPath);
    };

    calculate();
  }, [tasks, startPoint, isMounted]); // ไม่ใส่ onOrderChange — ใช้ ref แทน

  if (!isMounted) return null;

  // render แผนที่เมื่อมี startPoint เท่านั้น — GPS ใช้แค่แสดงจุดตำแหน่งปัจจุบัน
  if (!startPoint) return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 rounded-[1.5rem] gap-3 text-slate-400">
      <div className="text-4xl">🗺️</div>
      <p className="text-sm font-bold">กรอกจุดเริ่มต้นเพื่อแสดงแผนที่</p>
      <p className="text-xs text-slate-300">พิมพ์ชื่อสถานที่แล้วกด &quot;ค้นหา&quot;</p>
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

        <FlyToGps pos={gpsPos} />

        {/* เส้นขาไป — น้ำเงิน */}
        {outboundRoute.length > 0 && (
          <Polyline
            positions={outboundRoute}
            pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.85, lineJoin: 'round' }}
          />
        )}

        {/* เส้นขากลับ — ส้ม dash */}
        {returnRoute.length > 0 && (
          <Polyline
            positions={returnRoute}
            pathOptions={{ color: '#f97316', weight: 4, opacity: 0.7, dashArray: '10, 8', lineJoin: 'round' }}
          />
        )}

        {/* จุดเริ่มต้น */}
        {startPoint && (
          <Marker position={startPoint as L.LatLngExpression} icon={startIcon}>
            <Popup>
              <div className="font-sans font-bold text-sm text-slate-800">🏁 จุดเริ่มต้น</div>
            </Popup>
          </Marker>
        )}

        {/* จุดงาน */}
        {tasks.map((task, idx) => (
          <Marker key={task.id} position={[task.lat, task.lng] as L.LatLngExpression} icon={taskIcon}>
            <Popup>
              <div className="font-sans font-bold text-sm leading-snug">
                <span className="text-slate-400 text-xs font-normal">#{idx + 1}</span><br />
                <span>{task.location}</span><br />
                <span className="text-slate-500 font-normal text-xs">{task.name}</span>
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
          <div className="w-8 h-[3px] rounded-full bg-orange-500" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #f97316 0, #f97316 6px, transparent 6px, transparent 12px)' }} /> ขากลับ
        </div>
      </div>
    </div>
  );
}