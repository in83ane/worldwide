"use client";
import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
    Search, X, Clock, Briefcase,
    Pencil, Trash2, Maximize, Minimize, Users, Loader2, CheckCircle2,
    Save, Settings, User, CircleDollarSign, MapPin, Undo2,
    PlusIcon, ChevronDown, Check, AlertTriangle, TrendingDown,
    CalendarRange, PlayCircle, Timer, Camera
} from 'lucide-react';
import Link from "next/link";
import PhotoUploadModal from "@/components/PhotoUploadModal";
import { uploadWorkPhoto } from "@/lib/uploadWorkPhoto";

interface Department { id: string; name: string; color_code: string; }

interface Employee {
    id: string;
    name: string;
    staff_id: string | null;
    image_url: string | null;
    departments: Department | null;
}

interface WorkScheduleItem {
    id: string;
    work_date: string;
    end_date: string | null;
    work_time: string;
    work_shift: string;
    department: string;
    detail: string;
    worker_role: string;
    worker: string;
    employee_id: string | null;
    employee_ids: string[] | null;
    user_id: string | null;
    status: 'pending' | 'inprogress' | 'complete' | null;
    lat: number | null;
    lng: number | null;
    started_at: string | null;
    completed_at: string | null;
    start_photo_url?: string | null;
    complete_photo_url?: string | null;
}

interface WorkForm {
    work_date: string;
    end_date: string;
    work_time: string;
    department: string;
    detail: string;
    worker_role: string[];
    current_worker_input: string;
    selected_workers: string[];
    selected_worker_ids: string[];
}

const getAvatarUrl = (name: string) => {
    const displayName = name?.trim() || "Staff";
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random&color=fff&size=200&font-size=0.35`;
};

function getThaiShift(timeStr: string): string {
    const [h] = (timeStr || "08:30").split(":").map(Number);
    if (h >= 5 && h < 12) return "เช้า";
    if (h >= 12 && h < 18) return "บ่าย";
    return "ค่ำ/ดึก";
}

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

export default function HomePage() {
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);
    const deptDropdownRef = useRef<HTMLDivElement>(null);

    const [user, setUser] = useState<{ id: string; role: string; name?: string; employeeId?: string | null } | null>(null);
    const [allWorkData, setAllWorkData] = useState<WorkScheduleItem[]>([]);
    const [masterEmployees, setMasterEmployees] = useState<Employee[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isTableZoomed, setIsTableZoomed] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [selectedWork, setSelectedWork] = useState<WorkScheduleItem | null>(null);
    const [showWorkModal, setShowWorkModal] = useState(false);
    const [isDeptOpen, setIsDeptOpen] = useState(false);
    const [locationSuggestions, setLocationSuggestions] = useState<LongdoResult[]>([]);
    const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
    const [locationSearching, setLocationSearching] = useState(false);
    const locationDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
    const locationInputRef = useRef<HTMLDivElement>(null);

    // Photo upload state
    const [photoModal, setPhotoModal] = useState<{ mode: 'start' | 'complete'; id: string; detail: string } | null>(null);

    const initialFormState: WorkForm = {
        work_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date()),
        end_date: '',
        work_time: '08:30',
        department: '',
        detail: '',
        worker_role: [],
        current_worker_input: '',
        selected_workers: [],
        selected_worker_ids: [],
    };
    const [formData, setFormData] = useState<WorkForm>(initialFormState);

    const isAdmin = user?.role === 'admin';

    const deptColorMap = useMemo(() => departments.reduce((acc, curr) => {
        acc[curr.name] = curr.color_code; return acc;
    }, {} as Record<string, string>), [departments]);

    const recommendedWorkers = useMemo(() => {
        if (formData.worker_role.length === 0) return [];
        return masterEmployees
            .filter(emp => emp.departments && formData.worker_role.includes(emp.departments.name))
            .map(emp => {
                const load = allWorkData.filter(w => !w.status?.includes('complete') && (w.employee_ids ?? []).includes(emp.id)).length;
                const hasConflict = allWorkData.some(w => {
                    if (w.id === editingId || w.status === 'complete') return false;
                    if (w.work_date !== formData.work_date || w.work_time !== formData.work_time) return false;
                    return (w.employee_ids ?? []).includes(emp.id);
                });
                return { ...emp, load, hasConflict };
            })
            .sort((a, b) => a.load - b.load);
    }, [formData.worker_role, formData.work_date, formData.work_time, masterEmployees, allWorkData, editingId]);

    const refreshData = useCallback(async (activeRole: string, activeEmployeeId: string | null) => {
        try {
            let scheduleQuery = supabase.from("work_schedule").select("*");
            if (activeRole !== 'admin' && activeEmployeeId)
                scheduleQuery = scheduleQuery.contains('employee_ids', [activeEmployeeId]);
            const [scheduleRes, empsRes, deptsRes] = await Promise.all([
                scheduleQuery,
                supabase.from("employees").select("*, departments:department_id(*)").eq("is_active", true),
                supabase.from("departments").select("*"),
            ]);
            const sortedData = (scheduleRes.data as WorkScheduleItem[] || []).sort((a, b) =>
                `${a.work_date}T${a.work_time}`.localeCompare(`${b.work_date}T${b.work_time}`)
            );
            setAllWorkData(sortedData);
            setMasterEmployees(empsRes.data as Employee[] || []);
            setDepartments(deptsRes.data as Department[] || []);
        } catch (err) { console.error(err); }
    }, [supabase]);

    useEffect(() => {
        async function init() {
            setLoading(true);
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (!authUser) return router.push("/auth/login");
            const { data: profile } = await supabase.from("profiles").select("role, email").eq("id", authUser.id).single();
            const { data: employee } = await supabase.from("employees").select("id, name").eq("user_id", authUser.id).single();
            const userRole = profile?.role || 'user';
            const userName = employee?.name || profile?.email?.split('@')[0] || "Admin";
            const employeeId = employee?.id || null;
            setUser({ id: authUser.id, role: userRole, name: userName, employeeId });
            await refreshData(userRole, employeeId);
            setLoading(false);
        }
        init();
        const handleClickOutside = (e: MouseEvent) => {
            if (deptDropdownRef.current && !deptDropdownRef.current.contains(e.target as Node)) setIsDeptOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [supabase, router, refreshData]);

    const handleLocationInput = (value: string) => {
        setFormData(prev => ({ ...prev, department: value }));
        if (locationDebounce.current) clearTimeout(locationDebounce.current);
        if (!value.trim() || value.length < 2) { setLocationSuggestions([]); setShowLocationSuggestions(false); return; }
        setLocationSearching(true);
        locationDebounce.current = setTimeout(async () => {
            const results = await searchPlaces(value);
            setLocationSuggestions(results);
            setShowLocationSuggestions(results.length > 0);
            setLocationSearching(false);
        }, 400);
    };

    const handleSelectLocation = (result: LongdoResult) => {
        setFormData(prev => ({ ...prev, department: result.name }));
        setLocationSuggestions([]);
        setShowLocationSuggestions(false);
    };

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (locationInputRef.current && !locationInputRef.current.contains(e.target as Node))
                setShowLocationSuggestions(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const geocodeDepartment = async (placeName: string): Promise<{ lat: number; lng: number } | null> => {
        try {
            const res = await fetch(`https://search.longdo.com/mapsearch/json/search?keyword=${encodeURIComponent(placeName)}&limit=1&key=${LONGDO_KEY}`);
            const data = await res.json();
            const item = data.data?.[0];
            if (item?.lat && item?.lon) return { lat: item.lat, lng: item.lon };
        } catch { }
        return null;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.worker_role.length === 0) return alert("กรุณาเลือกอย่างน้อย 1 แผนก");
        if (formData.end_date && formData.end_date < formData.work_date) return alert("วันที่จบต้องไม่น้อยกว่าวันที่เริ่ม");
        setSubmitting(true);
        const coords = formData.department ? await geocodeDepartment(formData.department) : null;
        const payload = {
            work_date: formData.work_date,
            end_date: formData.end_date || formData.work_date,
            work_time: formData.work_time,
            work_shift: getThaiShift(formData.work_time),
            department: formData.department,
            detail: formData.detail,
            worker_role: formData.worker_role.join(", "),
            worker: formData.selected_workers.join(", "),
            employee_id: formData.selected_worker_ids[0] || null,
            employee_ids: formData.selected_worker_ids,
            user_id: user?.id,
            lat: coords?.lat ?? null,
            lng: coords?.lng ?? null,
        };
        const { error } = editingId
            ? await supabase.from("work_schedule").update(payload).eq("id", editingId)
            : await supabase.from("work_schedule").insert([{ ...payload, status: 'pending' }]);
        if (!error && user) { setFormData(initialFormState); setEditingId(null); refreshData(user.role, user.employeeId ?? null); }
        setSubmitting(false);
    };

    // ── Photo-aware status update ──────────────────────────────────────────────
    const handleStatusAction = (id: string, status: 'inprogress' | 'complete', detail: string) => {
        setShowWorkModal(false);
        setPhotoModal({ mode: status === 'inprogress' ? 'start' : 'complete', id, detail });
    };

    const handlePhotoConfirm = async (file: File) => {
        if (!photoModal) return;
        const { mode, id } = photoModal;

        const photoUrl = await uploadWorkPhoto(supabase, file, id, mode);

        const status = mode === 'start' ? 'inprogress' : 'complete';
        const updateData: Record<string, string> = { status };
        if (mode === 'start') {
            updateData.started_at = new Date().toISOString();
            updateData.start_photo_url = photoUrl;
        } else {
            updateData.completed_at = new Date().toISOString();
            updateData.complete_photo_url = photoUrl;
        }

        await supabase.from("work_schedule").update(updateData).eq("id", id);
        if (user) refreshData(user.role, user.employeeId ?? null);
        setPhotoModal(null);
    };

    const filteredWork = useMemo(() => {
        const lower = searchTerm.toLowerCase();
        if (!searchTerm.trim()) return [...allWorkData].filter(item => item.status !== 'complete');
        return [...allWorkData].filter(item =>
            ((item.department ?? "") + (item.detail ?? "") + (item.worker ?? "") + (item.worker_role ?? "")).toLowerCase().includes(lower)
        );
    }, [allWorkData, searchTerm]);

    const isMultiDay = (item: WorkScheduleItem) => item.end_date && item.end_date !== item.work_date;
    const getDurationDays = (item: WorkScheduleItem) => {
        if (!item.end_date || item.end_date === item.work_date) return null;
        return Math.round((new Date(item.end_date).getTime() - new Date(item.work_date).getTime()) / (1000 * 60 * 60 * 24)) + 1;
    };

    if (loading) return <div className="h-screen flex items-center justify-center font-black text-slate-400 text-xl animate-pulse">Loading...</div>;

    return (
        <main className={`transition-all duration-300 ${isTableZoomed ? 'fixed inset-0 bg-slate-50 z-50 p-3 overflow-y-auto' : 'max-w-[1400px] mx-auto p-3 md:p-8'}`}>
            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes status-glow-red { 0%, 100% { background-color: #ffffff; } 50% { background-color: #fef2f2; } }
                @keyframes status-glow-orange { 0%, 100% { background-color: #ffffff; } 50% { background-color: #fffbeb; } }
                .glow-overdue { animation: status-glow-red 2s infinite ease-in-out; }
                .glow-inprogress { animation: status-glow-orange 2.5s infinite ease-in-out; }
            `}} />

            <header className={`mb-4 md:mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 ${isTableZoomed ? 'hidden' : ''}`}>
                <h1 className="text-lg md:text-3xl font-black text-slate-900 flex items-center gap-2">
                    <div className="p-2 md:p-3 bg-slate-900 rounded-xl md:rounded-2xl text-white shadow-xl"><Briefcase size={20} /></div>
                    ระบบจัดการตารางงาน
                </h1>
                {isAdmin && (
                    <div className="flex flex-wrap gap-2 animate-in fade-in duration-500 w-full md:w-auto">
                        <Link href="/employees" className="bg-white border-2 px-3 py-2 md:px-5 md:py-3 rounded-xl md:rounded-2xl font-black text-slate-600 hover:text-slate-900 transition-all flex items-center gap-1.5 shadow-sm text-sm"><Users size={15} /> พนักงาน</Link>
                        <Link href="/departments" className="bg-white border-2 px-3 py-2 md:px-5 md:py-3 rounded-xl md:rounded-2xl font-black text-slate-600 hover:text-slate-900 transition-all flex items-center gap-1.5 shadow-sm text-sm"><Settings size={15} /> แผนก</Link>
                        <Link href="/price" className="bg-amber-50 border-2 border-amber-200 px-3 py-2 md:px-5 md:py-3 rounded-xl md:rounded-2xl font-black text-amber-600 hover:bg-amber-600 hover:text-white transition-all flex items-center gap-1.5 shadow-sm ml-auto text-sm"><CircleDollarSign size={15} /> แก้ไขราคาวัสดุ</Link>
                    </div>
                )}
            </header>

            {isAdmin && !isTableZoomed && (
                <section className={`bg-white rounded-[1.5rem] md:rounded-[2.5rem] shadow-xl border-4 p-4 md:p-8 mb-5 md:mb-12 transition-all animate-in slide-in-from-top-4 ${editingId ? 'border-orange-500 scale-[1.01]' : 'border-white'}`}>
                    <div className="flex justify-between items-center mb-4 md:mb-8">
                        <h2 className="text-base md:text-xl font-black flex items-center gap-2">
                            {editingId ? <Pencil size={18} className="text-orange-500" /> : <PlusIcon size={18} className="text-emerald-500" />}
                            {editingId ? 'กำลังแก้ไขแผนงาน' : 'สร้างแผนงานใหม่'}
                        </h2>
                        {editingId && (
                            <button onClick={() => { setEditingId(null); setFormData(initialFormState); }} className="text-xs font-black text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5">
                                <Undo2 size={15} /> ยกเลิก
                            </button>
                        )}
                    </div>

                    <form onSubmit={handleSubmit} className="flex flex-col gap-4 md:gap-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 items-end">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-black uppercase opacity-50 ml-2 tracking-wider">วันที่เริ่ม</label>
                                <input type="date" required
                                    className="h-11 md:h-[60px] px-3 md:px-4 bg-slate-50 border-2 rounded-xl md:rounded-2xl font-bold outline-none w-full focus:bg-white focus:border-slate-900 transition-all text-sm"
                                    value={formData.work_date}
                                    onChange={e => {
                                        const newStart = e.target.value;
                                        const newEnd = formData.end_date && formData.end_date < newStart ? newStart : formData.end_date;
                                        setFormData({ ...formData, work_date: newStart, end_date: newEnd });
                                    }} />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-black uppercase opacity-50 ml-2 tracking-wider flex items-center gap-1"><CalendarRange size={10} /> วันที่จบ</label>
                                <input type="date"
                                    min={formData.work_date}
                                    className="h-11 md:h-[60px] px-3 md:px-4 bg-slate-50 border-2 rounded-xl md:rounded-2xl font-bold outline-none w-full focus:bg-white focus:border-emerald-500 transition-all text-sm"
                                    value={formData.end_date || formData.work_date}
                                    onChange={e => setFormData({ ...formData, end_date: e.target.value })} />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-black uppercase opacity-50 ml-2 tracking-wider">เวลานัดหมาย</label>
                                <input type="time" required
                                    className="h-11 md:h-[60px] px-3 md:px-4 bg-slate-50 border-2 rounded-xl md:rounded-2xl font-bold outline-none w-full focus:bg-white focus:border-slate-900 transition-all text-sm"
                                    value={formData.work_time}
                                    onChange={e => setFormData({ ...formData, work_time: e.target.value })} />
                            </div>
                            <div className="col-span-2 md:col-span-1 relative flex flex-col gap-1.5" ref={deptDropdownRef}>
                                <label className="text-[10px] font-black uppercase opacity-50 ml-2 tracking-wider">ประเภทงาน</label>
                                <button type="button" onClick={() => setIsDeptOpen(!isDeptOpen)}
                                    className="h-11 md:h-[60px] w-full px-3 md:px-4 bg-slate-50 border-2 rounded-xl md:rounded-2xl font-bold text-left flex justify-between items-center hover:border-slate-400 transition-all text-sm">
                                    <span className="truncate">{formData.worker_role.length > 0 ? formData.worker_role.join(", ") : "คลิกเพื่อเลือกแผนก..."}</span>
                                    <ChevronDown size={18} className={`transition-transform ${isDeptOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {isDeptOpen && (
                                    <div className="absolute z-[110] w-full top-[85px] md:top-[95px] bg-white shadow-2xl rounded-2xl md:rounded-3xl p-2 md:p-3 border-2 border-slate-100 grid grid-cols-1 gap-1">
                                        {departments.map(dept => {
                                            const isChecked = formData.worker_role.includes(dept.name);
                                            return (
                                                <button key={dept.id} type="button" onClick={() => {
                                                    const newRoles = isChecked ? formData.worker_role.filter(r => r !== dept.name) : [...formData.worker_role, dept.name];
                                                    const updatedWorkers: string[] = [];
                                                    const updatedWorkerIds: string[] = [];
                                                    formData.selected_worker_ids.forEach((id, index) => {
                                                        const emp = masterEmployees.find(e => e.id === id);
                                                        if (emp && emp.departments && newRoles.includes(emp.departments.name)) {
                                                            updatedWorkers.push(formData.selected_workers[index]);
                                                            updatedWorkerIds.push(id);
                                                        }
                                                    });
                                                    setFormData({ ...formData, worker_role: newRoles, selected_workers: updatedWorkers, selected_worker_ids: updatedWorkerIds });
                                                }} className={`flex items-center justify-between p-3 rounded-xl md:rounded-2xl transition-all text-sm ${isChecked ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`}>
                                                    <span className="font-bold">{dept.name}</span>
                                                    <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center ${isChecked ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-slate-200'}`}>
                                                        {isChecked && <Check size={13} className="text-white" />}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {formData.end_date && formData.end_date !== formData.work_date && (() => {
                            const days = Math.round((new Date(formData.end_date).getTime() - new Date(formData.work_date).getTime()) / (1000 * 60 * 60 * 24)) + 1;
                            return (
                                <div className="flex items-center gap-2 -mt-2">
                                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-2 rounded-2xl text-sm font-black">
                                        <CalendarRange size={14} />
                                        งานยาว {days} วัน · {formatDisplayDate(formData.work_date)} ถึง {formatDisplayDate(formData.end_date)}
                                    </div>
                                </div>
                            );
                        })()}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-black uppercase opacity-50 ml-2 tracking-wider">สถานที่ / หน่วยงาน</label>
                                <div className="relative" ref={locationInputRef}>
                                    <MapPin className="absolute left-3 top-[14px] text-slate-400 z-10" size={16} />
                                    {locationSearching && <Loader2 size={13} className="absolute right-3 top-[16px] text-slate-400 animate-spin z-10" />}
                                    <input required
                                        className="h-11 md:h-[60px] pl-9 pr-4 bg-slate-50 border-2 rounded-xl md:rounded-2xl font-bold w-full focus:bg-white focus:border-slate-900 transition-all outline-none text-sm"
                                        placeholder="พิมพ์ชื่อสถานที่..."
                                        value={formData.department}
                                        onChange={e => handleLocationInput(e.target.value)}
                                        onFocus={() => locationSuggestions.length > 0 && setShowLocationSuggestions(true)} />
                                    {showLocationSuggestions && locationSuggestions.length > 0 && (
                                        <div className="absolute z-[120] w-full bg-white shadow-2xl rounded-xl md:rounded-2xl mt-1 border-2 border-slate-100 overflow-hidden">
                                            {locationSuggestions.map((s, idx) => (
                                                <button key={idx} type="button" onMouseDown={() => handleSelectLocation(s)}
                                                    className="w-full flex items-start gap-2 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left border-b border-slate-50 last:border-0">
                                                    <MapPin size={13} className="text-slate-400 mt-0.5 shrink-0" />
                                                    <div className="min-w-0">
                                                        <p className="font-bold text-sm text-slate-800 truncate">{s.name}</p>
                                                        <p className="text-xs text-slate-400 truncate">{s.address}</p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5 relative">
                                <label className="text-[10px] font-black uppercase opacity-50 ml-2 tracking-wider flex justify-between">
                                    มอบหมายช่าง <span className="hidden md:inline">(กรองความว่าง + ภาระงาน)</span>
                                </label>
                                <div className="flex flex-wrap items-center gap-1.5 px-3 bg-slate-50 border-2 rounded-xl md:rounded-2xl min-h-[44px] md:min-h-[60px] border-slate-200 shadow-inner">
                                    {formData.selected_workers.map((w, idx) => (
                                        <span key={(formData.selected_worker_ids ?? [])[idx] ?? w} className="bg-slate-900 text-white px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm animate-in zoom-in-95">
                                            {w} <X size={12} className="cursor-pointer hover:text-red-400" onClick={() => setFormData({ ...formData, selected_workers: formData.selected_workers.filter((_, i) => i !== idx), selected_worker_ids: (formData.selected_worker_ids ?? []).filter((_, i) => i !== idx) })} />
                                        </span>
                                    ))}
                                    <input
                                        placeholder={formData.worker_role.length > 0 ? "พิมพ์ชื่อช่าง..." : "กรุณาเลือกแผนกก่อน..."}
                                        className="flex-grow bg-transparent p-1.5 font-bold outline-none disabled:cursor-not-allowed text-sm"
                                        value={formData.current_worker_input}
                                        disabled={formData.worker_role.length === 0}
                                        onChange={e => setFormData({ ...formData, current_worker_input: e.target.value })} />
                                </div>
                                {formData.current_worker_input && formData.worker_role.length > 0 && (
                                    <div className="absolute z-[100] w-full top-full bg-white shadow-2xl rounded-2xl md:rounded-3xl mt-1 max-h-52 overflow-auto border-2 border-slate-100 p-1.5 animate-in slide-in-from-top-2">
                                        {recommendedWorkers.filter(e => e.name.toLowerCase().includes(formData.current_worker_input.toLowerCase())).length === 0 ? (
                                            <div className="py-6 text-center text-slate-400">
                                                <p className="text-sm font-bold">ไม่มีพนักงานชื่อนี้</p>
                                                <p className="text-xs font-medium mt-0.5 text-slate-300">ลองค้นหาด้วยชื่ออื่น</p>
                                            </div>
                                        ) : recommendedWorkers.filter(e => e.name.toLowerCase().includes(formData.current_worker_input.toLowerCase())).map(emp => {
                                            const ids = formData.selected_worker_ids ?? [];
                                            const alreadySelected = ids.includes(emp.id);
                                            return (
                                                <button key={emp.id} type="button" disabled={emp.hasConflict || alreadySelected}
                                                    onClick={() => setFormData({ ...formData, selected_workers: [...formData.selected_workers, emp.name], selected_worker_ids: [...ids, emp.id], current_worker_input: '' })}
                                                    className={`w-full p-3 rounded-xl md:rounded-2xl flex justify-between items-center ${(emp.hasConflict || alreadySelected) ? 'opacity-50 bg-red-50 cursor-not-allowed' : 'hover:bg-slate-50 transition-all'}`}>
                                                    <div className="flex items-center gap-2.5">
                                                        <img src={emp.image_url || getAvatarUrl(emp.name)} className="w-9 h-9 rounded-xl object-cover border-2 border-white shadow-sm" />
                                                        <div className="text-left">
                                                            <p className="font-bold text-slate-800 text-sm">{emp.name}</p>
                                                            <p className="text-[10px] uppercase font-black text-slate-400">{emp.departments?.name}</p>
                                                        </div>
                                                    </div>
                                                    {alreadySelected
                                                        ? <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2.5 py-1 rounded-xl flex items-center gap-1"><Check size={11} /> เลือกแล้ว</span>
                                                        : emp.hasConflict
                                                            ? <span className="text-[10px] font-black text-red-500 bg-red-100 px-2.5 py-1 rounded-xl flex items-center gap-1"><AlertTriangle size={11} /> ไม่ว่าง</span>
                                                            : <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-xl flex items-center gap-1"><TrendingDown size={11} /> งานค้าง: {emp.load}</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-col gap-1.5"> 
                            <label className="text-[10px] font-black uppercase opacity-50 ml-2 tracking-wider">รายละเอียดงาน</label>
                            <textarea rows={3} required className="p-3 md:p-5 bg-slate-50 border-2 rounded-xl md:rounded-[1.5rem] font-bold w-full focus:bg-white focus:border-slate-900 transition-all outline-none text-sm" placeholder="ระบุสิ่งที่ต้องทำ..." value={formData.detail} onChange={e => setFormData({ ...formData, detail: e.target.value })} />
                        </div>

                        <button type="submit" disabled={submitting} className={`w-full py-3.5 md:py-5 rounded-[1.5rem] md:rounded-[2rem] font-black text-base md:text-xl flex items-center justify-center gap-2.5 shadow-lg transition-all ${editingId ? 'bg-orange-500 hover:bg-orange-600' : 'bg-slate-900 hover:bg-slate-800'} text-white active:scale-[0.98]`}>
                            {submitting ? <Loader2 className="animate-spin" size={20} /> : editingId ? <CheckCircle2 size={20} /> : <Save size={20} />}
                            {editingId ? 'ยืนยันการแก้ไขข้อมูล' : 'บันทึกลงตารางปฏิบัติงาน'}
                        </button>
                    </form>
                </section>
            )}

            <section className="space-y-4 md:space-y-6">
                <div className="flex justify-between items-center bg-white p-2 md:p-3 rounded-2xl md:rounded-3xl border-2 shadow-sm">
                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                        <input placeholder="ค้นหางาน..." className="w-full pl-10 pr-4 py-2.5 md:py-3 bg-slate-50 rounded-xl md:rounded-2xl font-bold outline-none text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    </div>
                    <button onClick={() => setIsTableZoomed(!isTableZoomed)} className="ml-3 p-2.5 bg-white border-2 rounded-xl md:rounded-2xl hover:bg-slate-900 hover:text-white transition-all">
                        {isTableZoomed ? <Minimize size={20} /> : <Maximize size={20} />}
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-3 md:gap-6">
                    {filteredWork.map(item => {
                        const roles = item.worker_role?.split(", ") || [];
                        const workBaseColor = deptColorMap[roles[0]] || '#585858';
                        const isOverdue = new Date(`${item.work_date}T${item.work_time}`) < new Date() && item.status === 'pending';
                        const isInProgress = item.status === 'inprogress';
                        const isComplete = item.status === 'complete';
                        const workerList = item.worker ? item.worker.split(", ") : [];
                        const multiDay = isMultiDay(item);
                        const durationDays = getDurationDays(item);

                        return (
                            <div key={item.id} className={`relative bg-white rounded-[1.5rem] md:rounded-[2.5rem] shadow-sm border-2 border-slate-50 overflow-hidden flex flex-col md:flex-row items-stretch transition-all hover:shadow-md ${isComplete ? 'opacity-70 grayscale-[0.5]' : ''}`}>
                                <div className="absolute left-0 top-0 bottom-0 w-2 z-10" style={{
                                    background: roles.length > 1
                                        ? `linear-gradient(to bottom, ${roles.map(r => deptColorMap[r] || '#94a3b8').join(", ")})`
                                        : (deptColorMap[roles[0]] || '#585858')
                                }} />

                                <div className="bg-slate-50/50 w-full md:w-44 px-5 py-3 md:p-6 flex flex-row md:flex-col items-center justify-between md:justify-center border-b-2 md:border-b-0 md:border-r-2 border-slate-50 pl-5">
                                    {multiDay ? (
                                        <div className="flex flex-col gap-0.5">
                                            <div className="flex items-center gap-1 text-sm md:text-base font-black text-slate-800">
                                                <CalendarRange size={16} className="text-slate-400" />
                                                {formatDisplayDate(item.work_date)}
                                            </div>
                                            <div className="text-xs text-slate-400 font-bold ml-4"> ถึง {formatDisplayDate(item.end_date)}</div>
                                            <div className="mt-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-0.5 rounded-lg w-fit">{durationDays} วัน</div>
                                        </div>
                                    ) : (
                                        <div className="text-base md:text-2xl font-black text-slate-800">{formatDisplayDate(item.work_date)}</div>
                                    )}
                                    <div className="font-black text-sm md:text-xl text-slate-800 flex items-center gap-1.5 md:mt-3">
                                        <Clock size={16} /> {item.work_time} น.
                                    </div>
                                </div>

                                <div className={`flex-grow px-4 py-3 md:p-8 flex flex-col justify-center cursor-pointer transition-colors ${isOverdue ? 'glow-overdue' : isInProgress ? 'glow-inprogress' : ''}`}
                                    onClick={() => { setSelectedWork(item); setShowWorkModal(true); }}>
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                        <span className="text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest" style={{ backgroundColor: isComplete ? '#94a3b8' : isOverdue ? '#ef4444' : isInProgress ? '#f59e0b' : workBaseColor }}>
                                            {isOverdue ? 'OVERDUE' : item.status?.toUpperCase() || 'WAITING'}
                                        </span>
                                        <span className="text-sm font-black text-indigo-600 flex items-center gap-1.5 bg-indigo-50 px-3 py-1 rounded-xl">
                                            <MapPin size={14} /> {item.department}
                                        </span>
                                    </div>
                                    <h3 className="text-lg md:text-3xl font-black text-slate-800 leading-tight">{item.detail}</h3>
                                </div>

                                <div className="w-full md:w-60 px-4 py-3 md:p-6 flex flex-row md:flex-col items-center justify-between md:justify-center border-t-2 md:border-t-0 md:border-l-2 border-slate-50 bg-slate-50/30">
                                    <div className="flex items-center gap-2">
                                        <div className="flex -space-x-3 hover:space-x-0.5 transition-all duration-300">
                                            {workerList.length > 0 ? workerList.map((workerName, index) => {
                                                const empId = (item.employee_ids ?? [])[index];
                                                const emp = empId ? masterEmployees.find(e => e.id === empId) : masterEmployees.find(e => e.name === workerName);
                                                const empBorderColor = deptColorMap[emp?.departments?.name || ""] || workBaseColor;
                                                return (
                                                    <div key={index} className="w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-white overflow-hidden border-4 shadow-md transition-transform hover:-translate-y-1 relative" style={{ borderColor: empBorderColor, zIndex: 10 - index }}>
                                                        <img src={emp?.image_url || getAvatarUrl(workerName)} className="w-full h-full object-cover" alt={workerName} />
                                                    </div>
                                                );
                                            }) : <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center border-4 border-slate-200 text-slate-300"><User size={22} /></div>}
                                        </div>
                                        <div className="md:hidden"><p className="text-sm font-black text-slate-800 leading-tight">{item.worker || "รอมอบหมาย"}</p></div>
                                    </div>
                                    <div className="hidden md:block text-center mt-3">
                                        <p className="text-base font-black text-slate-800 leading-tight">{item.worker || "รอมอบหมาย"}</p>
                                        <div className="mt-1.5 flex justify-center flex-wrap gap-1">
                                            {roles.map(r => <span key={r} className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase" style={{ backgroundColor: `${deptColorMap[r]}20`, color: deptColorMap[r] }}>{r}</span>)}
                                        </div>
                                    </div>
                                </div>

                                {isAdmin && (
                                    <div className="p-3 md:p-4 flex flex-row md:flex-col items-center justify-end md:justify-center gap-2 border-t-2 md:border-t-0 md:border-l-2 border-slate-50 bg-white">
                                        <button onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingId(item.id);
                                            const workerNames = item.worker ? item.worker.split(", ") : [];
                                            const workerIds = workerNames.map(name => masterEmployees.find(e => e.name === name)?.id || '').filter(Boolean);
                                            setFormData({ ...initialFormState, work_date: item.work_date, end_date: item.end_date || item.work_date, work_time: item.work_time, department: item.department, detail: item.detail, worker_role: item.worker_role.split(", "), selected_workers: workerNames, selected_worker_ids: workerIds });
                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                        }} className="w-10 h-10 md:w-14 md:h-14 flex items-center justify-center bg-white rounded-xl md:rounded-2xl shadow-sm border-2 border-slate-100 text-orange-500 hover:bg-orange-500 hover:text-white transition-all">
                                            <Pencil size={18} />
                                        </button>
                                        <button onClick={async (e) => {
                                            e.stopPropagation();
                                            if (confirm('ลบงานนี้?')) {
                                                await supabase.from("work_schedule").delete().eq("id", item.id);
                                                if (user) refreshData(user.role, user.employeeId ?? null);
                                            }
                                        }} className="w-10 h-10 md:w-14 md:h-14 flex items-center justify-center bg-red-50 rounded-xl md:rounded-2xl shadow-sm border-2 border-red-100 text-red-500 hover:bg-red-500 hover:text-white transition-all">
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* ── Work Detail Modal ───────────────────────────────────────────── */}
            {showWorkModal && selectedWork && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setShowWorkModal(false)}>
                    {/* ── FIXED: max-h + flex-col so inner content scrolls ── */}
                    <div
                        className="bg-white rounded-t-[2rem] md:rounded-[2.5rem] w-full md:max-w-lg shadow-2xl relative overflow-hidden flex flex-col max-h-[90dvh]"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Sticky top bar */}
                        <div className="shrink-0">
                            <div className="h-2.5 w-full" style={{
                                background: (selectedWork.worker_role?.split(", ").length ?? 0) > 1
                                    ? `linear-gradient(to right, ${selectedWork.worker_role?.split(", ").map(r => deptColorMap[r] || '#94a3b8').join(", ")})`
                                    : (deptColorMap[selectedWork.worker_role?.split(", ")[0] || ""] || '#94a3b8')
                            }} />
                            <div className="flex justify-center pt-2 md:hidden"><div className="w-10 h-1 bg-slate-200 rounded-full" /></div>
                        </div>

                        {/* Scrollable content */}
                        <div className="overflow-y-auto p-5 md:p-10">
                            <div className="flex justify-between items-start mb-5 md:mb-8">
                                <div className="flex flex-col gap-2">
                                    <h3 className="text-lg md:text-2xl font-black text-slate-800 leading-tight">รายละเอียดงาน</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedWork.worker_role
                                            ? selectedWork.worker_role.split(", ").map(role => <span key={role} className="px-3 py-1 rounded-lg text-[10px] font-black uppercase text-white shadow-sm" style={{ backgroundColor: deptColorMap[role] || '#94a3b8' }}>{role}</span>)
                                            : <span className="px-3 py-1 rounded-lg text-[10px] font-black uppercase text-slate-400 bg-slate-100">ไม่ระบุแผนก</span>}
                                    </div>
                                </div>
                                <button onClick={() => setShowWorkModal(false)} className="p-2.5 bg-slate-50 rounded-xl md:rounded-2xl text-slate-400 hover:bg-slate-100 transition-colors"><X size={18} /></button>
                            </div>

                            <div className="space-y-3 md:space-y-4">
                                <div className="grid grid-cols-2 gap-3 md:gap-4 text-sm font-bold">
                                    <div className="p-4 bg-slate-50 rounded-xl md:rounded-2xl border border-slate-100">
                                        <p className="text-[10px] text-slate-400 uppercase mb-1.5 font-black tracking-wider">สถานที่</p>
                                        <div className="flex items-center gap-2 text-slate-700"><MapPin size={15} className="text-blue-500 shrink-0" /><span className="truncate">{selectedWork.department || "ไม่ระบุ"}</span></div>
                                    </div>
                                    <div className="p-4 bg-slate-50 rounded-xl md:rounded-2xl border border-slate-100">
                                        <p className="text-[10px] text-slate-400 uppercase mb-1.5 font-black tracking-wider">เวลานัดหมาย</p>
                                        <div className="flex items-center gap-2 text-slate-700"><Clock size={15} className="text-blue-500" />{selectedWork.work_time} น.</div>
                                    </div>
                                </div>

                                <div className={`grid gap-3 text-sm font-bold ${isMultiDay(selectedWork) ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                    <div className="p-4 bg-slate-50 rounded-xl md:rounded-2xl border border-slate-100">
                                        <p className="text-[10px] text-slate-400 uppercase mb-1.5 font-black tracking-wider">วันที่เริ่ม</p>
                                        <div className="flex items-center gap-2 text-slate-700">
                                            <CalendarRange size={15} className="text-blue-500 shrink-0" />
                                            <span>{formatDisplayDate(selectedWork.work_date)}</span>
                                        </div>
                                    </div>
                                    {isMultiDay(selectedWork) && (
                                        <div className="p-4 bg-emerald-50 rounded-xl md:rounded-2xl border border-emerald-100">
                                            <p className="text-[10px] text-emerald-500 uppercase mb-1.5 font-black tracking-wider">วันที่จบ · {getDurationDays(selectedWork)} วัน</p>
                                            <div className="flex items-center gap-2 text-emerald-700">
                                                <CalendarRange size={15} className="text-emerald-500 shrink-0" />
                                                <span>{formatDisplayDate(selectedWork.end_date)}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-wider ml-2">ทีมช่างที่ปฏิบัติงาน</p>
                                    <div className="grid grid-cols-1 gap-2">
                                        {selectedWork.worker ? selectedWork.worker.split(", ").map((workerName, idx) => {
                                            const empId = (selectedWork.employee_ids ?? [])[idx];
                                            const emp = empId ? masterEmployees.find(e => e.id === empId) : masterEmployees.find(e => e.name === workerName);
                                            const empDept = emp?.departments?.name || "";
                                            const empColor = deptColorMap[empDept] || '#64748b';
                                            return (
                                                <div key={idx} className="flex items-center justify-between p-2.5 md:p-3 rounded-xl md:rounded-2xl border-2" style={{ borderColor: `${empColor}20`, backgroundColor: `${empColor}05` }}>
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-10 h-10 rounded-xl border-4 overflow-hidden shadow-sm" style={{ borderColor: empColor }}>
                                                            <img src={emp?.image_url || getAvatarUrl(workerName)} className="w-full h-full object-cover" />
                                                        </div>
                                                        <div>
                                                            <p className="font-black text-slate-800 text-sm">{workerName}</p>
                                                            <p className="text-[10px] font-bold opacity-60 uppercase" style={{ color: empColor }}>{empDept || "ไม่ระบุแผนก"}</p>
                                                        </div>
                                                    </div>
                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: empColor }} />
                                                </div>
                                            );
                                        }) : <div className="p-4 bg-slate-50 rounded-xl md:rounded-2xl border-2 border-dashed border-slate-200 text-center text-slate-400 font-bold text-sm">ยังไม่มีการมอบหมายช่าง</div>}
                                    </div>
                                </div>

                                <div className="p-5 md:p-8 rounded-[1.5rem] md:rounded-[2rem] bg-slate-900 text-white font-bold shadow-xl shadow-slate-200">
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

                            <div className="flex gap-3 mt-6 md:mt-10">
                                {selectedWork.status === 'pending' && (
                                    <button
                                        onClick={() => handleStatusAction(selectedWork.id, 'inprogress', selectedWork.detail)}
                                        className="flex-[2] py-3.5 md:py-4 bg-blue-600 rounded-xl md:rounded-2xl text-white font-black text-sm shadow-lg hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Camera size={16} /> เริ่มดำเนินงาน
                                    </button>
                                )}
                                {selectedWork.status === 'inprogress' && (
                                    <button
                                        onClick={() => handleStatusAction(selectedWork.id, 'complete', selectedWork.detail)}
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
            )}
            {photoModal && (
                <PhotoUploadModal
                    mode={photoModal.mode}
                    jobDetail={photoModal.detail}
                    onConfirm={handlePhotoConfirm}
                    onCancel={() => setPhotoModal(null)}
                />
            )}
        </main>
    );
}