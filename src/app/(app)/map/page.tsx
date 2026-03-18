'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Navigation, Loader2, ExternalLink, X, Clock, MapPin, Building2, Search, ChevronDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { MapTask } from './MapComponent';

// ===== Types =====
interface Employee {
  id: string;
  name: string;
  image_url: string | null;
  departments: { name: string; color_code: string } | null;
}

interface WorkScheduleRow {
  id: string;
  detail: string;
  department: string;
  work_date: string;
  work_time: string;
  worker: string;
  worker_role: string;
  status: 'pending' | 'inprogress' | 'complete';
  lat: number | null;
  lng: number | null;
  completed_at: string | null;
  employee_ids: string[] | null;
}

interface Department {
  name: string;
  color_code: string;
}

interface MapComponentProps {
  tasks: MapTask[];
  center: [number, number];
  onOrderChange: (newOrder: MapTask[]) => void;
}

// ===== Dynamic Map Import =====
const MapComponent = dynamic<MapComponentProps>(
  () => import('./MapComponent'),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full bg-slate-100 flex flex-col items-center justify-center rounded-[2.5rem]">
        <Loader2 className="animate-spin text-slate-400" size={40} />
        <p className="text-slate-500 mt-4 font-medium">กำลังโหลดแผนที่...</p>
      </div>
    ),
  }
);

const DEFAULT_CENTER: [number, number] = [13.7563, 100.5018]; // Bangkok

const getAvatarUrl = (name: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'Staff')}&background=random&color=fff&size=200`;

export default function MapPage() {
  const supabase = useMemo(() => createClient(), []);

  const [isAdmin, setIsAdmin] = useState(false);
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [empDropdownOpen, setEmpDropdownOpen] = useState(false);
  const [empSearch, setEmpSearch] = useState('');

  const [works, setWorks] = useState<WorkScheduleRow[]>([]);
  const [deptColorMap, setDeptColorMap] = useState<Record<string, string>>({});
  const [mapTasks, setMapTasks] = useState<MapTask[]>([]);
  const [orderedTasks, setOrderedTasks] = useState<MapTask[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [selectedWork, setSelectedWork] = useState<WorkScheduleRow | null>(null);

  // ===== Init =====
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const [{ data: profile }, { data: employee }, { data: empsData }, { data: deptsData }] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', authUser.id).single(),
        supabase.from('employees').select('id').eq('user_id', authUser.id).single(),
        supabase.from('employees').select('id, name, image_url, departments:department_id(name, color_code)'),
        supabase.from('departments').select('name, color_code'),
      ]);

      const admin = profile?.role === 'admin';
      const empId = employee?.id ?? null;

      setIsAdmin(admin);
      setCurrentEmployeeId(empId);
      setEmployees((empsData ?? []) as unknown as Employee[]);

      const colorMap = ((deptsData ?? []) as Department[]).reduce((acc, d) => {
        acc[d.name] = d.color_code;
        return acc;
      }, {} as Record<string, string>);
      setDeptColorMap(colorMap);

      // non-admin ดูแค่ตัวเอง
      if (!admin && empId) setSelectedEmployeeId(empId);

      setLoading(false);
    };
    init();
  }, [supabase]);

  // ===== Fetch works เมื่อเลือก employee =====
  useEffect(() => {
    const fetchWorks = async () => {
      const targetId = selectedEmployeeId;
      if (!targetId) { setWorks([]); setMapTasks([]); setOrderedTasks([]); return; }

      const { data } = await supabase
        .from('work_schedule')
        .select('*')
        .contains('employee_ids', [targetId])
        .neq('status', 'complete');

      const rows = (data ?? []) as WorkScheduleRow[];
      setWorks(rows);

      // ดึง deptColorMap จาก state ปัจจุบัน (ไม่ใส่เป็น dependency)
      setDeptColorMap(prev => {
        const tasks: MapTask[] = rows
          .filter(w => w.lat && w.lng)
          .map(w => {
            const roles = w.worker_role?.split(', ') ?? [];
            const color = prev[roles[0]] || '#64748b';
            return {
              id: w.id,
              name: w.detail,
              location: w.department,
              lat: w.lat!,
              lng: w.lng!,
              status: w.status,
              work_time: w.work_time,
              color,
            };
          });

        setMapTasks(tasks);
        // set orderedTasks เป็น fallback — OSRM จะ override ทีหลังผ่าน handleOrderChange
        setOrderedTasks(tasks);
        return prev; // ไม่เปลี่ยน deptColorMap
      });
    };
    fetchWorks();
  }, [selectedEmployeeId, supabase]); // ไม่ใส่ deptColorMap เพื่อกัน re-run

  const handleOrderChange = useCallback((newOrder: MapTask[]) => {
    setOrderedTasks(newOrder);
  }, []);

  // ===== Update status =====
  const updateStatus = async (id: string, status: 'pending' | 'inprogress' | 'complete') => {
    const updates: Partial<WorkScheduleRow> & { completed_at?: string } = { status };
    if (status === 'complete') updates.completed_at = new Date().toISOString();

    await supabase.from('work_schedule').update(updates).eq('id', id);

    setWorks(prev => prev.map(w => w.id === id ? { ...w, status } : w));
    setMapTasks(prev => prev.filter(t => t.id !== id || status !== 'complete'));
    setOrderedTasks(prev => prev.filter(t => t.id !== id || status !== 'complete'));
    setShowModal(false);
  };

  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId);
  const filteredEmployees = employees.filter(e =>
    e.name.toLowerCase().includes(empSearch.toLowerCase())
  );

  // ส่ง [0,0] เพื่อให้ MapComponent รอ GPS เอง ไม่ใช้ default ที่อาจผิด
  const mapCenter: [number, number] = mapTasks.length > 0
    ? [mapTasks[0].lat, mapTasks[0].lng]
    : [0, 0];

  if (loading) return (
    <div className="h-screen flex items-center justify-center">
      <Loader2 className="animate-spin text-slate-300" size={40} />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-slate-900 rounded-2xl text-white shadow-xl">
              <Navigation size={24} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900">ระบบจัดเส้นทางงาน</h1>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">Route Optimization</p>
            </div>
          </div>

          {/* Admin: เลือกพนักงาน */}
          {isAdmin && (
            <div className="relative w-72" >
              <button
                onClick={() => setEmpDropdownOpen(!empDropdownOpen)}
                className="w-full h-[52px] px-4 bg-slate-50 border-2 rounded-2xl font-bold text-left flex justify-between items-center hover:border-slate-400 transition-all"
              >
                <div className="flex items-center gap-3">
                  {selectedEmployee ? (
                    <>
                      <img src={selectedEmployee.image_url || getAvatarUrl(selectedEmployee.name)} className="w-8 h-8 rounded-xl object-cover" />
                      <span className="text-slate-800">{selectedEmployee.name}</span>
                    </>
                  ) : (
                    <span className="text-slate-400">เลือกพนักงาน...</span>
                  )}
                </div>
                <ChevronDown size={18} className={`text-slate-400 transition-transform ${empDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {empDropdownOpen && (
                <div className="absolute z-50 w-full bg-white shadow-2xl rounded-2xl mt-2 border border-slate-100 overflow-hidden">
                  <div className="p-2 border-b border-slate-50">
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                      <input
                        autoFocus
                        placeholder="ค้นหาชื่อ..."
                        value={empSearch}
                        onChange={e => setEmpSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 bg-slate-50 rounded-xl text-sm font-bold outline-none"
                      />
                    </div>
                  </div>
                  <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                    {filteredEmployees.map(emp => (
                      <button key={emp.id} onClick={() => { setSelectedEmployeeId(emp.id); setEmpDropdownOpen(false); setEmpSearch(''); }}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${selectedEmployeeId === emp.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`}>
                        <img src={emp.image_url || getAvatarUrl(emp.name)} className="w-9 h-9 rounded-xl object-cover" />
                        <div className="text-left">
                          <p className="font-bold text-sm">{emp.name}</p>
                          <p className="text-[10px] opacity-60 uppercase font-black">{emp.departments?.name}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </header>

        {!selectedEmployeeId ? (
          <div className="bg-white rounded-[2rem] p-24 text-center border border-slate-100">
            <Navigation size={48} className="text-slate-200 mx-auto mb-4" />
            <p className="text-slate-400 font-bold">เลือกพนักงานเพื่อดูเส้นทางงาน</p>
          </div>
        ) : (
          <>
            {/* Map */}
            <div className="bg-white p-2 rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden" style={{ height: 500 }}>
              {mapTasks.length > 0 ? (
                <MapComponent tasks={mapTasks} center={mapCenter} onOrderChange={handleOrderChange} />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-300">
                  <MapPin size={48} className="mb-3" />
                  <p className="font-bold">ไม่มีงานที่มีพิกัด</p>
                  <p className="text-xs mt-1 text-slate-400">งานจะแสดงเมื่อมีการบันทึก lat/lng จากชื่อสถานที่</p>
                </div>
              )}
            </div>

            {/* Ordered route list */}
            {orderedTasks.length > 0 && (
              <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100">
                <h2 className="font-black text-slate-800 mb-4 flex items-center gap-2">
                  <Navigation size={18} className="text-blue-600" /> ลำดับเส้นทางที่เหมาะสม
                </h2>
                <div className="space-y-3 relative">
                  <div className="absolute left-[15px] top-4 bottom-4 w-[2px] bg-slate-100" />
                  {orderedTasks.map((task, idx) => (
                    <div key={task.id} className="flex gap-4 items-center">
                      <div className="z-10 w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-black shadow-lg ring-4 ring-white shrink-0">
                        {idx + 1}
                      </div>
                      <div className="flex-grow p-3 bg-slate-50 rounded-2xl flex justify-between items-center">
                        <div>
                          <p className="font-black text-slate-800 text-sm">{task.location}</p>
                          <p className="text-xs text-slate-400 font-bold mt-0.5">{task.name}</p>
                        </div>
                        <button onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${task.lat},${task.lng}`)}
                          className="flex items-center gap-1.5 text-[10px] text-blue-600 font-black bg-blue-50 px-3 py-1.5 rounded-xl shrink-0 ml-3">
                          <ExternalLink size={11} /> Google Maps
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Job list ใต้แผนที่ */}
            <div className="space-y-3">
              <h2 className="font-black text-slate-800 px-1">งานทั้งหมด ({works.length})</h2>
              {works.length === 0 ? (
                <div className="bg-white rounded-[2rem] p-16 text-center border border-slate-100 text-slate-300">
                  <p className="font-bold">ไม่มีงานค้าง</p>
                </div>
              ) : (
                works.map(work => {
                  const roles = work.worker_role?.split(', ') ?? [];
                  const colors = roles.map(r => deptColorMap[r] || '#94a3b8');
                  const barStyle = colors.length > 1
                    ? { background: `linear-gradient(to bottom, ${colors.join(', ')})` }
                    : { backgroundColor: colors[0] };
                  const isOverdue = new Date(`${work.work_date}T${work.work_time}`) < new Date() && work.status === 'pending';
                  const isInProgress = work.status === 'inprogress';

                  return (
                    <div key={work.id}
                      onClick={() => { setSelectedWork(work); setShowModal(true); }}
                      className="relative bg-white rounded-[2rem] border-2 border-slate-50 overflow-hidden flex items-stretch cursor-pointer hover:shadow-md transition-all">
                      {/* แถบสีซ้าย gradient แนวตั้ง */}
                      <div className="w-2.5 shrink-0" style={barStyle} />

                      <div className="p-5 flex-grow">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <span className={`text-[10px] font-black px-3 py-1 rounded-full text-white uppercase ${isOverdue ? 'bg-red-500' : isInProgress ? 'bg-amber-500' : 'bg-slate-400'}`}>
                            {isOverdue ? 'OVERDUE' : work.status.toUpperCase()}
                          </span>
                          <span className="text-sm font-black text-indigo-600 flex items-center gap-1 bg-indigo-50 px-3 py-1 rounded-xl">
                            <MapPin size={14} /> {work.department}
                          </span>
                          <span className="text-sm font-black text-slate-600 flex items-center gap-1">
                            <Clock size={14} /> {work.work_time} น.
                          </span>
                        </div>
                        <p className="text-lg font-black text-slate-800 leading-tight">{work.detail}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal — เหมือน home/calendar */}
      {showModal && selectedWork && (() => {
        const roles = selectedWork.worker_role?.split(', ') ?? [];
        const colors = roles.map(r => deptColorMap[r] || '#94a3b8');
        const barStyle = colors.length > 1
          ? { background: `linear-gradient(to right, ${colors.join(', ')})` }
          : { backgroundColor: colors[0] };
        const mainColor = colors[0] || '#94a3b8';

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4"
            onClick={() => setShowModal(false)}>
            <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl relative overflow-hidden"
              onClick={e => e.stopPropagation()}>

              {/* gradient bar */}
              <div className="h-3 w-full" style={barStyle} />

              <div className="p-8 md:p-10">
                <div className="flex justify-between items-start mb-8">
                  <div className="flex flex-col gap-2">
                    <h3 className="text-2xl font-black text-slate-800 leading-tight">รายละเอียดภารกิจ</h3>
                    <div className="flex flex-wrap gap-2">
                      {roles.map((role, i) => (
                        <span key={role} className="px-3 py-1 rounded-lg text-[10px] font-black uppercase text-white shadow-sm"
                          style={{ backgroundColor: colors[i] || '#94a3b8' }}>
                          {role}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => setShowModal(false)} className="p-3 bg-slate-50 rounded-2xl text-slate-400 hover:bg-slate-100">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm font-bold">
                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-[10px] text-slate-400 uppercase mb-2 font-black tracking-wider">สถานที่</p>
                      <div className="flex items-center gap-2 text-slate-700"><Building2 size={16} className="text-blue-500" />{selectedWork.department}</div>
                    </div>
                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-[10px] text-slate-400 uppercase mb-2 font-black tracking-wider">เวลานัดหมาย</p>
                      <div className="flex items-center gap-2 text-slate-700"><Clock size={16} className="text-blue-500" />{selectedWork.work_time} น.</div>
                    </div>
                  </div>

                  <div className="p-8 rounded-[2rem] bg-slate-900 text-white font-bold shadow-xl">
                    <p className="text-[10px] opacity-50 uppercase mb-3 font-black tracking-widest">รายละเอียดภารกิจ</p>
                    <p className="text-lg leading-relaxed">{selectedWork.detail}</p>
                  </div>
                </div>

                <div className="flex gap-4 mt-10">
                  {selectedWork.status === 'pending' && (
                    <button onClick={() => updateStatus(selectedWork.id, 'inprogress')}
                      className="flex-[2] py-4 rounded-2xl text-white font-black text-sm shadow-lg active:scale-95 transition-all"
                      style={{ backgroundColor: mainColor }}>
                      เริ่มดำเนินงาน
                    </button>
                  )}
                  {selectedWork.status === 'inprogress' && (
                    <button onClick={() => updateStatus(selectedWork.id, 'complete')}
                      className="flex-[2] bg-emerald-600 py-4 rounded-2xl text-white font-black text-sm shadow-lg hover:bg-emerald-700 active:scale-95 transition-all">
                      เสร็จสิ้นภารกิจ
                    </button>
                  )}
                  <button onClick={() => setShowModal(false)}
                    className="flex-1 py-4 bg-slate-100 rounded-2xl font-black text-sm text-slate-500 hover:bg-slate-200 active:scale-95 transition-all">
                    ย้อนกลับ
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}