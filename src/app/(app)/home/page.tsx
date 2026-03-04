"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
    Search, X, Clock, Briefcase,
    Pencil, Trash2, Maximize, Minimize, Users, Loader2, CheckCircle2,
    Save, Settings, User, PlusCircle, CircleDollarSign, MapPin, Undo2,
    PlusIcon
} from 'lucide-react';
import Link from "next/link";

interface Department { id: string; name: string; color_code: string; }


interface Employee { 
    id: string; 
    name: string; 
    staff_id: string | null; 
    image_url: string | null; 
    departments: Department | null;
}

interface WorkScheduleItem {
    id: string; work_date: string; end_date: string | null; work_time: string;
    work_shift: string; department: string; detail: string; worker_role: string;
    worker: string; user_id: string | null; status: 'pending' | 'inprogress' | 'complete' | null;
}

interface WorkForm {
    work_date: string;
    end_date: string;
    work_time: string;
    department: string;
    detail: string;
    worker_role: string;
    current_worker_input: string;
    selected_workers: string[];
}

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

export default function HomePage() {
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);

    const [user, setUser] = useState<{ id: string; role: string } | null>(null);
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

    const initialFormState: WorkForm = {
        work_date: new Date().toISOString().split('T')[0],
        end_date: '', work_time: '08:30', department: '', detail: '',
        worker_role: '', current_worker_input: '', selected_workers: []
    };
    const [formData, setFormData] = useState<WorkForm>(initialFormState);

    const isAdmin = user?.role === 'admin';

    const deptColorMap = useMemo(() => {
        return departments.reduce((acc, curr) => {
            acc[curr.name] = curr.color_code;
            return acc;
        }, {} as Record<string, string>);
    }, [departments]);

    const refreshData = useCallback(async () => {
        try {
            const { data: schedule } = await supabase.from("work_schedule").select("*");
            const { data: emps } = await supabase.from("employees").select("*, departments(*)");
            const { data: depts } = await supabase.from("departments").select("*");

            const sorted = (schedule as WorkScheduleItem[] || []).sort((a, b) =>
                `${a.work_date}T${a.work_time}`.localeCompare(`${b.work_date}T${b.work_time}`)
            );

            setAllWorkData(sorted);
            setMasterEmployees(emps as Employee[] || []);
            setDepartments(depts as Department[] || []);
        } catch (err) { console.error(err); }
    }, [supabase]);

    useEffect(() => {
        async function init() {
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (!authUser) return router.push("/auth/login");
            const { data: profile } = await supabase.from("profiles").select("role").eq("id", authUser.id).single();
            setUser({ id: authUser.id, role: profile?.role || 'user' });
            await refreshData();
            setLoading(false);
        }
        init();
    }, [supabase, router, refreshData]);

    const handleCancelEdit = () => {
        setEditingId(null);
        setFormData(initialFormState);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        const payload = {
            work_date: formData.work_date,
            end_date: formData.end_date || formData.work_date,
            work_time: formData.work_time,
            work_shift: getThaiShift(formData.work_time),
            department: formData.department,
            detail: formData.detail,
            worker_role: formData.worker_role,
            worker: formData.selected_workers.join(", "),
            user_id: user?.id
        };
        const { error } = editingId
            ? await supabase.from("work_schedule").update(payload).eq("id", editingId)
            : await supabase.from("work_schedule").insert([{ ...payload, status: 'pending' }]);

        if (!error) { setFormData(initialFormState); setEditingId(null); refreshData(); }
        setSubmitting(false);
    };

    const filteredWork = useMemo(() => {
        const lower = searchTerm.toLowerCase();
        if (!searchTerm.trim()) {
            return allWorkData.filter(item => item.status !== 'complete');
        }
        return allWorkData.filter(item =>
            ((item.department ?? "") + (item.detail ?? "") + (item.worker ?? "") + (item.worker_role ?? ""))
                .toLowerCase()
                .includes(lower)
        );
    }, [allWorkData, searchTerm]);

    if (loading) return <div className="h-screen flex items-center justify-center font-black text-slate-400 uppercase tracking-widest text-2xl animate-pulse">Loading...</div>;

    return (
        <main className={`transition-all duration-300 ${isTableZoomed ? 'fixed inset-0 bg-slate-50 z-50 p-4 overflow-y-auto' : 'max-w-[1400px] mx-auto p-4 md:p-8'}`}>
            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes status-glow-red { 0%, 100% { background-color: #ffffff; } 50% { background-color: #fef2f2; } }
                @keyframes status-glow-orange { 0%, 100% { background-color: #ffffff; } 50% { background-color: #fffbeb; } }
                .glow-overdue { animation: status-glow-red 2s infinite ease-in-out; }
                .glow-inprogress { animation: status-glow-orange 2.5s infinite ease-in-out; }
            `}} />

            {/* HEADER */}
            <header className={`mb-10 flex flex-col md:flex-row justify-between items-center gap-4 ${isTableZoomed ? 'hidden' : ''}`}>
                <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
                    <div className="p-3 bg-slate-900 rounded-2xl text-white shadow-xl"><Briefcase size={28} /></div>
                    ระบบจัดการตารางงาน
                </h1>
                {isAdmin && (
                    <div className="flex flex-wrap gap-2">
                        <Link href="/employees" className="bg-white border-2 px-5 py-3 rounded-2xl font-black text-slate-600 hover:text-slate-900 transition-all flex items-center gap-2 shadow-sm">
                            <Users size={18} /> พนักงาน
                        </Link>
                        <Link href="/departments" className="bg-white border-2 px-5 py-3 rounded-2xl font-black text-slate-600 hover:text-slate-900 transition-all flex items-center gap-2 shadow-sm">
                            <Settings size={18} /> แผนก
                        </Link>
                        <Link href="/price" className="bg-amber-50 border-2 border-amber-200 px-5 py-3 rounded-2xl font-black text-amber-600 hover:bg-amber-600 hover:text-white transition-all flex items-center gap-2 shadow-sm ml-auto">
                            <CircleDollarSign size={18} /> แก้ไขราคาวัสดุ
                        </Link>
                    </div>
                )}
            </header>

            {/* ADMIN FORM */}
            {isAdmin && !isTableZoomed && (
                <section className={`bg-white rounded-[2.5rem] shadow-xl border-4 p-8 mb-12 transition-all ${editingId ? 'border-orange-500 scale-[1.01]' : 'border-white'}`}>
                    <div className="flex justify-between items-center mb-8">
                        <h2 className="text-xl font-black flex items-center gap-2">
                            {editingId ? <Pencil size={24} className="text-orange-500" /> : <PlusIcon size={24} className="text-emerald-500" />}
                            {editingId ? 'กำลังแก้ไขแผนงาน' : 'สร้างแผนงานใหม่'}
                        </h2>
                        {editingId && (
                            <button onClick={handleCancelEdit} className="text-sm font-black text-red-500 hover:bg-red-50 px-4 py-2 rounded-xl transition-all flex items-center gap-2">
                                <Undo2 size={18} /> ยกเลิกการแก้ไข
                            </button>
                        )}
                    </div>
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-black uppercase opacity-50 ml-2">วันที่เริ่ม</label>
                            <input type="date" required className="p-4 bg-slate-50 border-2 rounded-2xl font-bold outline-none w-full focus:border-slate-900 transition-all" value={formData.work_date} onChange={e => setFormData({ ...formData, work_date: e.target.value })} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-black uppercase opacity-50 ml-2">ถึงวันที่ (ถ้ามี)</label>
                            <input type="date" className="p-4 bg-slate-50 border-2 rounded-2xl font-bold outline-none w-full focus:border-slate-900 transition-all" value={formData.end_date} onChange={e => setFormData({ ...formData, end_date: e.target.value })} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-black uppercase opacity-50 ml-2">เวลานัดหมาย</label>
                            <input type="time" required className="p-4 bg-slate-50 border-2 rounded-2xl font-bold outline-none w-full focus:border-slate-900 transition-all" value={formData.work_time} onChange={e => setFormData({ ...formData, work_time: e.target.value })} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-black uppercase opacity-50 ml-2">ประเภทงาน (แผนกช่าง)</label>
                            <select required className="p-4 bg-slate-50 border-2 rounded-2xl font-bold outline-none w-full focus:border-slate-900 transition-all" value={formData.worker_role} onChange={e => setFormData({ ...formData, worker_role: e.target.value })}>
                                <option value="">เลือกแผนกช่าง...</option>
                                {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-xs font-black uppercase opacity-50 ml-2">สถานที่ / หน่วยงาน</label>
                            <input placeholder="สถานที่ทำงาน..." required className="p-4 bg-slate-50 border-2 rounded-2xl font-bold outline-none w-full mt-2 focus:border-slate-900 transition-all" value={formData.department} onChange={e => setFormData({ ...formData, department: e.target.value })} />
                        </div>
                        <div className="md:col-span-2 relative">
                            <label className="text-xs font-black uppercase opacity-50 ml-2">มอบหมายช่าง</label>
                            <div className="flex flex-wrap gap-2 p-2 bg-slate-50 border-2 rounded-2xl min-h-[60px] mt-2">
                                {formData.selected_workers.map(w => (
                                    <span key={w} className="bg-slate-900 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2">
                                        {w} <X size={14} className="cursor-pointer" onClick={() => setFormData({ ...formData, selected_workers: formData.selected_workers.filter(x => x !== w) })} />
                                    </span>
                                ))}
                                <input placeholder="ค้นหาช่าง..." className="flex-grow bg-transparent p-2 font-bold outline-none" value={formData.current_worker_input} onChange={e => setFormData({ ...formData, current_worker_input: e.target.value })} />
                            </div>
                            {formData.current_worker_input && (
                                <div className="absolute z-[100] w-full bg-white shadow-2xl rounded-3xl mt-2 max-h-48 overflow-auto border-2 border-slate-100">
                                    {masterEmployees.filter(e => e.name.toLowerCase().includes(formData.current_worker_input.toLowerCase())).map(emp => (
                                        <button key={emp.id} type="button" onClick={() => setFormData({ ...formData, selected_workers: [...formData.selected_workers, emp.name], current_worker_input: '' })} className="w-full p-4 text-left font-bold hover:bg-slate-50 border-b">{emp.name}</button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <textarea rows={2} placeholder="รายละเอียดงาน..." required className="md:col-span-4 p-4 bg-slate-50 border-2 rounded-2xl font-bold outline-none w-full mt-2 focus:border-slate-900 transition-all" value={formData.detail} onChange={e => setFormData({ ...formData, detail: e.target.value })} />
                        <button type="submit" disabled={submitting} className={`md:col-span-4 py-5 rounded-[1.5rem] font-black text-xl flex items-center justify-center gap-3 shadow-lg transition-all ${editingId ? 'bg-orange-500 hover:bg-orange-600' : 'bg-slate-900 hover:bg-slate-800'} text-white`}>
                            {submitting ? <Loader2 className="animate-spin" /> : editingId ? <CheckCircle2 /> : <Save />}
                            {editingId ? 'ยืนยันการแก้ไข' : 'บันทึกลงตารางงาน'}
                        </button>
                    </form>
                </section>
            )}

            {/* LIST SECTION */}
            <section className="space-y-6">
                <div className="flex justify-between items-center bg-white p-3 rounded-3xl border-2 shadow-sm">
                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                        <input placeholder="ค้นหางาน..." className="w-full pl-12 pr-4 py-3 bg-slate-50 rounded-2xl font-bold outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    </div>
                    <button onClick={() => setIsTableZoomed(!isTableZoomed)} className="ml-4 p-3 bg-white border-2 rounded-2xl hover:bg-slate-900 hover:text-white transition-all">
                        {isTableZoomed ? <Minimize size={24} /> : <Maximize size={24} />}
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-6">
                    {filteredWork.map(item => {
                        const deptColor = deptColorMap[item.worker_role] || '#ec4899';
                        const isOverdue = new Date(`${item.work_date}T${item.work_time}`) < new Date() && item.status === 'pending';
                        const isInProgress = item.status === 'inprogress';
                        const isComplete = item.status === 'complete';

                        const empMatch = masterEmployees.find(e => item.worker?.includes(e.name));

                        return (
                            <div key={item.id} className={`relative bg-white rounded-[2.5rem] shadow-sm border-2 border-slate-50 overflow-hidden flex flex-col md:flex-row items-stretch transition-all hover:shadow-md ${isComplete ? 'opacity-70 grayscale-[0.5]' : ''}`}>

                                <div className="absolute left-0 top-0 bottom-0 w-2.5 z-10" style={{ backgroundColor: deptColor }} />

                                <div className="bg-slate-50/50 w-full md:w-56 p-6 flex flex-col items-center justify-center border-r-2 border-slate-50">
                                    <div className="text-2xl font-black text-slate-800">{formatDisplayDate(item.work_date)}</div>
                                    <div className="mt-4 px-6 py-2.5 bg-white rounded-2xl border-2 font-black text-lg flex items-center gap-2 shadow-sm" style={{ borderColor: deptColor, color: deptColor }}>
                                        <Clock size={20} /> {item.work_time} น.
                                    </div>
                                </div>

                                <div className={`flex-grow p-8 flex flex-col justify-center cursor-pointer transition-colors ${isOverdue ? 'glow-overdue' : isInProgress ? 'glow-inprogress' : ''}`}
                                    onClick={() => { setSelectedWork(item); setShowWorkModal(true); }}>
                                    <div className="flex flex-wrap items-center gap-4 mb-3">
                                        <span className="text-white text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest" style={{ backgroundColor: isComplete ? '#94a3b8' : isOverdue ? '#ef4444' : isInProgress ? '#f59e0b' : deptColor }}>
                                            {isOverdue ? 'OVERDUE' : item.status?.toUpperCase() || 'WAITING'}
                                        </span>
                                        <span className="text-lg font-black text-indigo-600 flex items-center gap-2 bg-indigo-50 px-4 py-1 rounded-xl">
                                            <MapPin size={20} /> {item.department}
                                        </span>
                                    </div>
                                    <h3 className="text-3xl font-black text-slate-800 leading-tight">{item.detail}</h3>
                                </div>

                                <div className="w-full md:w-72 p-6 flex flex-col items-center justify-center border-l-2 border-slate-50 bg-slate-50/30">
                                    <div className="flex flex-col items-center text-center gap-3">
                                        <div
                                            className="w-16 h-16 rounded-2xl bg-white overflow-hidden border-4 shadow-md transition-all"
                                            style={{ borderColor: deptColor }}
                                        >
                                            {empMatch?.image_url ? (
                                                <img src={empMatch.image_url} className="w-full h-full object-cover" alt="worker" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-white" style={{ color: deptColor }}><User size={32} /></div>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-lg font-black text-slate-800 leading-tight">{item.worker || "รอมอบหมาย"}</p>
                                            <div className="mt-2 flex justify-center">
                                                <span
                                                    className="px-3 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider"
                                                    style={{
                                                        backgroundColor: `${deptColor}15`,
                                                        color: deptColor,
                                                        border: `1px solid ${deptColor}30`
                                                    }}
                                                >
                                                    {item.worker_role}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {isAdmin && (
                                    <div className="p-4 flex md:flex-col items-center justify-center gap-3 border-l-2 border-slate-50 bg-white">
                                        <button onClick={(e) => { e.stopPropagation(); setEditingId(item.id); setFormData({ ...initialFormState, work_date: item.work_date, end_date: item.end_date || '', work_time: item.work_time, department: item.department, detail: item.detail, worker_role: item.worker_role, selected_workers: item.worker ? item.worker.split(", ") : [] }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="w-14 h-14 flex items-center justify-center bg-white rounded-2xl shadow-sm border-2 border-slate-100 text-orange-500 hover:bg-orange-500 hover:text-white transition-all">
                                            <Pencil size={24} />
                                        </button>
                                        <button onClick={async (e) => { e.stopPropagation(); if (confirm('ลบงานนี้?')) { await supabase.from("work_schedule").delete().eq("id", item.id); refreshData(); } }} className="w-14 h-14 flex items-center justify-center bg-red-50 rounded-2xl shadow-sm border-2 border-red-100 text-red-500 hover:bg-red-500 hover:text-white transition-all">
                                            <Trash2 size={24} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* MODAL STATUS */}
            {showWorkModal && selectedWork && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4" onClick={() => setShowWorkModal(false)}>
                    <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl p-8 md:p-10 relative overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="absolute top-0 left-0 w-full h-2" style={{ backgroundColor: deptColorMap[selectedWork.worker_role] || '#94a3b8' }}></div>
                        <div className="flex justify-between items-start mb-8">
                            <div className="flex flex-col">
                                <h3 className="text-2xl font-black text-slate-800 leading-tight">{selectedWork.worker || "ยังไม่ได้ระบุช่าง"}</h3>
                                <p className="text-sm font-bold mt-1 uppercase tracking-widest" style={{ color: deptColorMap[selectedWork.worker_role] || '#94a3b8' }}>{selectedWork.worker_role}</p>
                            </div>
                            <button onClick={() => setShowWorkModal(false)} className="p-3 bg-slate-50 rounded-2xl text-slate-400 hover:bg-slate-100 transition-colors"><X size={20} /></button>
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm font-bold">
                                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                                    <p className="text-[10px] text-slate-400 uppercase mb-2 font-black tracking-wider">สถานที่ / หน่วยงาน</p>
                                    <div className="flex items-center gap-2 text-slate-700"><MapPin size={16} className="text-blue-500" />{selectedWork.department}</div>
                                </div>
                                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                                    <p className="text-[10px] text-slate-400 uppercase mb-2 font-black tracking-wider">เวลานัดหมาย</p>
                                    <div className="flex items-center gap-2 text-slate-700"><Clock size={16} className="text-blue-500" />{selectedWork.work_time} น.</div>
                                </div>
                            </div>
                            <div className="p-8 rounded-[2rem] text-white font-bold shadow-xl shadow-slate-200 transition-all" style={{ backgroundColor: deptColorMap[selectedWork.worker_role] || '#64748b' }}>
                                <p className="text-[10px] opacity-80 uppercase mb-3 font-black tracking-widest">รายละเอียดภารกิจ</p>
                                <p className="text-lg leading-relaxed">{selectedWork.detail}</p>
                            </div>
                        </div>

                        <div className="flex gap-4 mt-10">
                            {selectedWork.status === 'pending' && (
                                <button
                                    onClick={async () => {
                                        await supabase.from("work_schedule").update({ status: 'inprogress' }).eq("id", selectedWork.id);
                                        refreshData();
                                        setShowWorkModal(false);
                                    }}
                                    className="flex-[2] py-4 rounded-2xl text-white font-black text-sm shadow-lg hover:brightness-110 active:scale-95 transition-all"
                                    style={{ backgroundColor: deptColorMap[selectedWork.worker_role] || '#64748b' }}
                                >
                                    เริ่มดำเนินงาน
                                </button>
                            )}
                            {selectedWork.status === 'inprogress' && (
                                <button
                                    onClick={async () => {
                                        await supabase.from("work_schedule").update({ status: 'complete', completed_at: new Date().toISOString() }).eq("id", selectedWork.id);
                                        refreshData();
                                        setShowWorkModal(false);
                                    }}
                                    className="flex-[2] bg-emerald-600 py-4 rounded-2xl text-white font-black text-sm shadow-lg hover:bg-emerald-700 active:scale-95 transition-all"
                                >
                                    เสร็จสิ้นภารกิจ
                                </button>
                            )}
                            <button onClick={() => setShowWorkModal(false)} className="flex-1 py-4 bg-slate-100 rounded-2xl font-black text-sm text-slate-500 hover:bg-slate-200 transition-colors active:scale-95">ย้อนกลับ</button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}