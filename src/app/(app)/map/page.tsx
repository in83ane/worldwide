'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { Navigation, Loader2, ExternalLink, MapPin } from 'lucide-react';

// โหลด MapComponent แบบปิด Server Side Rendering
const MapComponent = dynamic(() => import('./MapComponent'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-slate-100 flex flex-col items-center justify-center rounded-[2.5rem]">
      <Loader2 className="animate-spin text-slate-400" size={40} />
      <p className="text-slate-500 mt-4 font-medium italic">กำลังเตรียมพิกัดแผนที่...</p>
    </div>
  ),
});

// พิกัดจุดเริ่มต้น (ปรับตามตำแหน่งของคุณ)
const MY_LOCATION: [number, number] = [13.7276, 100.7782]; 

const INITIAL_TASKS = [
  { id: 1, name: "จุดส่ง A (ลาดกระบัง)", lat: 13.7276, lng: 100.7782 },
  { id: 2, name: "จุดส่ง B (สยาม)", lat: 13.7456, lng: 100.5341 },
  { id: 3, name: "จุดส่ง C (อโศก)", lat: 13.7367, lng: 100.5612 },
];

export default function OptimizedMapPage() {
  const [displayOrder, setDisplayOrder] = useState<any[]>(INITIAL_TASKS);

  return (
    <div className="ml-20 p-8 bg-slate-50 min-h-screen font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">ระบบจัดลำดับวิ่งงาน</h1>
          <p className="text-slate-500 font-medium">คำนวณเส้นทางที่สั้นที่สุดอัตโนมัติ (No API Key Required)</p>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          {/* Sidebar: รายการที่เรียงลำดับแล้ว */}
          <div className="xl:col-span-1 space-y-6">
            <div className="bg-white p-6 rounded-[2rem] shadow-xl shadow-slate-200/60 border border-white">
              <h2 className="font-bold text-slate-800 mb-6 flex items-center gap-3">
                <Navigation className="text-blue-600" size={20} />
                ลำดับงานวันนี้
              </h2>
              
              <div className="space-y-6 relative">
                {/* เส้นประเชื่อมจุดใน UI */}
                <div className="absolute left-[13.5px] top-4 bottom-4 w-[2.5px] bg-slate-100 rounded-full" />

                {displayOrder.map((task, index) => {
                  if (!task) return null;
                  return (
                    <div key={task.id || index} className="relative flex gap-5 group">
                      <div className="z-10 w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center text-[11px] font-black shadow-lg ring-4 ring-white">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-slate-900 text-sm group-hover:text-blue-600 transition-colors">
                          {task.name}
                        </h3>
                        <button 
                          onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${task.lat},${task.lng}`)}
                          className="mt-2 flex items-center gap-2 text-[10px] text-blue-600 font-bold bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-xl transition-all"
                        >
                          <ExternalLink size={12} />
                          นำทาง Google Maps
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-5 bg-amber-50 rounded-2xl border border-amber-100 flex gap-3">
                <MapPin className="text-amber-600 shrink-0" size={18} />
                <p className="text-[10px] text-amber-800 leading-relaxed font-medium">
                  ระบบจะเลือกจุดแวะพักที่อยู่ใกล้คุณที่สุดให้เป็นลำดับแรกเสมอ เพื่อประหยัดเวลาและน้ำมัน
                </p>
            </div>
          </div>

          {/* พื้นที่แผนที่ */}
          <div className="xl:col-span-3 h-[750px] bg-white p-2 rounded-[3rem] shadow-2xl shadow-slate-200 border border-white overflow-hidden relative z-0">
            <MapComponent 
              tasks={INITIAL_TASKS} 
              center={MY_LOCATION} 
              onOrderChange={setDisplayOrder} 
            />
          </div>
        </div>
      </div>
    </div>
  );
}