'use client';

import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const customIcon: L.Icon = new L.Icon({
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

// กำหนด Type สำหรับข้อมูลจาก OSRM API
interface OSRMWaypoint {
  waypoint_index: number;
  location_index: number;
}

interface OSRMTripResponse {
  code: string;
  trips?: {
    geometry: {
      coordinates: [number, number][];
    };
  }[];
  waypoints?: OSRMWaypoint[];
}

export default function MapComponent({ tasks, center, onOrderChange }: MapProps) {
  const [route, setRoute] = useState<[number, number][]>([]);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || tasks.length === 0) return;

    const getOptimizedTrip = async () => {
      const startCoord = `${center[1]},${center[0]}`;
      const taskCoords = tasks.map((t) => `${t.lng},${t.lat}`).join(';');
      const allCoords = `${startCoord};${taskCoords}`;

      try {
        const res = await fetch(
          `https://router.project-osrm.org/trip/v1/driving/${allCoords}?source=first&geometries=geojson&overview=full`
        );
        const data: OSRMTripResponse = await res.json();

        if (data.code === 'Ok' && data.trips?.[0]) {
          const points = data.trips[0].geometry.coordinates.map((coord): [number, number] => [
            coord[1], // lat
            coord[0], // lng
          ]);
          setRoute(points);

          if (data.waypoints) {
            const sortedTasks = data.waypoints
              .filter((wp) => wp.location_index !== 0)
              .sort((a, b) => a.waypoint_index - b.waypoint_index)
              .map((wp) => tasks[wp.location_index - 1])
              .filter((task): task is Task => task !== undefined);

            onOrderChange(sortedTasks);
          }
        }
      } catch (err) {
        console.error('OSRM Optimization Error:', err);
      }
    };

    getOptimizedTrip();
  }, [tasks, center, onOrderChange, isMounted]);

  if (!isMounted) return null;

  return (
    <div className="w-full h-full">
      <MapContainer 
        center={center as L.LatLngExpression} // Cast ให้ตรงกับ Type ของ Leaflet
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
          <Marker 
            key={task.id} 
            position={[task.lat, task.lng] as L.LatLngExpression} 
            icon={customIcon}
          >
            <Popup>
              <div className="font-sans font-bold">
                {task.name}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}