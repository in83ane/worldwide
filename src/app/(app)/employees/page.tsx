"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
    Users, ArrowLeft, Camera, Loader2, Plus, Edit3, Save, Search, UserX, RotateCcw, Mail, Lock
} from "lucide-react";
import Link from "next/link";

// --- Interfaces ---
interface Department { 
    id: string; 
    name: string; 
    color_code: string; 
}

interface Employee {
    id: string;
    staff_id: string;
    name: string;
    image_url: string | null;
    department_id: string | null;
    departments: Department | null;
    is_active: boolean;
    user_id?: string | null;
}

// โครงสร้างสำหรับข้อมูลที่จะส่งไป Insert/Update ใน Database
interface EmployeePayload {
    name: string;
    department_id: string;
    image_url: string | null;
    is_active: boolean;
    user_id?: string | null;
    staff_id?: string;
}

export default function EmployeesPage() {
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [employees, setEmployees] = useState<Employee[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState<boolean>(true);
    const [uploading, setUploading] = useState<boolean>(false);

    const [formData, setFormData] = useState({ 
        name: "", 
        staff_id: "", 
        department_id: "",
        email: "",
        password: "" 
    });
    
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState<boolean>(false);
    const [editId, setEditId] = useState<string | null>(null);

    const getAvatarUrl = (name: string) => {
        const displayName = name?.trim() || "Staff";
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random&color=fff&size=200&font-size=0.35`;
    };

    const getNextStaffId = useCallback(async () => {
        const { data } = await supabase
            .from("employees")
            .select("staff_id")
            .order("staff_id", { ascending: false })
            .limit(1);

        if (data && data.length > 0) {
            const lastId = parseInt(data[0].staff_id);
            return isNaN(lastId) ? "1" : (lastId + 1).toString();
        }
        return "1";
    }, [supabase]);

    const resetForm = useCallback(async () => {
        setIsEditing(false);
        setEditId(null);
        setPreviewUrl(null);
        setFile(null);
        const nextId = await getNextStaffId();
        setFormData({ name: "", staff_id: nextId, department_id: "", email: "", password: "" });
    }, [getNextStaffId]);

    const refreshData = useCallback(async () => {
        try {
            const { data: empData } = await supabase
                .from("employees")
                .select("*, departments(*)")
                .eq("is_active", true)
                .order("created_at", { ascending: false });
            
            const { data: deptData } = await supabase.from("departments").select("*").order("name");

            if (empData) setEmployees(empData as unknown as Employee[]);
            if (deptData) setDepartments(deptData as Department[]);

            if (!isEditing) {
                const nextId = await getNextStaffId();
                setFormData(prev => ({ ...prev, staff_id: nextId }));
            }
        } catch (err) { 
            console.error("Refresh Error:", err); 
        }
    }, [supabase, isEditing, getNextStaffId]);

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            await refreshData();
            setLoading(false);
        };
        init();
    }, [refreshData]);

    const filteredEmployees = useMemo(() => {
        return employees.filter(emp => {
            const s = searchQuery.toLowerCase();
            return (emp.name?.toLowerCase().includes(s) ?? false) || (emp.staff_id?.toString().includes(searchQuery) ?? false);
        });
    }, [employees, searchQuery]);

    const handleDisable = async (emp: Employee) => {
        if(confirm(`ย้ายคุณ ${emp.name} ไปที่หน้าพนักงานที่ออกแล้ว?`)) {
            const { error } = await supabase.from("employees").update({ is_active: false }).eq("id", emp.id);
            if (!error) {
                setEmployees(prev => prev.filter(e => e.id !== emp.id));
                const nextId = await getNextStaffId();
                setFormData(prev => ({ ...prev, staff_id: nextId }));
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setUploading(true);
        try {
            let finalImageUrl = previewUrl;
            if (file) {
                const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '_')}`;
                const { error: uploadError } = await supabase.storage.from('employee-photos').upload(`avatars/${fileName}`, file);
                if (uploadError) throw uploadError;
                finalImageUrl = supabase.storage.from('employee-photos').getPublicUrl(`avatars/${fileName}`).data.publicUrl;
            }

            let userIdForEmployee: string | null = null;

            // --- ส่วนที่แก้ไข: เรียก API Route แทนการใช้ signUp โดยตรง ---
            if (!isEditing && formData.email && formData.password) {
                const res = await fetch('/employees/api', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: formData.email,
                        password: formData.password,
                        name: formData.name
                    })
                });

                const authRes = await res.json();
                if (authRes.error) throw new Error(authRes.error);
                
                userIdForEmployee = authRes.user.id;
                
                // อัปเดตข้อมูลเบื้องต้นในตาราง profiles (ที่ปกติจะถูกสร้างโดย Trigger)
                await supabase.from("profiles").update({ email: formData.email }).eq("id", userIdForEmployee);
            }

            const payload: EmployeePayload = {
                name: formData.name.trim(),
                department_id: formData.department_id,
                image_url: finalImageUrl,
                is_active: true,
                user_id: userIdForEmployee
            };

            if (isEditing && editId) {
                const { error: updateError } = await supabase.from("employees").update(payload).eq("id", editId);
                if (updateError) throw updateError;
            } else {
                const { error: insertError } = await supabase.from("employees").insert([{ 
                    ...payload, 
                    staff_id: formData.staff_id 
                }]);
                if (insertError) throw insertError;
            }
            
            alert(isEditing ? "อัปเดตข้อมูลสำเร็จ" : "เพิ่มพนักงานและสร้างบัญชีสำเร็จ");
            await resetForm();
            await refreshData();
        } catch (err: unknown) { 
            const error = err as Error;
            alert(error.message); 
        } finally { 
            setUploading(false); 
        }
    };

    if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-slate-300" size={40} /></div>;

    return (
        <main className="max-w-7xl mx-auto p-4 md:p-8 min-h-screen bg-slate-50/30">
            <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-slate-900 rounded-2xl text-white shadow-xl"><Users size={24} /></div>
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Staff Management</h1>
                        <p className="text-slate-400 font-bold text-sm">จัดการพนักงานและบัญชีเข้าใช้งาน</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/employees/disabled" className="bg-white border-2 border-slate-200 px-4 py-2.5 rounded-xl font-bold text-slate-600 hover:text-slate-900 flex items-center gap-2 transition-all shadow-sm">
                        <UserX size={18} className="text-slate-900" /> พนักงานที่ออกแล้ว
                    </Link>
                    <button onClick={() => router.push("/")} className="text-slate-400 hover:text-slate-900 font-bold text-sm flex items-center gap-2 ml-4 px-2 transition-colors">
                        <ArrowLeft size={18} /> กลับไปหน้าหลัก
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <section className="lg:col-span-4">
                    <form onSubmit={handleSubmit} className={`bg-white p-8 rounded-[2.5rem] border-4 shadow-2xl transition-all ${isEditing ? 'border-orange-500 scale-[1.01]' : 'border-white'}`}>
                        <div className="flex flex-col items-center mb-8">
                            <div className="relative" onClick={() => fileInputRef.current?.click()}>
                                <div className="w-32 h-32 bg-slate-100 rounded-[2rem] overflow-hidden border-4 border-white cursor-pointer hover:border-slate-900 transition-all flex items-center justify-center shadow-inner">
                                    <img src={file ? URL.createObjectURL(file) : (previewUrl || getAvatarUrl(formData.name))} className="w-full h-full object-cover" alt="profile" />
                                    <div className="absolute inset-0 bg-black/10 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity"><Camera className="text-white" size={24} /></div>
                                </div>
                                <div className="absolute -top-2 -right-2 bg-slate-900 text-white px-3 py-1 rounded-lg font-black shadow-lg border-2 border-white text-[10px]">ID: {formData.staff_id}</div>
                            </div>
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-400 ml-2">ข้อมูลส่วนตัว</label>
                                <input type="text" placeholder="ชื่อ-นามสกุล..." className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-slate-900 rounded-2xl font-bold outline-none" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                                <select className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-slate-900 rounded-2xl font-bold outline-none" value={formData.department_id} onChange={(e) => setFormData({ ...formData, department_id: e.target.value })} required>
                                    <option value="">เลือกแผนก...</option>
                                    {departments.map(dept => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
                                </select>
                            </div>

                            {!isEditing && (
                                <div className="space-y-2 pt-2 border-t-2 border-slate-50">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-2">บัญชี Login (User Role)</label>
                                    <div className="relative">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                                        <input type="email" placeholder="Email" className="w-full pl-12 p-4 bg-slate-50 border-2 border-transparent focus:border-slate-900 rounded-2xl font-bold outline-none" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required={!isEditing} />
                                    </div>
                                    <div className="relative">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                                        <input type="password" placeholder="Password (6+ ตัวอักษร)" className="w-full pl-12 p-4 bg-slate-50 border-2 border-transparent focus:border-slate-900 rounded-2xl font-bold outline-none" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} required={!isEditing} minLength={6} />
                                    </div>
                                </div>
                            )}
                            
                            <div className="flex gap-2 pt-4">
                                <button type="submit" disabled={uploading} className={`flex-grow py-4 text-white rounded-[1.5rem] font-black shadow-xl flex items-center justify-center gap-2 transition-all ${isEditing ? 'bg-orange-500 hover:bg-orange-600' : 'bg-slate-900 hover:bg-slate-800'}`}>
                                    {uploading ? <Loader2 className="animate-spin" size={20} /> : (isEditing ? <Save size={20} /> : <Plus size={20} />)}
                                    {isEditing ? "อัปเดตข้อมูล" : "เพิ่มพนักงานและบัญชี"}
                                </button>
                                {isEditing && (
                                    <button type="button" onClick={resetForm} className="px-5 py-4 bg-slate-100 text-slate-500 rounded-[1.5rem] font-black hover:bg-slate-200 transition-all flex items-center justify-center gap-2"><RotateCcw size={18} /></button>
                                )}
                            </div>
                        </div>
                    </form>
                </section>

                <section className="lg:col-span-8">
                    <div className="bg-white rounded-[2.5rem] border-4 border-white shadow-xl overflow-hidden min-h-[500px]">
                        <div className="p-6 border-b border-slate-50 bg-slate-50/30 flex justify-between items-center gap-4">
                            <h3 className="text-lg font-black text-slate-900">พนักงานปัจจุบัน ({filteredEmployees.length})</h3>
                            <div className="relative w-64">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input type="text" placeholder="ค้นหา..." className="w-full pl-11 pr-4 py-2 bg-white border-2 border-slate-100 rounded-2xl font-bold text-sm focus:border-slate-900 outline-none" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
                            {filteredEmployees.map((emp) => (
                                <div key={emp.id} className={`group p-4 rounded-[2rem] border-2 bg-white flex items-center gap-4 transition-all ${editId === emp.id ? 'border-orange-200 bg-orange-50/30 shadow-inner' : 'border-slate-50 hover:shadow-xl'}`}>
                                    <div className="w-16 h-16 rounded-2xl overflow-hidden border-4 border-white shadow-md flex-shrink-0">
                                        <img src={emp.image_url || getAvatarUrl(emp.name)} className="w-full h-full object-cover" alt="" />
                                    </div>
                                    <div className="flex-grow min-w-0">
                                        <div className="font-black text-slate-900 truncate">{emp.name}</div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[9px] font-black px-2 py-0.5 rounded bg-slate-100 text-slate-400">#{emp.staff_id}</span>
                                            <span className="text-[9px] font-black px-2 py-0.5 rounded text-white" style={{ backgroundColor: emp.departments?.color_code || '#000' }}>{emp.departments?.name || 'ทั่วไป'}</span>
                                            {emp.user_id && <span className="text-[9px] font-black px-2 py-0.5 rounded bg-emerald-100 text-emerald-600">มีบัญชีผู้ใช้</span>}
                                        </div>
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => { setIsEditing(true); setEditId(emp.id); setFormData({ name: emp.name, staff_id: emp.staff_id, department_id: emp.department_id || "", email: "", password: "" }); setPreviewUrl(emp.image_url); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="p-2 text-slate-300 hover:text-orange-500"><Edit3 size={16} /></button>
                                        <button onClick={() => handleDisable(emp)} className="p-2 text-slate-300 hover:text-rose-500"><UserX size={16} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}