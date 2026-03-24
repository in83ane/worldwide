"use client";
import React, { useEffect, useMemo, useState } from "react";
import {
    ChevronLeft, ChevronRight, Clock, CalendarDays,
    X, Search, Building2, Inbox, CheckCircle2,
    PlayCircle, Timer, CalendarRange, MapPin, Camera
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import PhotoUploadModal from "@/components/PhotoUploadModal";
import { uploadWorkPhoto } from "@/lib/uploadWorkPhoto";

interface RawWorkSchedule {
    id: string;
    work_date: string;
    end_date: string | null;
    work_time: string;
    worker: string;
    worker_role: string;
    detail: string;
    department: string;
    status: 'pending' | 'inprogress' | 'complete';
    completed_at: string | null;
    started_at?: string | null;
    employee_ids: string[] | null;
    start_photo_url?: string | null;
    complete_photo_url?: string | null;
}

interface WorkSchedule extends RawWorkSchedule {
    startTime: Date;
    startDate: Date;
    endDate: Date | null;
    fullDateString: string;
    deptColor: string;
    isMultiDay: boolean;
    durationDays: number;
}

interface Department { name: string; color_code: string; }

const customStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap');
  .thai-font-container { font-family: 'Prompt', sans-serif !important; }

  @keyframes pulse-red-dynamic {
    0%, 100% { background-color: var(--dept-color); }
    50% { background-color: #ef4444; }
  }
  @keyframes pulse-yellow-dynamic {
    0%, 100% { background-color: var(--dept-color); }
    50% { background-color: #f59e0b; }
  }

  .animate-overdue { animation: pulse-red-dynamic 2.5s infinite ease-in-out; color: white !important; }
  .animate-inprogress { animation: pulse-yellow-dynamic 3s infinite ease-in-out; color: white !important; }
  .calendar-event-card { transition: all 0.2s ease; cursor: pointer; border: none !important; }
  .calendar-event-card:hover { transform: translateY(-2px); filter: brightness(1.05); z-index: 40; }
  .main-timeline-scroll::-webkit-scrollbar { height: 6px; width: 4px; }
  .main-timeline-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
`;

function formatDisplayDate(dateStr: string | null): string {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${parseInt(y) + 543}`;
}

function formatTimestamp(isoString: string | null | undefined): string {
    if (!isoString) return "—";
    const d = new Date(isoString);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear() + 543).slice(-2);
    const HH = String(d.getHours()).padStart(2, '0');
    const MM = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yy} ${HH}:${MM} น.`;
}

function calcDuration(start: string | null | undefined, end: string | null | undefined): string | null {
    if (!start || !end) return null;
    const diffMs = new Date(end).getTime() - new Date(start).getTime();
    if (diffMs <= 0) return null;
    const totalMins = Math.floor(diffMs / 60000);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (h > 0 && m > 0) return `${h} ชม. ${m} น.`;
    if (h > 0) return `${h} ชม.`;
    return `${m} น.`;
}

export default function WorkCalendar() {
    const supabase = useMemo(() => createClient(), []);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
    const [workSchedules, setWorkSchedules] = useState<WorkSchedule[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [showWorkModal, setShowWorkModal] = useState(false);
    const [selectedWork, setSelectedWork] = useState<WorkSchedule | null>(null);
    const [selectedJobGroup, setSelectedJobGroup] = useState<WorkSchedule[]>([]);
    const [currentView, setCurrentView] = useState<'calendar' | 'daily'>('calendar');
    const [now, setNow] = useState(new Date());
    const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [deptColorMap, setDeptColorMap] = useState<Record<string, string>>({});

    // Photo upload state
    const [photoModal, setPhotoModal] = useState<{ mode: 'start' | 'complete'; ids: string[]; detail: string } | null>(null);

    useEffect(() => {
        const handlePopState = () => {
            const params = new URLSearchParams(window.location.search);
            const view = params.get('view') as 'calendar' | 'daily';
            setCurrentView(view || 'calendar');
        };
        const params = new URLSearchParams(window.location.search);
        const initialView = params.get('view') as 'calendar' | 'daily';
        if (initialView) setCurrentView(initialView);
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    const switchView = (view: 'calendar' | 'daily') => {
        setCurrentView(view);
        const url = new URL(window.location.href);
        url.searchParams.set('view', view);
        window.history.pushState({}, '', url.toString());
    };

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 10000);
        return () => clearInterval(timer);
    }, []);

    const fetchWorkSchedules = async (empId: string | null, admin: boolean) => {
        const { data: deptsData } = await supabase.from("departments").select("name, color_code");
        const depts = deptsData as Department[] | null;
        const colorMap: Record<string, string> = (depts || []).reduce((acc, curr) => {
            acc[curr.name] = curr.color_code; return acc;
        }, {} as Record<string, string>);
        setDeptColorMap(colorMap);

        let query = supabase.from("work_schedule").select("*");
        if (!admin && empId) query = query.contains('employee_ids', [empId]);
        const { data: worksData, error } = await query;
        if (error) return;

        const works = worksData as RawWorkSchedule[] | null;
        const mappedData = (works || []).map((w): WorkSchedule => {
            const datePart = new Date(w.work_date + 'T00:00:00');
            const timeParts = (w.work_time || "00:00").split(':');
            const startTime = new Date(datePart.getFullYear(), datePart.getMonth(), datePart.getDate(), parseInt(timeParts[0]), parseInt(timeParts[1]));
            const deptHex = colorMap[w.worker_role] || colorMap[w.department] || "#94a3b8";
            const endDate = w.end_date ? new Date(w.end_date + 'T00:00:00') : null;
            const effectiveEnd = endDate || datePart;
            const durationDays = Math.round((effectiveEnd.getTime() - datePart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            return {
                ...w,
                worker: w.worker || "",
                department: w.department || "",
                detail: w.detail || "",
                startTime,
                startDate: datePart,
                endDate,
                isMultiDay: durationDays > 1,
                durationDays,
                deptColor: deptHex,
                completed_at: w.completed_at,
                fullDateString: datePart.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            };
        });
        setWorkSchedules(mappedData);
    };

    useEffect(() => {
        const init = async () => {
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (!authUser) return;
            const { data: profile } = await supabase.from("profiles").select("role").eq("id", authUser.id).single();
            const { data: employee } = await supabase.from("employees").select("id").eq("user_id", authUser.id).single();
            const admin = profile?.role === 'admin';
            const empId = employee?.id ?? null;
            setIsAdmin(admin);
            setCurrentEmployeeId(empId);
            await fetchWorkSchedules(empId, admin);
        };
        init();
    }, [supabase]);

    const handlePrev = () => {
        if (currentView === 'daily' && selectedDate) {
            const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d);
        } else setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };
    const handleNext = () => {
        if (currentView === 'daily' && selectedDate) {
            const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d);
        } else setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    const filteredHistory = useMemo(() => {
        return workSchedules
            .filter((w) => {
                if (w.status !== 'complete') return false;
                const searchLower = searchTerm.trim().toLowerCase();
                if (!searchLower) return w.startDate.getMonth() === currentDate.getMonth() && w.startDate.getFullYear() === currentDate.getFullYear();
                const matchesText = w.worker.toLowerCase().includes(searchLower) || w.detail.toLowerCase().includes(searchLower) || w.department.toLowerCase().includes(searchLower);
                const day = String(w.startDate.getDate()).padStart(2, '0');
                const month = String(w.startDate.getMonth() + 1).padStart(2, '0');
                const dateStr = `${day}/${month}/${w.startDate.getFullYear() + 543}`;
                return matchesText || dateStr.includes(searchLower);
            })
            .sort((a, b) => {
                const tA = a.completed_at ? new Date(a.completed_at).getTime() : a.startTime.getTime();
                const tB = b.completed_at ? new Date(b.completed_at).getTime() : b.startTime.getTime();
                return tB - tA;
            });
    }, [workSchedules, searchTerm, currentDate]);

    const cleanWorkerName = (name: string) => name.replace(/\s*\(.*?\)\s*/g, "").trim();

    // ── Photo-aware status update ──────────────────────────────────────────────
    const handleStatusAction = (ids: string[], status: 'inprogress' | 'complete', detail: string) => {
        setShowWorkModal(false);
        setPhotoModal({ mode: status === 'inprogress' ? 'start' : 'complete', ids, detail });
    };

    const handlePhotoConfirm = async (file: File) => {
        if (!photoModal) return;
        const { mode, ids } = photoModal;
        const firstId = ids[0];

        const photoUrl = await uploadWorkPhoto(supabase, file, firstId, mode);

        const status = mode === 'start' ? 'inprogress' : 'complete';
        const updateData: Record<string, string> = { status };
        if (mode === 'start') {
            updateData.started_at = new Date().toISOString();
            updateData.start_photo_url = photoUrl;
        } else {
            updateData.completed_at = new Date().toISOString();
            updateData.complete_photo_url = photoUrl;
        }

        await supabase.from("work_schedule").update(updateData).in("id", ids);
        await fetchWorkSchedules(currentEmployeeId, isAdmin);
        setPhotoModal(null);
    };

    const handleEventClick = (e: React.MouseEvent, group: WorkSchedule[]) => {
        e.stopPropagation();
        setSelectedWork(group[0]);
        setSelectedJobGroup(group);
        setShowWorkModal(true);
    };

    const renderCalendarDays = () => {
        const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
        const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
        const offset = firstDay === 0 ? 6 : firstDay - 1;
        const days = [];
        for (let i = 0; i < offset; i++) days.push(<div key={`empty-${i}`} className="h-16 md:h-36 bg-slate-50/20 border-r border-b border-slate-100" />);

        for (let date = 1; date <= daysInMonth; date++) {
            const dateObj = new Date(currentDate.getFullYear(), currentDate.getMonth(), date);
            const isToday = now.toDateString() === dateObj.toDateString();
            const dayWorks = workSchedules.filter(w => w.startDate.toDateString() === dateObj.toDateString() && w.status !== 'complete');
            const hasOverdue = dayWorks.some(w => w.status === 'pending' && w.startTime < now);
            const hasInProgress = dayWorks.some(w => w.status === 'inprogress');

            const uniqueJobs: Record<string, WorkSchedule[]> = {};
            dayWorks.forEach(work => {
                const jobKey = `${work.work_time}-${work.department}-${work.detail}`;
                if (!uniqueJobs[jobKey]) uniqueJobs[jobKey] = [];
                uniqueJobs[jobKey].push(work);
            });

            days.push(
                <div key={date}
                    className="h-16 md:h-36 border-r border-b border-slate-100 bg-white active:bg-slate-50 md:hover:bg-slate-50 transition-all cursor-pointer overflow-hidden"
                    onClick={() => { setSelectedDate(dateObj); switchView('daily'); }}>

                    <div className="md:hidden h-full flex flex-col items-center justify-center gap-1 p-1">
                        <div className={`w-7 h-7 flex items-center justify-center rounded-xl text-[11px] font-bold ${isToday ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'text-slate-500'}`}>{date}</div>
                        {dayWorks.length > 0 && (
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-lg leading-none ${hasOverdue ? 'bg-red-100 text-red-600' : hasInProgress ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-50 text-blue-600'}`}>{dayWorks.length}</span>
                        )}
                    </div>

                    <div className="hidden md:block p-2">
                        <div className="flex justify-between items-start mb-1">
                            <div className={`w-7 h-7 flex items-center justify-center rounded-xl text-[11px] font-bold ${isToday ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-slate-400'}`}>{date}</div>
                            {dayWorks.length > 0 && (
                                <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-lg border border-blue-100">{dayWorks.length} {dayWorks.length === 1 ? 'job' : 'jobs'}</span>
                            )}
                        </div>
                        <div className="space-y-1 overflow-y-auto max-h-[90px] pr-1 main-timeline-scroll">
                            {Object.values(uniqueJobs).sort((a, b) => a[0].work_time.localeCompare(b[0].work_time)).map((group, idx) => {
                                const job = group[0];
                                const isOverdue = job.status === 'pending' && job.startTime < now;
                                const isInProgress = job.status === 'inprogress';
                                const animClass = isOverdue ? 'animate-overdue' : isInProgress ? 'animate-inprogress' : '';
                                return (
                                    <div key={idx} onClick={(e) => handleEventClick(e, group)}
                                        style={{ '--dept-color': job.deptColor, backgroundColor: animClass ? undefined : job.deptColor, color: 'white' } as React.CSSProperties}
                                        className={`w-full text-left p-1 rounded-md text-[10px] mb-1 calendar-event-card font-medium ${animClass}`}>
                                        <div className="flex justify-between opacity-90 border-b border-white/20 mb-0.5">
                                            <span>{job.work_time.substring(0, 5)}</span>
                                            {job.isMultiDay && <span className="bg-black/20 px-1 rounded text-[8px] font-black">{job.durationDays}วัน</span>}
                                        </div>
                                        <span className="truncate block leading-tight">{group.map(w => cleanWorkerName(w.worker)).join(', ')}</span>
                                        {job.isMultiDay && job.endDate && (
                                            <span className="block text-[8px] opacity-75 mt-0.5">
                                                ถึง {job.endDate.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit' })}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            );
        }
        return days;
    };

    const renderDailyTimeline = () => {
        if (!selectedDate) return null;
        const hours = Array.from({ length: 13 }, (_, i) => i + 8);
        const dayWorks = workSchedules.filter(w => w.startDate.toDateString() === selectedDate.toDateString() && w.status !== 'complete');
        const dayHistory = workSchedules.filter(w => w.startDate.toDateString() === selectedDate.toDateString() && w.status === 'complete');
        const workers = Array.from(new Set(dayWorks.map(w => w.worker)));
        const hourWidth = 280;

        const emptyState = (
            <div className="bg-white border border-slate-100 rounded-[2rem] p-12 text-center">
                <Inbox size={40} className="text-slate-200 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-300">ไม่มีรายการงานค้าง</h3>
            </div>
        );

        const mobileView = (
            <div className="xl:hidden space-y-3">
                {dayWorks.length === 0 ? emptyState : dayWorks.sort((a, b) => a.work_time.localeCompare(b.work_time)).map((work) => {
                    const isOverdue = work.status === 'pending' && work.startTime < now;
                    const isInProgress = work.status === 'inprogress';
                    const animClass = isOverdue ? 'animate-overdue' : isInProgress ? 'animate-inprogress' : '';
                    return (
                        <div key={work.id}
                            onClick={() => { setSelectedWork(work); setSelectedJobGroup([work]); setShowWorkModal(true); }}
                            style={{ '--dept-color': work.deptColor, backgroundColor: animClass ? undefined : work.deptColor } as React.CSSProperties}
                            className={`w-full rounded-[1.5rem] p-4 text-white shadow-md active:scale-95 transition-all cursor-pointer ${animClass}`}>
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex flex-wrap items-center gap-1.5 bg-black/15 px-2.5 py-1 rounded-xl text-xs font-bold">
                                    <Clock size={12} /> {work.work_time.substring(0, 5)} น.
                                    {work.isMultiDay && work.endDate && (
                                        <span className="bg-black/20 px-1.5 py-0.5 rounded-lg text-[9px] font-black">
                                            ถึง {work.endDate.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit' })} · {work.durationDays}วัน
                                        </span>
                                    )}
                                </div>
                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg ${isInProgress ? 'bg-yellow-400/30' : isOverdue ? 'bg-red-400/30' : 'bg-black/15'}`}>
                                    {isInProgress ? 'กำลังทำ' : isOverdue ? 'เกินกำหนด' : 'รอดำเนิน'}
                                </span>
                            </div>
                            <p className="font-black text-base leading-tight mb-1">{cleanWorkerName(work.worker)}</p>
                            <div className="flex items-center gap-1.5 text-xs font-semibold opacity-80 mb-2"><Building2 size={12} /> {work.department}</div>
                            <p className="text-sm opacity-90 leading-snug line-clamp-2">{work.detail}</p>
                        </div>
                    );
                })}

                {dayHistory.length > 0 && (
                    <div className="mt-2">
                        <div className="flex items-center gap-2 px-1 mb-3">
                            <div className="w-1.5 h-4 bg-emerald-500 rounded-full" />
                            <span className="font-bold text-sm text-slate-700">งานที่เสร็จแล้ววันนี้ ({dayHistory.length})</span>
                        </div>
                        <div className="space-y-2">
                            {dayHistory.map((work, idx) => (
                                <div key={idx}
                                    onClick={() => { setSelectedWork(work); setSelectedJobGroup([work]); setShowWorkModal(true); }}
                                    style={{ borderLeftColor: work.deptColor }}
                                    className="bg-white rounded-[1.5rem] border-l-4 p-4 shadow-sm cursor-pointer active:scale-95 transition-all">
                                    <div className="flex justify-between items-center mb-1">
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg">
                                            <CheckCircle2 size={10} /> เสร็จแล้ว
                                        </div>
                                        {calcDuration(work.started_at, work.completed_at) && (
                                            <span className="text-[9px] font-black text-violet-600 bg-violet-50 px-2 py-0.5 rounded-lg flex items-center gap-0.5">
                                                <Timer size={9} /> {calcDuration(work.started_at, work.completed_at)}
                                            </span>
                                        )}
                                    </div>
                                    <p className="font-bold text-slate-800 text-sm">{cleanWorkerName(work.worker)}</p>
                                    <div className="flex items-center gap-1.5 mt-0.5 text-[11px] font-bold text-slate-400"><Building2 size={11} /> {work.department}</div>
                                    <p className="text-[11px] text-slate-400 line-clamp-1 mt-1">{work.detail}</p>
                                    <div className="mt-2 pt-2 border-t border-slate-50 grid grid-cols-2 gap-1">
                                        <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400">
                                            <PlayCircle size={15} className="text-blue-500" /> {formatTimestamp(work.started_at)}
                                        </div>
                                        <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400">
                                            <CheckCircle2 size={15} className="text-emerald-400" /> {formatTimestamp(work.completed_at)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );

        const desktopView = (
            <div className="hidden xl:block">
                {workers.length === 0 ? emptyState : (
                    <div className="bg-white border border-slate-100 rounded-[2rem] shadow-sm overflow-hidden">
                        <div className="overflow-x-auto main-timeline-scroll">
                            <div style={{ width: `${(hours.length * hourWidth) + 260}px` }} className="relative">
                                <div className="flex bg-slate-50 border-b sticky top-0 z-30">
                                    <div className="w-[260px] p-5 font-bold text-slate-400 text-center border-r text-[11px] uppercase tracking-widest bg-slate-50">Technician Info</div>
                                    {hours.map(h => <div key={h} style={{ width: hourWidth }} className="p-5 text-center font-bold text-slate-500 border-r text-sm">{h}:00</div>)}
                                </div>
                                <div className="divide-y divide-slate-100">
                                    {workers.map(worker => {
                                        const works = dayWorks.filter(w => w.worker === worker);
                                        return (
                                            <div key={worker} className="flex min-h-[150px] relative">
                                                <div className="w-[260px] sticky left-0 z-20 bg-white border-r flex shadow-lg shadow-slate-900/5 overflow-hidden">
                                                    <div className="w-2 shrink-0 h-full" style={{ backgroundColor: works[0].deptColor }}></div>
                                                    <div className="flex flex-col justify-center px-6">
                                                        <span className="font-bold text-slate-800 text-lg leading-tight mb-1">{cleanWorkerName(worker)}</span>
                                                        <span className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: works[0].deptColor }}>{works[0].worker_role || "DEPARTMENT"}</span>
                                                    </div>
                                                </div>
                                                <div className="flex-grow relative bg-slate-50/10">
                                                    {hours.map(h => <div key={h} style={{ left: (h - 8) * hourWidth, width: 1 }} className="absolute top-0 bottom-0 bg-slate-200/40" />)}
                                                    {works.map((work) => {
                                                        const leftPos = ((work.startTime.getHours() - 8) * hourWidth) + (work.startTime.getMinutes() / 60 * hourWidth);
                                                        const isOverdue = work.status === 'pending' && work.startTime < now;
                                                        const isInProgress = work.status === 'inprogress';
                                                        const animClass = isOverdue ? 'animate-overdue' : isInProgress ? 'animate-inprogress' : '';
                                                        return (
                                                            <div key={work.id}
                                                                onClick={() => { setSelectedWork(work); setSelectedJobGroup([work]); setShowWorkModal(true); }}
                                                                style={{ left: leftPos + 20, width: 250, top: 25, position: 'absolute', '--dept-color': work.deptColor, backgroundColor: animClass ? undefined : work.deptColor, color: 'white' } as React.CSSProperties}
                                                                className={`p-4 rounded-2xl shadow-lg flex flex-col gap-1.5 min-h-[100px] z-10 calendar-event-card ${animClass}`}>
                                                                <div className="flex justify-between items-center mb-1">
                                                                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-black/15 text-[11px] font-bold">
                                                                        <Clock size={12} /> {work.work_time.substring(0, 5)}
                                                                    </div>
                                                                    <div className="flex items-center gap-1">
                                                                        {work.isMultiDay && <span className="text-[9px] font-black bg-black/20 px-1.5 py-0.5 rounded-lg">{work.durationDays}วัน</span>}
                                                                        <span className="text-[9px] font-bold uppercase opacity-80 tracking-tighter">{work.status}</span>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-1.5 font-bold text-[15px]"><Building2 size={14} /><span className="truncate">{work.department}</span></div>
                                                                {work.isMultiDay && work.endDate && (
                                                                    <div className="text-[10px] font-bold opacity-80">
                                                                        ถึง {work.endDate.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                                    </div>
                                                                )}
                                                                <p className="font-medium text-[14px] leading-snug line-clamp-2 opacity-95">{work.detail}</p>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
        return <>{mobileView}{desktopView}</>;
    };

    return (
        <div className="thai-font-container min-h-screen bg-[#f8fafc] p-4 md:p-6 text-slate-700">
            <style dangerouslySetInnerHTML={{ __html: customStyles }} />
            <div className="max-w-[1600px] mx-auto space-y-6">
                <header className="bg-white p-4 md:p-5 rounded-[2rem] shadow-sm border border-slate-100">
                    <div className="flex md:hidden items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-slate-950 rounded-2xl text-white shadow-lg shadow-slate-200"><CalendarDays size={20} /></div>
                            <div>
                                <h1 className="text-base font-bold text-slate-800 tracking-tight">ระบบปฏิทินตารางงาน</h1>
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Management system</p>
                            </div>
                        </div>
                        {currentView === 'daily' && (
                            <button onClick={() => switchView('calendar')} className="flex items-center gap-1.5 bg-slate-900 text-white px-3 py-2 rounded-xl font-bold text-xs shadow-md">
                                <ChevronLeft size={14} /> ปฏิทิน
                            </button>
                        )}
                    </div>
                    <div className="flex md:hidden items-center gap-2">
                        <div className="flex flex-1 items-center bg-slate-50 p-1.5 rounded-2xl border border-slate-100 gap-1">
                            <button onClick={handlePrev} className="p-2 rounded-xl text-slate-400 active:scale-95 transition-all"><ChevronLeft size={16} /></button>
                            <span className="flex-1 text-center font-bold text-xs text-slate-700">
                                {currentView === 'calendar' ? currentDate.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }) : selectedDate?.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </span>
                            <button onClick={handleNext} className="p-2 rounded-xl text-slate-400 active:scale-95 transition-all"><ChevronRight size={16} /></button>
                        </div>
                        <button onClick={() => { const d = new Date(); setCurrentDate(d); setSelectedDate(d); }} className="bg-white text-slate-950 px-3 py-2 rounded-xl font-bold text-xs shadow-sm border border-slate-100 whitespace-nowrap">วันนี้</button>
                    </div>

                    <div className="hidden md:flex justify-between items-center gap-4">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-slate-950 rounded-2xl text-white shadow-lg shadow-slate-200"><CalendarDays size={24} /></div>
                            <div>
                                <h1 className="text-xl font-bold text-slate-800 tracking-tight">ระบบปฏิทินตารางงาน</h1>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Management system</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center bg-slate-50 p-1.5 rounded-2xl border border-slate-100 gap-2">
                                <div className="flex items-center border-r border-slate-200 pr-2 gap-1">
                                    <button onClick={handlePrev} className="p-2 hover:bg-white rounded-xl text-slate-400 hover:text-slate-900"><ChevronLeft size={18} /></button>
                                    <span className="font-bold min-w-[150px] text-center text-sm text-slate-700 uppercase tracking-wide">
                                        {currentView === 'calendar' ? currentDate.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }) : selectedDate?.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
                                    </span>
                                    <button onClick={handleNext} className="p-2 hover:bg-white rounded-xl text-slate-400 hover:text-slate-900"><ChevronRight size={18} /></button>
                                </div>
                                <button onClick={() => { const d = new Date(); setCurrentDate(d); setSelectedDate(d); }} className="bg-white text-slate-950 px-4 py-2 rounded-xl font-bold text-xs shadow-sm border border-slate-100 hover:bg-slate-50">วันนี้</button>
                            </div>
                            {currentView === 'daily' && (
                                <button onClick={() => switchView('calendar')} className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold text-xs shadow-md uppercase tracking-wider">กลับไปหน้าปฏิทิน</button>
                            )}
                        </div>
                    </div>
                </header>

                {currentView === 'calendar' ? (
                    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                        <div className="xl:col-span-3 bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
                            <div className="grid grid-cols-7 bg-slate-50/50 border-b">
                                {['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'].map(d => (
                                    <div key={d} className="py-4 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">{d}</div>
                                ))}
                            </div>
                            <div className="grid grid-cols-7 border-l border-t border-slate-50">{renderCalendarDays()}</div>
                        </div>

                        <aside className="hidden xl:flex bg-white p-6 rounded-[2.5rem] border border-slate-100 flex-col h-[700px] shadow-sm">
                            <div className="mb-6 space-y-4">
                                <h3 className="flex items-center gap-2 font-bold text-sm text-slate-800"><div className="w-1.5 h-4 bg-emerald-500 rounded-full"></div> ประวัติงานที่สำเร็จ</h3>
                                <div className="relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                                    <input type="text" placeholder="ค้นหาชื่อ/งาน/วันที่/หน่วยงาน..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] outline-none focus:ring-2 ring-blue-100 transition-all" />
                                </div>
                            </div>
                            <div className="flex-grow overflow-y-auto space-y-4 pr-1 main-timeline-scroll">
                                {filteredHistory.length > 0 ? filteredHistory.map((work, idx) => (
                                    <div key={idx} onClick={() => { setSelectedWork(work); setSelectedJobGroup([work]); setShowWorkModal(true); }}
                                        style={{ borderLeftColor: work.deptColor }}
                                        className="group p-4 rounded-2xl border-l-4 bg-white shadow-sm hover:shadow-md cursor-pointer border-slate-50 transition-all">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg">
                                                <CheckCircle2 size={10} /> DONE
                                            </div>
                                            {calcDuration(work.started_at, work.completed_at) ? (
                                                <span className="text-[9px] font-black text-violet-600 bg-violet-50 px-2 py-0.5 rounded-lg flex items-center gap-0.5">
                                                    <Timer size={9} /> {calcDuration(work.started_at, work.completed_at)}
                                                </span>
                                            ) : null}
                                        </div>
                                        <p className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{cleanWorkerName(work.worker)}</p>
                                        <div className="flex items-center gap-1.5 mt-1 text-[11px] font-bold text-slate-500"><Building2 size={12} className="text-slate-400" /><span>{work.department}</span></div>
                                        <p className="text-[11px] text-slate-400 line-clamp-2 mt-1.5 leading-relaxed">{work.detail}</p>
                                        <div className="mt-2 pt-2 border-t border-slate-50 grid grid-cols-2 gap-1">
                                            <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400">
                                                <PlayCircle size={15} className="text-blue-500" /> {formatTimestamp(work.started_at)}
                                            </div>
                                            <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400">
                                                <CheckCircle2 size={15} className="text-emerald-400" /> {formatTimestamp(work.completed_at)}
                                            </div>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="text-center py-20 opacity-30">
                                        <Inbox size={32} className="mx-auto mb-2" />
                                        <p className="text-[10px] font-bold">ไม่พบข้อมูลประวัติงาน</p>
                                    </div>
                                )}
                            </div>
                        </aside>
                    </div>
                ) : renderDailyTimeline()}
            </div>

            {/* ── Work Detail Modal ───────────────────────────────────────────── */}
            {showWorkModal && selectedWork && (() => {
                const roles = selectedWork.worker_role ? selectedWork.worker_role.split(", ") : [];
                const roleColors = roles.map(r => deptColorMap[r] || '#94a3b8');
                const barStyle = roleColors.length > 1 ? { background: `linear-gradient(to right, ${roleColors.join(", ")})` } : { backgroundColor: roleColors[0] || '#94a3b8' };
                const mainColor = roleColors[0] || '#94a3b8';

                return (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setShowWorkModal(false)}>
                        {/* ── FIXED: max-h + flex-col so inner content scrolls ── */}
                        <div
                            className="bg-white rounded-t-[2rem] md:rounded-[2.5rem] w-full md:max-w-lg shadow-2xl relative overflow-hidden flex flex-col max-h-[90dvh]"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Sticky top bar */}
                            <div className="shrink-0">
                                <div className="h-2.5 w-full" style={barStyle} />
                                <div className="flex justify-center pt-2 md:hidden"><div className="w-10 h-1 bg-slate-200 rounded-full" /></div>
                            </div>

                            {/* Scrollable content */}
                            <div className="overflow-y-auto p-5 md:p-10">
                                <div className="flex justify-between items-start mb-5 md:mb-8">
                                    <div className="flex flex-col gap-2">
                                        <h3 className="text-lg md:text-2xl font-black text-slate-800 leading-tight">รายละเอียดงาน</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {roles.length > 0 ? roles.map((role, i) => (
                                                <span key={role} className="px-3 py-1 rounded-lg text-[10px] font-black uppercase text-white shadow-sm" style={{ backgroundColor: roleColors[i] || '#94a3b8' }}>{role}</span>
                                            )) : <span className="px-3 py-1 rounded-lg text-[10px] font-black uppercase text-slate-400 bg-slate-100">ไม่ระบุแผนก</span>}
                                        </div>
                                    </div>
                                    <button onClick={() => setShowWorkModal(false)} className="p-2.5 bg-slate-50 rounded-xl md:rounded-2xl text-slate-400 hover:bg-slate-100 transition-colors"><X size={18} /></button>
                                </div>

                                <div className="space-y-3 md:space-y-4">
                                    <div className="grid grid-cols-2 gap-3 md:gap-4 text-sm font-bold">
                                        <div className="p-4 bg-slate-50 rounded-xl md:rounded-2xl border border-slate-100">
                                            <p className="text-[10px] text-slate-400 uppercase mb-1.5 font-black tracking-wider">หน่วยงาน</p>
                                            <div className="flex items-center gap-2 text-slate-700"><Building2 size={15} className="text-blue-500 shrink-0" /><span className="truncate">{selectedWork.department}</span></div>
                                        </div>
                                        <div className="p-4 bg-slate-50 rounded-xl md:rounded-2xl border border-slate-100">
                                            <p className="text-[10px] text-slate-400 uppercase mb-1.5 font-black tracking-wider">เวลานัดหมาย</p>
                                            <div className="flex items-center gap-2 text-slate-700"><Clock size={15} className="text-blue-500" />{selectedWork.work_time} น.</div>
                                        </div>
                                    </div>

                                    <div className={`grid gap-3 text-sm font-bold ${selectedWork.isMultiDay ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                        <div className="p-4 bg-slate-50 rounded-xl md:rounded-2xl border border-slate-100">
                                            <p className="text-[10px] text-slate-400 uppercase mb-1.5 font-black tracking-wider">วันที่เริ่ม</p>
                                            <div className="flex items-center gap-2 text-slate-700">
                                                <CalendarRange size={15} className="text-blue-500 shrink-0" />
                                                <span>{formatDisplayDate(selectedWork.work_date)}</span>
                                            </div>
                                        </div>
                                        {selectedWork.isMultiDay && selectedWork.endDate && (
                                            <div className="p-4 bg-emerald-50 rounded-xl md:rounded-2xl border border-emerald-100">
                                                <p className="text-[10px] text-emerald-500 uppercase mb-1.5 font-black tracking-wider">วันที่จบ · {selectedWork.durationDays} วัน</p>
                                                <div className="flex items-center gap-2 text-emerald-700">
                                                    <CalendarRange size={15} className="text-emerald-500 shrink-0" />
                                                    <span>{formatDisplayDate(selectedWork.end_date)}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="p-5 rounded-[1.5rem] md:rounded-[2rem] bg-slate-900 text-white font-bold shadow-xl">
                                        <p className="text-[10px] opacity-50 uppercase mb-2 font-black tracking-widest">รายละเอียดงาน</p>
                                        <p className="text-base md:text-lg leading-relaxed">{selectedWork.detail || "ไม่มีรายละเอียดเพิ่มเติม"}</p>
                                    </div>

                                    {/* Proof Photos Section */}
                                    {(selectedWork.start_photo_url || selectedWork.complete_photo_url) && (
                                        <div className="rounded-xl md:rounded-2xl border border-slate-100 overflow-hidden">
                                            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-100">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                                    <Camera size={11} /> รูปยืนยันงาน
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3 p-3">
                                                {selectedWork.start_photo_url ? (
                                                    <div>
                                                        <p className="text-[9px] font-black text-blue-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                                            <PlayCircle size={10} /> รูปเริ่มงาน
                                                        </p>
                                                        <a href={selectedWork.start_photo_url} target="_blank" rel="noopener noreferrer">
                                                            <img src={selectedWork.start_photo_url} alt="เริ่มงาน" className="w-full h-28 object-cover rounded-xl border-2 border-blue-100 hover:opacity-90 transition-opacity" />
                                                        </a>
                                                    </div>
                                                ) : (
                                                    <div className="h-28 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center">
                                                        <p className="text-[9px] font-bold text-slate-300 text-center">ยังไม่มีรูปเริ่มงาน</p>
                                                    </div>
                                                )}
                                                {selectedWork.complete_photo_url ? (
                                                    <div>
                                                        <p className="text-[9px] font-black text-emerald-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                                            <CheckCircle2 size={10} /> รูปเสร็จงาน
                                                        </p>
                                                        <a href={selectedWork.complete_photo_url} target="_blank" rel="noopener noreferrer">
                                                            <img src={selectedWork.complete_photo_url} alt="เสร็จงาน" className="w-full h-28 object-cover rounded-xl border-2 border-emerald-100 hover:opacity-90 transition-opacity" />
                                                        </a>
                                                    </div>
                                                ) : (
                                                    <div className="h-28 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center">
                                                        <p className="text-[9px] font-bold text-slate-300 text-center">ยังไม่มีรูปเสร็จงาน</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {(selectedWork.started_at || selectedWork.completed_at) && (
                                        <div className="rounded-xl md:rounded-2xl border border-slate-100 overflow-hidden">
                                            <div className="bg-slate-50 px-4 py-2.5 flex items-center justify-between border-b border-slate-100">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                                    <Timer size={11} /> บันทึกเวลาดำเนินงาน
                                                </span>
                                                {calcDuration(selectedWork.started_at, selectedWork.completed_at) && (
                                                    <span className="text-[10px] font-black text-violet-600 bg-violet-50 px-2.5 py-1 rounded-lg flex items-center gap-1">
                                                        <Timer size={10} /> รวม {calcDuration(selectedWork.started_at, selectedWork.completed_at)}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="divide-y divide-slate-50">
                                                <div className="flex items-center gap-3 px-4 py-3">
                                                    <div className="w-7 h-7 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                                                        <PlayCircle size={15} className="text-blue-500" />
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">เริ่มดำเนินงาน</p>
                                                        <p className="text-sm font-bold text-slate-800">
                                                            {selectedWork.started_at ? formatTimestamp(selectedWork.started_at) : <span className="text-slate-300">ยังไม่ได้เริ่ม</span>}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3 px-4 py-3">
                                                    <div className="w-7 h-7 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                                                        <CheckCircle2 size={15} className="text-emerald-500" />
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">เสร็จสิ้น</p>
                                                        <p className="text-sm font-bold text-slate-800">
                                                            {selectedWork.completed_at ? formatTimestamp(selectedWork.completed_at) : <span className="text-slate-300">ยังไม่เสร็จ</span>}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-3 mt-5 md:mt-10">
                                    {selectedWork.status === 'pending' && (
                                        <button
                                            onClick={() => handleStatusAction(selectedJobGroup.map(w => w.id), 'inprogress', selectedWork.detail)}
                                            className="flex-[2] py-3.5 md:py-4 rounded-xl md:rounded-2xl text-white font-black text-sm shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                                            style={{ backgroundColor: mainColor }}
                                        >
                                            <Camera size={16} /> เริ่มดำเนินงาน
                                        </button>
                                    )}
                                    {selectedWork.status === 'inprogress' && (
                                        <button
                                            onClick={() => handleStatusAction(selectedJobGroup.map(w => w.id), 'complete', selectedWork.detail)}
                                            className="flex-[2] bg-emerald-600 py-3.5 md:py-4 rounded-xl md:rounded-2xl text-white font-black text-sm shadow-lg hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                                        >
                                            <Camera size={16} /> เสร็จสิ้น
                                        </button>
                                    )}
                                    <button onClick={() => setShowWorkModal(false)} className="flex-1 py-3.5 md:py-4 bg-slate-100 rounded-xl md:rounded-2xl font-black text-sm text-slate-500 hover:bg-slate-200 transition-colors active:scale-95">ย้อนกลับ</button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}
            {photoModal && (
                <PhotoUploadModal
                    mode={photoModal.mode}
                    jobDetail={photoModal.detail}
                    onConfirm={handlePhotoConfirm}
                    onCancel={() => setPhotoModal(null)}
                />
            )}
        </div>
    );
}