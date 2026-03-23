"use client";
import React, { useEffect, useMemo, useState } from "react";
import {
    ChevronLeft, ChevronRight, Clock, CalendarDays,
    X, Search, Building2, Inbox, CheckCircle2
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface RawWorkSchedule {
    id: string;
    work_date: string;
    work_time: string;
    worker: string;
    worker_role: string;
    detail: string;
    department: string;
    status: 'pending' | 'inprogress' | 'complete';
    completed_at: string | null;
    started_at?: string | null;
    employee_ids: string[] | null;
}

interface WorkSchedule extends RawWorkSchedule {
    startTime: Date;
    startDate: Date;
    fullDateString: string;
    deptColor: string;
}

interface Department {
    name: string;
    color_code: string;
}

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

        const deptColorMap: Record<string, string> = (depts || []).reduce((acc, curr) => {
            acc[curr.name] = curr.color_code;
            return acc;
        }, {} as Record<string, string>);

        setDeptColorMap(deptColorMap);

        let query = supabase.from("work_schedule").select("*");
        // non-admin: filter เฉพาะงานที่ employee_ids มี id ของตัวเอง
        if (!admin && empId) {
            query = query.contains('employee_ids', [empId]);
        }

        const { data: worksData, error } = await query;
        if (error) return;

        const works = worksData as RawWorkSchedule[] | null;

        const mappedData = (works || []).map((w): WorkSchedule => {
            const datePart = new Date(w.work_date + 'T00:00:00');
            const timeParts = (w.work_time || "00:00").split(':');
            const startTime = new Date(datePart.getFullYear(), datePart.getMonth(), datePart.getDate(), parseInt(timeParts[0]), parseInt(timeParts[1]));
            const deptHex = deptColorMap[w.worker_role] || deptColorMap[w.department] || "#94a3b8";
            return {
                ...w,
                worker: w.worker || "",
                department: w.department || "",
                detail: w.detail || "",
                startTime,
                startDate: datePart,
                deptColor: deptHex,
                completed_at: w.completed_at,
                fullDateString: datePart.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' })
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
            const prevDay = new Date(selectedDate);
            prevDay.setDate(selectedDate.getDate() - 1);
            setSelectedDate(prevDay);
        } else {
            setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
        }
    };

    const handleNext = () => {
        if (currentView === 'daily' && selectedDate) {
            const nextDay = new Date(selectedDate);
            nextDay.setDate(selectedDate.getDate() + 1);
            setSelectedDate(nextDay);
        } else {
            setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
        }
    };

    const filteredHistory = useMemo(() => {
        return workSchedules
            .filter((w: WorkSchedule) => {
                if (w.status !== 'complete') return false;
                const searchLower = searchTerm.trim().toLowerCase();

                if (!searchLower) {
                    return w.startDate.getMonth() === currentDate.getMonth() &&
                        w.startDate.getFullYear() === currentDate.getFullYear();
                }

                const matchesText =
                    w.worker.toLowerCase().includes(searchLower) ||
                    w.detail.toLowerCase().includes(searchLower) ||
                    w.department.toLowerCase().includes(searchLower);

                const day = String(w.startDate.getDate()).padStart(2, '0');
                const month = String(w.startDate.getMonth() + 1).padStart(2, '0');
                const yearThai = w.startDate.getFullYear() + 543;
                const dateThaiString = `${day}/${month}/${yearThai}`;

                return matchesText || dateThaiString.includes(searchLower);
            })
            .sort((a, b) => {
                const timeA = a.completed_at ? new Date(a.completed_at).getTime() : a.startTime.getTime();
                const timeB = b.completed_at ? new Date(b.completed_at).getTime() : b.startTime.getTime();
                return timeB - timeA;
            });
    }, [workSchedules, searchTerm, currentDate]);

    const formatCompletedTime = (isoString: string | null) => {
        if (!isoString) return "ไม่ระบุเวลา";
        const d = new Date(isoString);
        const datePart = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`;
        const timePart = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        return `${datePart} ${timePart} น.`;
    };

    const cleanWorkerName = (name: string) => name.replace(/\s*\(.*?\)\s*/g, "").trim();

    const updateWorkStatus = async (ids: string[], status: 'pending' | 'inprogress' | 'complete') => {
        const updateData: Partial<RawWorkSchedule> = { status };
        if (status === 'complete') updateData.completed_at = new Date().toISOString();
        if (status === 'inprogress') updateData.started_at = new Date().toISOString();

        const { error } = await supabase.from("work_schedule").update(updateData).in("id", ids);
        if (!error) { fetchWorkSchedules(currentEmployeeId, isAdmin); setShowWorkModal(false); }
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
        for (let i = 0; i < offset; i++) days.push(<div key={`empty-${i}`} className="h-36 bg-slate-50/20 border-r border-b border-slate-100" />);
        for (let date = 1; date <= daysInMonth; date++) {
            const dateObj = new Date(currentDate.getFullYear(), currentDate.getMonth(), date);
            const isToday = now.toDateString() === dateObj.toDateString();
            const dayWorks = workSchedules.filter(w => w.startDate.toDateString() === dateObj.toDateString() && w.status !== 'complete');

            const uniqueJobs: Record<string, WorkSchedule[]> = {};
            dayWorks.forEach(work => {
                const jobKey = `${work.work_time}-${work.department}-${work.detail}`;
                if (!uniqueJobs[jobKey]) uniqueJobs[jobKey] = [];
                uniqueJobs[jobKey].push(work);
            });

            days.push(
                <div key={date} className="h-20 md:h-36 border-r border-b border-slate-100 p-1 md:p-2 bg-white active:bg-slate-50 transition-all cursor-pointer overflow-hidden"
                    onClick={() => { setSelectedDate(dateObj); switchView('daily'); }}>
                    <div className="flex justify-between items-start mb-1">
                        <div className={`w-7 h-7 flex items-center justify-center rounded-xl text-[11px] font-bold ${isToday ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-slate-400'}`}>{date}</div>
                        {dayWorks.length > 0 && (
                            <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-lg border border-blue-100">
                                {dayWorks.length} {dayWorks.length === 1 ? 'job' : 'jobs'}
                            </span>
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
                                    <div className="flex justify-between opacity-90 border-b border-white/20 mb-0.5"><span>{job.work_time.substring(0, 5)}</span></div>
                                    <span className="truncate block leading-tight">{group.map(w => cleanWorkerName(w.worker)).join(', ')}</span>
                                </div>
                            );
                        })}
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
        const workers = Array.from(new Set(dayWorks.map(w => w.worker)));
        const hourWidth = 280;
        if (workers.length === 0) return (
            <div className="bg-white border rounded-[2rem] p-24 text-center">
                <Inbox size={48} className="text-slate-200 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-slate-300">ไม่มีรายการงานค้าง</h3>
                <button onClick={() => switchView('calendar')} className="mt-6 bg-blue-600 text-white px-8 py-3 rounded-xl font-bold text-sm">กลับหน้าปฏิทิน</button>
            </div>
        );
        return (
            <div className="bg-white border border-slate-100 rounded-[2rem] shadow-sm overflow-hidden">
                <div className="overflow-x-auto main-timeline-scroll">
                    <div style={{ width: `${(hours.length * hourWidth) + 260}px` }} className="relative">
                        <div className="flex bg-slate-50 border-b sticky top-0 z-30">
                            <div className="w-[140px] md:w-[260px] p-3 md:p-5 font-bold text-slate-400 text-center border-r text-[10px] uppercase tracking-widest bg-slate-50">ช่าง</div>
                            {hours.map(h => <div key={h} style={{ width: hourWidth }} className="p-3 md:p-5 text-center font-bold text-slate-500 border-r text-xs md:text-sm">{h}:00</div>)}
                        </div>
                        <div className="divide-y divide-slate-100">
                            {workers.map(worker => {
                                const works = dayWorks.filter(w => w.worker === worker);
                                return (
                                    <div key={worker} className="flex min-h-[120px] md:min-h-[150px] relative">
                                        <div className="w-[140px] md:w-[260px] sticky left-0 z-20 bg-white border-r flex shadow-lg shadow-slate-900/5 overflow-hidden">
                                            <div className="w-2 shrink-0 h-full" style={{ backgroundColor: works[0].deptColor }}></div>
                                            <div className="flex flex-col justify-center px-3 md:px-6">
                                                <span className="font-bold text-slate-800 text-sm md:text-lg leading-tight mb-1">{cleanWorkerName(worker)}</span>
                                                <span className="text-[11px] md:text-[13px] font-semibold uppercase tracking-wide" style={{ color: works[0].deptColor }}>{works[0].worker_role || "DEPT"}</span>
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
                                                    <div key={work.id} onClick={() => { setSelectedWork(work); setSelectedJobGroup([work]); setShowWorkModal(true); }}
                                                        style={{
                                                            left: leftPos + 20, width: 250, top: 25, position: 'absolute',
                                                            '--dept-color': work.deptColor,
                                                            backgroundColor: animClass ? undefined : work.deptColor, color: 'white'
                                                        } as React.CSSProperties}
                                                        className={`p-4 rounded-2xl shadow-lg flex flex-col gap-1.5 min-h-[100px] z-10 calendar-event-card ${animClass}`}
                                                    >
                                                        <div className="flex justify-between items-center mb-1">
                                                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-black/15 text-[11px] font-bold"><Clock size={12} /> {work.work_time.substring(0, 5)}</div>
                                                            <span className="text-[9px] font-bold uppercase opacity-80 tracking-tighter">{work.status}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 font-bold text-[15px] opacity-100"><Building2 size={14} /><span className="truncate">{work.department}</span></div>
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
        );
    };

    return (
        <div className="thai-font-container min-h-screen bg-[#f8fafc] p-4 md:p-6 text-slate-700">
            <style dangerouslySetInnerHTML={{ __html: customStyles }} />
            <div className="max-w-[1600px] mx-auto space-y-6">
                <header className="flex flex-col md:flex-row justify-between items-center bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 gap-4">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-slate-950 rounded-2xl text-white shadow-lg shadow-slate-200">
                            <CalendarDays size={24} />
                        </div>
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
                        {currentView === 'daily' && <button onClick={() => switchView('calendar')} className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold text-xs shadow-md uppercase tracking-wider">กลับไปหน้าปฏิทิน</button>}
                    </div>
                </header>

                {currentView === 'calendar' ? (
                    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                        <div className="xl:col-span-3 bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
                            <div className="grid grid-cols-7 bg-slate-50/50 border-b">
                                {['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'].map(d => (<div key={d} className="py-4 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">{d}</div>))}
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
                                {filteredHistory.length > 0 ? (filteredHistory.map((work, idx) => (
                                    <div key={idx} onClick={() => { setSelectedWork(work); setSelectedJobGroup([work]); setShowWorkModal(true); }}
                                        style={{ borderLeftColor: work.deptColor }}
                                        className="group p-4 rounded-2xl border-l-4 bg-white shadow-sm hover:shadow-md cursor-pointer border-slate-50 transition-all">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg">
                                                <CheckCircle2 size={10} /> DONE
                                            </div>
                                            <span className="text-[9px] font-bold text-slate-400">
                                                {formatCompletedTime(work.completed_at)}
                                            </span>
                                        </div>
                                        <p className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{cleanWorkerName(work.worker)}</p>
                                        <div className="flex items-center gap-1.5 mt-1 text-[11px] font-bold text-slate-500">
                                            <Building2 size={12} className="text-slate-400" />
                                            <span>{work.department}</span>
                                        </div>
                                        <p className="text-[11px] text-slate-400 line-clamp-2 mt-2 leading-relaxed">{work.detail}</p>
                                    </div>
                                ))) : (
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

            {/* Modal */}
            {showWorkModal && selectedWork && (() => {
                const roles = selectedWork.worker_role ? selectedWork.worker_role.split(", ") : [];
                const roleColors = roles.map(r => deptColorMap[r] || '#94a3b8');
                const barStyle = roleColors.length > 1
                    ? { background: `linear-gradient(to right, ${roleColors.join(", ")})` }
                    : { backgroundColor: roleColors[0] || '#94a3b8' };
                const mainColor = roleColors[0] || '#94a3b8';

                return (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4" onClick={() => setShowWorkModal(false)}>
                    <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl relative overflow-hidden" onClick={e => e.stopPropagation()}>
                        {/* gradient bar เหมือน home */}
                        <div className="h-3 w-full" style={barStyle} />

                        <div className="p-5 md:p-10">
                            <div className="flex justify-between items-start mb-5 md:mb-8">
                                <div className="flex flex-col gap-2">
                                    <h3 className="text-2xl font-black text-slate-800 leading-tight">รายละเอียดงาน</h3>
                                    {/* role badges ผสมสีตามแผนก */}
                                    <div className="flex flex-wrap gap-2">
                                        {roles.length > 0 ? roles.map((role, i) => (
                                            <span key={role} className="px-3 py-1 rounded-lg text-[10px] font-black uppercase text-white shadow-sm"
                                                style={{ backgroundColor: roleColors[i] || '#94a3b8' }}>
                                                {role}
                                            </span>
                                        )) : (
                                            <span className="px-3 py-1 rounded-lg text-[10px] font-black uppercase text-slate-400 bg-slate-100">ไม่ระบุแผนก</span>
                                        )}
                                    </div>
                                </div>
                                <button onClick={() => setShowWorkModal(false)} className="p-3 bg-slate-50 rounded-2xl text-slate-400 hover:bg-slate-100 transition-colors"><X size={20} /></button>
                            </div>

                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4 text-sm font-bold">
                                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                                        <p className="text-[10px] text-slate-400 uppercase mb-2 font-black tracking-wider">หน่วยงาน</p>
                                        <div className="flex items-center gap-2 text-slate-700"><Building2 size={16} className="text-blue-500" />{selectedWork.department}</div>
                                    </div>
                                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                                        <p className="text-[10px] text-slate-400 uppercase mb-2 font-black tracking-wider">เวลานัดหมาย</p>
                                        <div className="flex items-center gap-2 text-slate-700"><Clock size={16} className="text-blue-500" />{selectedWork.work_time} น.</div>
                                    </div>
                                </div>
                                <div className="p-5 md:p-8 rounded-[2rem] bg-slate-900 text-white font-bold shadow-xl">
                                    <p className="text-[10px] opacity-50 uppercase mb-3 font-black tracking-widest">รายละเอียดงาน</p>
                                    <p className="text-lg leading-relaxed">{selectedWork.detail || "ไม่มีรายละเอียดเพิ่มเติม"}</p>
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6 md:mt-10">
                                {selectedWork.status === 'pending' && (
                                    <button onClick={() => updateWorkStatus(selectedJobGroup.map(w => w.id), 'inprogress')}
                                        className="flex-[2] py-4 rounded-2xl text-white font-black text-sm shadow-lg active:scale-95 transition-all"
                                        style={{ backgroundColor: mainColor }}>
                                        เริ่มดำเนินงาน
                                    </button>
                                )}
                                {selectedWork.status === 'inprogress' && (
                                    <button onClick={() => updateWorkStatus(selectedJobGroup.map(w => w.id), 'complete')}
                                        className="flex-[2] bg-emerald-600 py-4 rounded-2xl text-white font-black text-sm shadow-lg hover:bg-emerald-700 active:scale-95 transition-all">
                                        เสร็จสิ้นภารกิจ
                                    </button>
                                )}
                                <button onClick={() => setShowWorkModal(false)} className="flex-1 py-4 bg-slate-100 rounded-2xl font-black text-sm text-slate-500 hover:bg-slate-200 transition-colors active:scale-95">ย้อนกลับ</button>
                            </div>
                        </div>
                    </div>
                </div>
                );
            })()}
        </div>
    );
}