'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const taskIcon: L.Icon = new L.Icon({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
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

interface OSRMTripResponse {
  code: string;
  trips?: { geometry: { coordinates: [number, number][] } }[];
  waypoints?: { waypoint_index: number; location_index: number }[];
}

interface MapComponentProps {
  tasks: MapTask[];
  center: [number, number];
  onOrderChange: (newOrder: MapTask[]) => void;
}

// pan ไปหาตำแหน่งผู้ใช้ครั้งแรกที่ได้รับ GPS
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

export default function MapComponent({ tasks, center, onOrderChange }: MapComponentProps) {
  const [route, setRoute] = useState<[number, number][]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);

  useEffect(() => { setIsMounted(true); }, []);

  // realtime GPS
  useEffect(() => {
    if (!navigator?.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setUserPos([pos.coords.latitude, pos.coords.longitude]),
      (err) => console.warn('Geolocation:', err),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // OSRM route optimization — ใช้ userPos เป็นจุดเริ่มถ้ามี
  useEffect(() => {
    if (!isMounted || tasks.length === 0) return;

    const startPoint = userPos ?? center;
    const startCoord = `${startPoint[1]},${startPoint[0]}`;
    const taskCoords = tasks.map(t => `${t.lng},${t.lat}`).join(';');

    const getOptimizedTrip = async () => {
      try {
        const res = await fetch(
          `https://router.project-osrm.org/trip/v1/driving/${startCoord};${taskCoords}?source=first&geometries=geojson&overview=full`
        );
        const data: OSRMTripResponse = await res.json();

        if (data.code === 'Ok' && data.trips?.[0]) {
          const points = data.trips[0].geometry.coordinates.map(
            (coord): [number, number] => [coord[1], coord[0]]
          );
          setRoute(points);

          if (data.waypoints) {
            const sorted = data.waypoints
              .filter(wp => wp.location_index !== 0)
              .sort((a, b) => a.waypoint_index - b.waypoint_index)
              .map(wp => tasks[wp.location_index - 1])
              .filter((t): t is MapTask => t !== undefined);
            onOrderChange(sorted);
          }
        }
      } catch (err) {
        console.error('OSRM Error:', err);
      }
    };

    getOptimizedTrip();
  }, [tasks, center, userPos, onOrderChange, isMounted]);

  if (!isMounted) return null;

  // รอ GPS จริงๆ ก่อน render MapContainer เสมอ
  // เพราะ MapContainer center เปลี่ยนหลัง mount ไม่ได้
  if (!userPos) return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 rounded-[1.5rem] gap-3">
      <div className="w-8 h-8 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
      <p className="text-sm font-bold text-slate-400">กำลังระบุตำแหน่ง GPS...</p>
      <p className="text-xs text-slate-300">กรุณาอนุญาตการเข้าถึงตำแหน่งที่ตั้ง</p>
    </div>
  );

  return (
    <div className="w-full h-full" style={{ isolation: 'isolate' }}>
      {/* ลด z-index ของ leaflet ให้ต่ำกว่า modal (z-[200]) */}
      <style>{`
        .leaflet-pane { z-index: 1 !important; }
        .leaflet-top, .leaflet-bottom { z-index: 2 !important; }
        .leaflet-map-pane { z-index: 1 !important; }
      `}</style>

      <MapContainer
        center={userPos as L.LatLngExpression}
        zoom={13}
        style={{ height: '100%', width: '100%', borderRadius: '1.5rem' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FlyToUser pos={userPos} />

        {route.length > 0 && (
          <Polyline
            positions={route}
            pathOptions={{ color: '#2563eb', weight: 6, opacity: 0.75, lineJoin: 'round' }}
          />
        )}

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

        {userPos && (
          <Marker position={userPos as L.LatLngExpression} icon={userLocationIcon}>
            <Popup>
              <div className="font-sans font-bold text-sm text-blue-600">📍 ตำแหน่งของคุณ</div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}