'use client';

import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// แก้ไขปัญหา Icon Marker ไม่แสดงผลใน Next.js
const customIcon = new L.Icon({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

interface Task {
  id: number;
  name: string;
  lat: number;
  lng: number;
}

interface MapProps {
  tasks: Task[];
  center: [number, number];
  onOrderChange: (newOrder: Task[]) => void;
}

export default function MapComponent({ tasks, center, onOrderChange }: MapProps) {
  const [route, setRoute] = useState<[number, number][]>([]);
  const [isMounted, setIsMounted] = useState(false);

  // ป้องกัน Error "window is not defined" และ "appendChild"
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || tasks.length === 0) return;

    const getOptimizedTrip = async () => {
      // OSRM Trip API: lng,lat;lng,lat...
      const startCoord = `${center[1]},${center[0]}`;
      const taskCoords = tasks.map((t) => `${t.lng},${t.lat}`).join(';');
      const allCoords = `${startCoord};${taskCoords}`;

      try {
        const res = await fetch(
          `https://router.project-osrm.org/trip/v1/driving/${allCoords}?source=first&geometries=geojson&overview=full`
        );
        const data = await res.json();

        if (data.code === 'Ok' && data.trips?.[0]) {
          // วาดเส้นทางต่อเนื่องเส้นเดียว
          const points = data.trips[0].geometry.coordinates.map((coord: any) => [
            coord[1], // lat
            coord[0], // lng
          ]);
          setRoute(points);

          // ส่งลำดับงานที่เรียงใหม่ (Optimize) กลับไปที่ Page
          if (data.waypoints) {
            const sortedTasks = data.waypoints
              .filter((wp: any) => wp.location_index !== 0) // ตัดจุดเริ่มออก
              .sort((a: any, b: any) => a.waypoint_index - b.waypoint_index)
              .map((wp: any) => tasks[wp.location_index - 1])
              .filter((task: any) => task !== undefined);

            onOrderChange(sortedTasks);
          }
        }
      } catch (err) {
        console.error('OSRM Optimization Error:', err);
      }
    };

    getOptimizedTrip();
  }, [tasks, center, onOrderChange, isMounted]);

  // สำคัญ: อย่าเพิ่ง Render จนกว่าจะอยู่บน Client จริงๆ
  if (!isMounted) return null;

  return (
    <div className="w-full h-full">
      <MapContainer 
        center={center} 
        zoom={13} 
        style={{ height: '100%', width: '100%', borderRadius: '1.5rem' }}
        scrollWheelZoom={true}
      >
        <TileLayer 
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
        />
        
        {route.length > 0 && (
          <Polyline 
            positions={route} 
            pathOptions={{ color: '#2563eb', weight: 6, opacity: 0.7, lineJoin: 'round' }} 
          />
        )}

        {tasks.map((task) => (
          <Marker key={task.id} position={[task.lat, task.lng]} icon={customIcon}>
            <Popup className="font-sans font-bold">{task.name}</Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}