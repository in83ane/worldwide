'use client';

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Navigation, Loader2, ExternalLink, X, Clock, MapPin, Building2, Search, ChevronDown, LocateFixed, Home, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { orderTasksWithTime } from './routeUtils';
import type { MapTask } from './MapComponent';

interface Employee {
  id: string;
  name: string;
  staff_id: string | null;
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
  orderedIds: string[];
  startPoint: [number, number] | null;
  gpsPos: [number, number] | null;
  gpsTrigger: number;
  showReturnRoute: boolean;
  onRouteReady: (ready: boolean) => void;
}

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

const getAvatarUrl = (name: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'Staff')}&background=random&color=fff&size=200&font-size=0.35`;

interface LongdoResult { lat: number; lon: number; name: string; address: string; }

const LONGDO_KEY = '7ab7d7d3dbf947cebbdae10203740d2a';

const searchPlaces = async (query: string): Promise<LongdoResult[]> => {
  if (!query.trim() || query.length < 2) return [];
  try {
    const res = await fetch(`https://search.longdo.com/mapsearch/json/search?keyword=${encodeURIComponent(query)}&limit=6&key=${LONGDO_KEY}`);
    const data = await res.json();
    return (data.data ?? []).map((item: { lat: number; lon: number; name: string; address?: string }) => ({
      lat: item.lat, lon: item.lon, name: item.name, address: item.address ?? '',
    }));
  } catch { return []; }
};

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export default function MapPage() {
  const supabase = useMemo(() => createClient(), []);

  const [isAdmin, setIsAdmin] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [empDropdownOpen, setEmpDropdownOpen] = useState(false);
  const [empSearch, setEmpSearch] = useState('');

  const [works, setWorks] = useState<WorkScheduleRow[]>([]);
  const [deptColorMap, setDeptColorMap] = useState<Record<string, string>>({});

  const [mapTasks, setMapTasks] = useState<MapTask[]>([]);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [isRouteReady, setIsRouteReady] = useState(false);
  const [loading, setLoading] = useState(true);

  const [startInput, setStartInput] = useState('');
  const [startPoint, setStartPoint] = useState<[number, number] | null>(null);
  const [suggestions, setSuggestions] = useState<LongdoResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [gpsPos, setGpsPos] = useState<[number, number] | null>(null);
  const [gpsTrigger, setGpsTrigger] = useState(0);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startInputRef = useRef<HTMLDivElement>(null);

  const [showModal, setShowModal] = useState(false);
  const [selectedWork, setSelectedWork] = useState<WorkScheduleRow | null>(null);

  const [showReturnRoute, setShowReturnRoute] = useState(false);
  const [allDoneToday, setAllDoneToday] = useState(false);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const [{ data: profile }, { data: employee }, { data: empsData }, { data: deptsData }] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', authUser.id).single(),
        supabase.from('employees').select('id').eq('user_id', authUser.id).single(),
        supabase.from('employees').select('id, name, staff_id, image_url, departments:department_id(name, color_code)'),
        supabase.from('departments').select('name, color_code'),
      ]);

      const admin = profile?.role === 'admin';
      const empId = employee?.id ?? null;
      setIsAdmin(admin);
      setEmployees((empsData ?? []) as unknown as Employee[]);

      const colorMap = ((deptsData ?? []) as Department[]).reduce((acc, d) => {
        acc[d.name] = d.color_code; return acc;
      }, {} as Record<string, string>);
      setDeptColorMap(colorMap);

      if (!admin && empId) setSelectedEmployeeId(empId);
      setLoading(false);
    };
    init();
  }, [supabase]);

  useEffect(() => {
    const fetchWorks = async () => {
      const targetId = selectedEmployeeId;
      if (!targetId) {
        setWorks([]); setMapTasks([]); setOrderedIds([]); setIsRouteReady(false);
        setShowReturnRoute(false); setAllDoneToday(false);
        return;
      }

      const today = todayStr();

      const { data } = await supabase
        .from('work_schedule')
        .select('*')
        .contains('employee_ids', [targetId])
        .lte('work_date', today);

      const rows = (data ?? []) as WorkScheduleRow[];

      const activeWorks = rows.filter(w => w.status !== 'complete');
      setWorks(activeWorks);

      setDeptColorMap(prev => {
        const tasks: MapTask[] = rows
          .filter(w => w.lat && w.lng)
          .map(w => {
            const roles = w.worker_role?.split(', ') ?? [];
            const color = prev[roles[0]] || '#64748b';
            return {
              id: w.id, name: w.detail, location: w.department,
              lat: w.lat!, lng: w.lng!, status: w.status,
              work_time: w.work_time, color,
            };
          });

        setMapTasks(tasks);
        setIsRouteReady(false);
        setOrderedIds([]);

        const todayWorks = rows.filter(w => w.work_date === today);
        const todayAllDone = todayWorks.length > 0 && todayWorks.every(w => w.status === 'complete');
        setAllDoneToday(todayAllDone);
        if (todayAllDone) setShowReturnRoute(true);

        return prev;
      });
    };
    fetchWorks();
  }, [selectedEmployeeId, supabase]);

  useEffect(() => {
    if (!startPoint || mapTasks.length === 0) {
      setOrderedIds([]);
      setIsRouteReady(false);
      return;
    }
    const ordered = orderTasksWithTime(startPoint, mapTasks);
    setOrderedIds(ordered.map(t => t.id));
    setIsRouteReady(false);
  }, [mapTasks, startPoint]);

  const handleRouteReady = useCallback((ready: boolean) => {
    setIsRouteReady(ready);
  }, []);

  useEffect(() => {
    setIsRouteReady(false);
    setOrderedIds([]);
  }, [startPoint]);

  const updateStatus = async (id: string, status: 'pending' | 'inprogress' | 'complete') => {
    const updates: Partial<WorkScheduleRow> & { completed_at?: string } = { status };
    if (status === 'complete') updates.completed_at = new Date().toISOString();

    await supabase.from('work_schedule').update(updates).eq('id', id);

    setWorks(prev =>
      status === 'complete'
        ? prev.filter(w => w.id !== id)
        : prev.map(w => w.id === id ? { ...w, status } : w)
    );

    setMapTasks(prev => {
      const updated = prev.map(t => t.id === id ? { ...t, status } : t);

      const today = todayStr();
      const todayWorks = works
        .map(w => w.id === id ? { ...w, status } : w)
        .filter(w => w.work_date === today);
      const allDone = todayWorks.length > 0 && todayWorks.every(w => w.status === 'complete' || (w.id === id && status === 'complete'));

      if (allDone) {
        setAllDoneToday(true);
        setShowReturnRoute(true);
      }

      return updated;
    });

    setShowModal(false);
  };

  const handleConfirmReturn = () => {
    setShowReturnRoute(false);
    setAllDoneToday(false);
    setMapTasks([]);
    setOrderedIds([]);
    setIsRouteReady(false);
  };

  const handleStartInputChange = (value: string) => {
    setStartInput(value);
    setStartPoint(null);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (!value.trim() || value.length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    setSearching(true);
    searchDebounce.current = setTimeout(async () => {
      const results = await searchPlaces(value);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setSearching(false);
    }, 400);
  };

  const handleSelectSuggestion = (result: LongdoResult) => {
    setStartPoint([result.lat, result.lon]);
    setStartInput(result.name);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleUseGPS = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => { setGpsPos([pos.coords.latitude, pos.coords.longitude]); setGpsTrigger(t => t + 1); },
      err => console.warn(err)
    );
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (startInputRef.current && !startInputRef.current.contains(e.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId);
  const filteredEmployees = employees.filter(e => e.name.toLowerCase().includes(empSearch.toLowerCase()));

  const taskMap = useMemo(() => new Map(mapTasks.map(t => [t.id, t])), [mapTasks]);
  const orderedTasks = useMemo(() => orderedIds.map(id => taskMap.get(id)).filter(Boolean) as MapTask[], [orderedIds, taskMap]);

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-slate-300" size={40} /></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        <header className="flex flex-col gap-4 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-slate-900 rounded-2xl text-white shadow-xl"><Navigation size={24} /></div>
              <div>
                <h1 className="text-xl font-black text-slate-900">ระบบจัดเส้นทางงาน</h1>
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">Route Optimization</p>
              </div>
            </div>

            {isAdmin && (
              <div className="relative w-72">
                <button onClick={() => setEmpDropdownOpen(!empDropdownOpen)}
                  className="w-full h-[52px] px-4 bg-slate-50 border-2 rounded-2xl font-bold text-left flex justify-between items-center hover:border-slate-400 transition-all">
                  <div className="flex items-center gap-3">
                    {selectedEmployee ? (
                      <>
                        <img src={selectedEmployee.image_url || getAvatarUrl(selectedEmployee.name)} className="w-8 h-8 rounded-xl object-cover" alt={selectedEmployee.name} />
                        <div className="text-left">
                          <p className="text-slate-800 font-bold text-sm leading-tight">{selectedEmployee.name}</p>
                          {selectedEmployee.staff_id && <p className="text-[10px] text-slate-400 font-black">#{selectedEmployee.staff_id}</p>}
                        </div>
                      </>
                    ) : <span className="text-slate-400">เลือกพนักงาน...</span>}
                  </div>
                  <ChevronDown size={18} className={`text-slate-400 transition-transform ${empDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {empDropdownOpen && (
                  <div className="absolute z-50 w-full bg-white shadow-2xl rounded-2xl mt-2 border border-slate-100 overflow-hidden">
                    <div className="p-2 border-b border-slate-50">
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                        <input autoFocus placeholder="ค้นหาชื่อ..." value={empSearch} onChange={e => setEmpSearch(e.target.value)}
                          className="w-full pl-8 pr-3 py-2 bg-slate-50 rounded-xl text-sm font-bold outline-none" />
                      </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                      {filteredEmployees.map(emp => (
                        <button key={emp.id} onClick={() => { setSelectedEmployeeId(emp.id); setEmpDropdownOpen(false); setEmpSearch(''); }}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${selectedEmployeeId === emp.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`}>
                          <img src={emp.image_url || getAvatarUrl(emp.name)} className="w-9 h-9 rounded-xl object-cover flex-shrink-0" alt={emp.name} />
                          <div className="text-left">
                            <p className="font-bold text-sm leading-tight">{emp.name}</p>
                            <p className="text-[10px] opacity-60 uppercase font-black">
                              {emp.departments?.name}{emp.staff_id && <span className="ml-1">· #{emp.staff_id}</span>}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">จุดเริ่มต้น</p>
            <div className="flex gap-2">
              <div className="relative flex-grow" ref={startInputRef}>
                <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
                {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin z-10" />}
                <input value={startInput} onChange={e => handleStartInputChange(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  placeholder="พิมพ์ชื่อสถานที่..."
                  className={`w-full pl-9 pr-4 py-3 bg-slate-50 border-2 rounded-2xl font-bold text-sm outline-none transition-all ${startPoint ? 'border-emerald-300 bg-emerald-50' : 'border-transparent focus:border-slate-300'}`} />
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute z-50 w-full bg-white shadow-2xl rounded-2xl mt-1 border border-slate-100 overflow-hidden">
                    {suggestions.map((s, idx) => (
                      <button key={idx} type="button" onMouseDown={() => handleSelectSuggestion(s)}
                        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left border-b border-slate-50 last:border-0">
                        <MapPin size={14} className="text-slate-400 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-slate-800 truncate">{s.name}</p>
                          <p className="text-xs text-slate-400 font-medium truncate">{s.address}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" onClick={handleUseGPS}
                className="px-4 py-3 bg-blue-50 text-blue-600 border-2 border-blue-100 rounded-2xl font-black text-sm flex items-center gap-2 shrink-0 hover:bg-blue-100 transition-all">
                <LocateFixed size={16} /> ตำแหน่งปัจจุบัน
              </button>
            </div>
            {startPoint && <p className="text-xs text-emerald-600 font-bold mt-1 ml-2">พบตำแหน่งแล้ว — พร้อมคำนวณเส้นทาง</p>}
          </div>
        </header>

        {allDoneToday && (
          <div className="bg-emerald-50 border-2 border-emerald-200 rounded-[2rem] p-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-500 rounded-2xl text-white"><CheckCircle2 size={24} /></div>
              <div>
                <p className="font-black text-emerald-800 text-lg">งานวันนี้ครบแล้ว!</p>
                <p className="text-sm text-emerald-600 font-bold">เส้นสีส้มแสดงเส้นทางกลับ กดยืนยันเพื่อจบงานวันนี้</p>
              </div>
            </div>
            <button onClick={handleConfirmReturn}
              className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-sm shadow-lg active:scale-95 transition-all shrink-0">
              <Home size={18} /> จบงานวันนี้แล้ว
            </button>
          </div>
        )}

        {!selectedEmployeeId ? (
          <div className="bg-white rounded-[2rem] p-24 text-center border border-slate-100">
            <Navigation size={48} className="text-slate-200 mx-auto mb-4" />
            <p className="text-slate-400 font-bold">เลือกพนักงานเพื่อดูเส้นทางงาน</p>
          </div>
        ) : (
          <>
            <div className="bg-white p-2 rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden" style={{ height: 500 }}>
              {mapTasks.length > 0 ? (
                <MapComponent
                  tasks={mapTasks}
                  orderedIds={orderedIds}
                  startPoint={startPoint}
                  gpsPos={gpsPos}
                  gpsTrigger={gpsTrigger}
                  showReturnRoute={showReturnRoute}
                  onRouteReady={handleRouteReady}
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-300">
                  <MapPin size={48} className="mb-3" />
                  <p className="font-bold">ไม่มีงานที่มีพิกัด</p>
                  <p className="text-xs mt-1 text-slate-400">งานจะแสดงเมื่อมีการบันทึก lat/lng จากชื่อสถานที่</p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100">
              <h2 className="font-black text-slate-800 mb-4 flex items-center gap-2">
                <Navigation size={18} className="text-blue-600" /> ลำดับเส้นทางที่เหมาะสม
              </h2>
              {!startPoint ? (
                <p className="text-sm text-slate-400 font-bold text-center py-6">กรอกจุดเริ่มต้นเพื่อคำนวณเส้นทาง</p>
              ) : !isRouteReady ? (
                <div className="flex items-center justify-center gap-2 py-6 text-slate-400">
                  <Loader2 size={16} className="animate-spin" />
                  <p className="text-sm font-bold">กำลังคำนวณเส้นทาง...</p>
                </div>
              ) : (
                <div className="space-y-3 relative">
                  <div className="absolute left-[15px] top-4 bottom-4 w-[2px] bg-slate-100" />
                  {orderedTasks.map((task, idx) => {
                    const isComplete = task.status === 'complete';
                    const isInProgress = task.status === 'inprogress';
                    return (
                      <div key={task.id} className={`flex gap-4 items-center transition-opacity ${isComplete ? 'opacity-40' : ''}`}>
                        <div className={`z-10 w-8 h-8 rounded-full text-white flex items-center justify-center text-xs font-black shadow-lg ring-4 ring-white shrink-0 ${isComplete ? 'bg-emerald-500' : isInProgress ? 'bg-amber-500' : 'bg-slate-900'}`}>
                          {isComplete ? '✓' : isInProgress ? '▶' : idx + 1}
                        </div>
                        <div className="flex-grow p-3 bg-slate-50 rounded-2xl flex justify-between items-center">
                          <div>
                            <p className="font-black text-slate-800 text-sm">{task.location}</p>
                            <p className="text-xs text-slate-400 font-bold mt-0.5">{task.name}</p>
                          </div>
                          <button type="button"
                            onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${task.lat},${task.lng}`)}
                            className="flex items-center gap-1.5 text-[10px] text-blue-600 font-black bg-blue-50 px-3 py-1.5 rounded-xl shrink-0 ml-3">
                            <ExternalLink size={11} /> Google Maps
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {allDoneToday && (
                    <div className="flex gap-4 items-center">
                      <div className="z-10 w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs font-black shadow-lg ring-4 ring-white shrink-0">
                      </div>
                      <div className="flex-grow p-3 bg-orange-50 rounded-2xl border border-orange-100">
                        <p className="font-black text-orange-700 text-sm">เส้นทางกลับ</p>
                        <p className="text-xs text-orange-400 font-bold mt-0.5">{startInput}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h2 className="font-black text-slate-800 px-1">งานที่รอดำเนินการ ({works.length})</h2>
              {works.length === 0 ? (
                <div className="bg-white rounded-[2rem] p-16 text-center border border-slate-100 text-slate-300">
                  <p className="font-bold">{allDoneToday ? 'งานวันนี้เสร็จสิ้นทั้งหมด' : 'ไม่มีงานค้าง'}</p>
                </div>
              ) : (
                works.map(work => {
                  const roles = work.worker_role?.split(', ') ?? [];
                  const colors = roles.map(r => deptColorMap[r] || '#94a3b8');
                  const barStyle = colors.length > 1 ? { background: `linear-gradient(to bottom, ${colors.join(', ')})` } : { backgroundColor: colors[0] };
                  const isOverdue = new Date(`${work.work_date}T${work.work_time}`) < new Date() && work.status === 'pending';
                  const isInProgress = work.status === 'inprogress';
                  return (
                    <div key={work.id} onClick={() => { setSelectedWork(work); setShowModal(true); }}
                      className="relative bg-white rounded-[2rem] border-2 border-slate-50 overflow-hidden flex items-stretch cursor-pointer hover:shadow-md transition-all">
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

      {showModal && selectedWork && (() => {
        const roles = selectedWork.worker_role?.split(', ') ?? [];
        const colors = roles.map(r => deptColorMap[r] || '#94a3b8');
        const barStyle = colors.length > 1 ? { background: `linear-gradient(to right, ${colors.join(', ')})` } : { backgroundColor: colors[0] };
        const mainColor = colors[0] || '#94a3b8';
        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
            <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl relative overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="h-3 w-full" style={barStyle} />
              <div className="p-8 md:p-10">
                <div className="flex justify-between items-start mb-8">
                  <div className="flex flex-col gap-2">
                    <h3 className="text-2xl font-black text-slate-800 leading-tight">รายละเอียดภารกิจ</h3>
                    <div className="flex flex-wrap gap-2">
                      {roles.map((role, i) => (
                        <span key={role} className="px-3 py-1 rounded-lg text-[10px] font-black uppercase text-white shadow-sm" style={{ backgroundColor: colors[i] || '#94a3b8' }}>{role}</span>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => setShowModal(false)} className="p-3 bg-slate-50 rounded-2xl text-slate-400 hover:bg-slate-100"><X size={20} /></button>
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
                      style={{ backgroundColor: mainColor }}>เริ่มดำเนินงาน</button>
                  )}
                  {selectedWork.status === 'inprogress' && (
                    <button onClick={() => updateStatus(selectedWork.id, 'complete')}
                      className="flex-[2] bg-emerald-600 py-4 rounded-2xl text-white font-black text-sm shadow-lg hover:bg-emerald-700 active:scale-95 transition-all">เสร็จสิ้นภารกิจ</button>
                  )}
                  <button onClick={() => setShowModal(false)}
                    className="flex-1 py-4 bg-slate-100 rounded-2xl font-black text-sm text-slate-500 hover:bg-slate-200 active:scale-95 transition-all">ย้อนกลับ</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}