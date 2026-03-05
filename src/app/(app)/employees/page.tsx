"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
    Trash2, Users, ArrowLeft,
    Camera, Loader2, Plus, Edit3, Save, Search, X
} from "lucide-react";

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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [isAdmin, setIsAdmin] = useState<boolean>(false);

    const [formData, setFormData] = useState({ name: "", staff_id: "", department_id: "" });
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState<boolean>(false);
    const [editId, setEditId] = useState<string | null>(null);

    const getAvatarUrl = (name: string) => {
        const displayName = name?.trim() || "Staff";
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random&color=fff&size=200&font-size=0.35`;
    };

    const refreshData = useCallback(async () => {
        try {
            const { data: empData } = await supabase
                .from("employees")
                .select("*, departments(*)")
                .order("created_at", { ascending: false });
            
            const { data: deptData } = await supabase
                .from("departments")
                .select("*")
                .order("name");

            if (empData) setEmployees(empData as unknown as Employee[]);
            if (deptData) setDepartments(deptData as Department[]);

            if (!isEditing) {
                const { data: lastEmp } = await supabase
                    .from("employees")
                    .select("staff_id")
                    .order("created_at", { ascending: false })
                    .limit(1);
                
                const nextId = lastEmp?.[0]?.staff_id ? (parseInt(lastEmp[0].staff_id) + 1).toString() : "1";
                setFormData(prev => ({ ...prev, staff_id: nextId }));
            }
        } catch (err) { 
            console.error("Fetch Error:", err); 
        }
    }, [supabase, isEditing]);

    useEffect(() => {
        async function checkPermission() {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return router.push("/auth/login");
            
            const { data: profile } = await supabase
                .from("profiles")
                .select("role")
                .eq("id", user.id)
                .single();

            if (profile?.role !== 'admin') { 
                setIsAdmin(false); 
                setLoading(false); 
                return; 
            }
            
            setIsAdmin(true);
            await refreshData();
            setLoading(false);
        }
        checkPermission();
    }, [supabase, router, refreshData]);

    const filteredEmployees = useMemo(() => {
        return employees.filter(emp => {
            const s = searchQuery.toLowerCase();
            return (emp.name?.toLowerCase().includes(s) ?? false) || (emp.staff_id?.toString().includes(searchQuery) ?? false);
        });
    }, [employees, searchQuery]);

    const handleEdit = (emp: Employee) => {
        setIsEditing(true);
        setEditId(emp.id);
        setFormData({ name: emp.name || "", staff_id: emp.staff_id || "", department_id: emp.department_id || "" });
        setPreviewUrl(emp.image_url); 
        setFile(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const getDisplayPreview = () => {
        if (file) return URL.createObjectURL(file);
        if (previewUrl) return previewUrl;
        return getAvatarUrl(formData.name);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setUploading(true);
        try {
            let finalImageUrl = previewUrl;
            if (file) {
                const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '_')}`;
                const { error: uploadError } = await supabase.storage
                    .from('employee-photos')
                    .upload(`avatars/${fileName}`, file);
                
                if (uploadError) throw uploadError;
                
                finalImageUrl = supabase.storage
                    .from('employee-photos')
                    .getPublicUrl(`avatars/${fileName}`).data.publicUrl;
            }

            const payload = {
                name: formData.name.trim(),
                department_id: formData.department_id,
                image_url: finalImageUrl 
            };

            if (isEditing && editId) {
                const { data, error } = await supabase
                    .from("employees")
                    .update(payload)
                    .eq("id", editId)
                    .select("*, departments(*)")
                    .single();
                
                if (error) throw error;
                if (data) {
                    setEmployees(prev => prev.map(emp => emp.id === editId ? (data as unknown as Employee) : emp));
                }
                alert("บันทึกการแก้ไขเรียบร้อย");
            } else {
                const { error } = await supabase
                    .from("employees")
                    .insert([{ ...payload, staff_id: formData.staff_id }]);
                
                if (error) throw error;
                alert("เพิ่มพนักงานสำเร็จ");
                await refreshData();
            }
            
            setIsEditing(false); setEditId(null); setFormData({ name: "", staff_id: "", department_id: "" }); setPreviewUrl(null); setFile(null);
        } catch (err) { 
            // แก้ไขจุดที่แดง: เช็คประเภทของ error ก่อนแสดงผล
            const errorMsg = err instanceof Error ? err.message : "An unexpected error occurred";
            alert(errorMsg); 
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
                        <p className="text-slate-400 font-bold text-sm">จัดการข้อมูลและค้นหารายชื่อพนักงาน</p>
                    </div>
                </div>
                <button onClick={() => router.back()} className="text-slate-400 hover:text-slate-900 font-bold text-sm flex items-center gap-2">
                    <ArrowLeft size={18} /> กลับหน้าหลัก
                </button>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <section className="lg:col-span-4">
                    <form onSubmit={handleSubmit} className={`bg-white p-8 rounded-[2.5rem] border-4 shadow-2xl transition-all ${isEditing ? 'border-orange-500 scale-[1.01]' : 'border-white'}`}>
                        <div className="flex flex-col items-center mb-8">
                            <div className="relative">
                                <div onClick={() => fileInputRef.current?.click()} className="w-32 h-32 bg-slate-100 rounded-[2rem] overflow-hidden border-4 border-white cursor-pointer hover:border-indigo-400 transition-all flex items-center justify-center shadow-inner">
                                    <img 
                                        src={getDisplayPreview()} 
                                        className="w-full h-full object-cover" 
                                        alt="profile" 
                                        key={formData.name + (file ? 'file' : 'no-file')} 
                                    />
                                    <div className="absolute inset-0 bg-black/10 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity">
                                        <Camera className="text-white" size={24} />
                                    </div>
                                </div>
                                {previewUrl && isEditing && (
                                    <button 
                                        type="button"
                                        onClick={() => setPreviewUrl(null)}
                                        className="absolute -bottom-2 -left-2 bg-rose-500 text-white p-1.5 rounded-lg shadow-lg border-2 border-white hover:bg-rose-600"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                                <div className="absolute -top-2 -right-2 bg-slate-900 text-white px-3 py-1 rounded-lg font-black shadow-lg border-2 border-white text-[10px]">ID: {formData.staff_id}</div>
                            </div>
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                        </div>

                        <div className="space-y-4">
                            <input 
                                type="text" placeholder="ชื่อ-นามสกุล..." 
                                className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-slate-900 rounded-2xl font-bold outline-none" 
                                value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required 
                            />
                            <select 
                                className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-slate-900 rounded-2xl font-bold outline-none" 
                                value={formData.department_id} onChange={(e) => setFormData({ ...formData, department_id: e.target.value })} required
                            >
                                <option value="">เลือกแผนก...</option>
                                {departments.map(dept => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
                            </select>
                            <button type="submit" disabled={uploading} className={`w-full py-4 text-white rounded-[1.5rem] font-black shadow-xl flex items-center justify-center gap-2 transition-all ${isEditing ? 'bg-orange-500 hover:bg-orange-600' : 'bg-slate-900 hover:bg-slate-800'}`}>
                                {uploading ? <Loader2 className="animate-spin" size={20} /> : (isEditing ? <Save size={20} /> : <Plus size={20} />)}
                                {isEditing ? "อัปเดตข้อมูล" : "เพิ่มพนักงาน"}
                            </button>
                            {isEditing && (
                                <button type="button" onClick={() => { setIsEditing(false); setEditId(null); setFormData({ name: "", staff_id: "", department_id: "" }); setPreviewUrl(null); setFile(null); }} className="w-full text-slate-400 font-bold text-xs mt-2 hover:text-slate-600 transition-colors">
                                    ยกเลิกการแก้ไข
                                </button>
                            )}
                        </div>
                    </form>
                </section>

                <section className="lg:col-span-8">
                    <div className="bg-white rounded-[2.5rem] border-4 border-white shadow-xl overflow-hidden min-h-[500px]">
                        <div className="p-6 border-b border-slate-50 bg-slate-50/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <h3 className="text-lg font-black text-slate-900">พนักงาน ({filteredEmployees.length})</h3>
                            <div className="relative w-full md:w-64">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input 
                                    type="text" placeholder="ค้นหาชื่อหรือรหัส..." 
                                    className="w-full pl-11 pr-4 py-3 bg-white border-2 border-slate-100 rounded-2xl font-bold text-sm focus:border-slate-900 outline-none" 
                                    value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} 
                                />
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
                            {filteredEmployees.map((emp) => {
                                const deptColor = emp.departments?.color_code || '#cbd5e1';
                                return (
                                    <div key={emp.id} className="group p-4 rounded-[2rem] border-2 bg-white border-slate-50 hover:shadow-xl hover:border-indigo-100 flex items-center gap-4 transition-all duration-300">
                                        <div className="relative flex-shrink-0">
                                            <div className="w-16 h-16 rounded-2xl overflow-hidden border-4 border-white shadow-md bg-slate-100">
                                                <img 
                                                    src={emp.image_url || getAvatarUrl(emp.name)} 
                                                    className="w-full h-full object-cover" 
                                                    alt={emp.name} 
                                                />
                                            </div>
                                            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: deptColor }} />
                                        </div>
                                        <div className="flex-grow min-w-0">
                                            <div className="font-black text-slate-900 truncate leading-tight">{emp.name}</div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[9px] font-black px-2 py-0.5 rounded bg-slate-100 text-slate-400 uppercase">#{emp.staff_id}</span>
                                                <span className="text-[9px] font-black px-2 py-0.5 rounded text-white shadow-sm" style={{ backgroundColor: deptColor }}>
                                                    {emp.departments?.name || 'ทั่วไป'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => handleEdit(emp)} className="p-2 text-slate-300 hover:text-orange-500 transition-colors"><Edit3 size={16} /></button>
                                            <button onClick={async () => { 
                                                if(confirm(`ลบคุณ ${emp.name}?`)) { 
                                                    await supabase.from("employees").delete().eq("id", emp.id); 
                                                    setEmployees(prev => prev.filter(e => e.id !== emp.id)); 
                                                } 
                                            }} className="p-2 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={16} /></button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}