"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
    UserPlus, Trash2, Users, ArrowLeft,
    Camera, Loader2, Plus
} from "lucide-react";

interface Department {
    id: string;
    name: string;
    color_code: string;
}

interface Employee {
    id: string;
    staff_id: string | null;
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
    const [loading, setLoading] = useState<boolean>(true);
    const [uploading, setUploading] = useState<boolean>(false);

    const [formData, setFormData] = useState({ name: "", staff_id: "", department_id: "" });
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const { data: empData, error: empError } = await supabase
                .from("employees")
                .select("*, departments(id, name, color_code)")
                .order("created_at", { ascending: false });

            if (empError) throw empError;

            const { data: deptData, error: deptError } = await supabase
                .from("departments")
                .select("*")
                .order("name");

            if (deptError) throw deptError;

            if (empData) setEmployees(empData as Employee[]);
            if (deptData) setDepartments(deptData as Department[]);
        } catch (err: unknown) {
            console.error("Fetch error:", err);
        } finally {
            setLoading(false);
        }
    }, [supabase]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            const objectUrl = URL.createObjectURL(selectedFile);
            setPreviewUrl(objectUrl);
            return () => URL.revokeObjectURL(objectUrl);
        }
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        
        // 1. ตรวจสอบ Session (RLS 'authenticated' ต้องการสิ่งนี้)
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            alert("สิทธิ์ไม่เพียงพอ: กรุณา Login เพื่อจัดการข้อมูลพนักงาน");
            return;
        }

        if (!formData.name.trim() || !formData.department_id) {
            alert("กรุณากรอกชื่อและเลือกแผนก");
            return;
        }

        try {
            setUploading(true);
            
            let finalImageUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(formData.name)}&background=random&size=128`;

            if (file) {
                const fileExt = file.name.split('.').pop();
                const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
                const filePath = `avatars/${fileName}`;

                // --- อัปโหลดไปยัง Bucket: EMPLOYEE-PHOTOS (ตัวพิมพ์ใหญ่ตาม Dashboard) ---
                const { error: uploadError } = await supabase.storage
                    .from('employee-photos') 
                    .upload(filePath, file);

                if (uploadError) {
                    console.error("Upload error details:", uploadError);
                    throw new Error(`ไม่สามารถอัปโหลดรูปภาพได้: ${uploadError.message}`);
                }

                const { data: { publicUrl } } = supabase.storage
                    .from('employee-photos')
                    .getPublicUrl(filePath);

                finalImageUrl = publicUrl;
            }

            const { error: insertError } = await supabase
                .from("employees")
                .insert([{
                    name: formData.name.trim(),
                    staff_id: formData.staff_id.trim() || null,
                    department_id: formData.department_id,
                    image_url: finalImageUrl
                }]);

            if (insertError) throw insertError;

            setFormData({ name: "", staff_id: "", department_id: "" });
            setFile(null);
            setPreviewUrl(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
            
            fetchData();
            alert("เพิ่มพนักงานเรียบร้อยแล้ว");

        } catch (err: unknown) {
            console.error("Submit error:", err);
            const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการบันทึก";
            alert(msg);
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            alert("กรุณา Login ก่อนดำเนินการ");
            return;
        }

        if (!confirm(`คุณต้องการลบรายชื่อ "${name}" ใช่หรือไม่?`)) return;
        try {
            const { error } = await supabase.from("employees").delete().eq("id", id);
            if (error) throw error;
            fetchData();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "ลบไม่สำเร็จ";
            alert(msg);
        }
    };

    return (
        <main className="max-w-6xl mx-auto p-4 md:p-8 min-h-screen bg-slate-50/30">
            <header className="mb-10">
                <button 
                    onClick={() => router.back()} 
                    className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-900 font-bold mb-4 transition-colors"
                >
                    <ArrowLeft size={20} /> ย้อนกลับ
                </button>
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-slate-900 rounded-2xl text-white shadow-xl">
                        <Users size={32} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">จัดการรายชื่อพนักงาน</h1>
                        <p className="text-slate-500 font-bold text-sm">เพิ่มและจัดการพนักงาน (เฉพาะ Admin)</p>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <section className="lg:col-span-4">
                    <form onSubmit={handleSubmit} className="bg-white p-8 rounded-[2.5rem] border-4 border-white shadow-2xl sticky top-8">
                        <h2 className="text-xl font-black text-slate-900 mb-8 flex items-center gap-2">
                            <Plus size={24} className="text-indigo-600" /> ข้อมูลพนักงานใหม่
                        </h2>
                        
                        <div className="space-y-6">
                            <div className="flex flex-col items-center">
                                <div 
                                    onClick={() => fileInputRef.current?.click()} 
                                    className="group relative w-32 h-32 bg-slate-100 rounded-[2rem] overflow-hidden border-4 border-slate-50 cursor-pointer hover:border-indigo-500 transition-all shadow-inner"
                                >
                                    {previewUrl ? (
                                        <img src={previewUrl} className="w-full h-full object-cover" alt="Preview" />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 group-hover:text-indigo-500">
                                            <Camera size={32} />
                                            <span className="text-[10px] font-black mt-1">อัปโหลดรูป</span>
                                        </div>
                                    )}
                                </div>
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    className="hidden" 
                                    accept="image/*" 
                                    onChange={handleFileChange} 
                                />
                            </div>

                            <div className="space-y-4">
                                <input 
                                    type="text" 
                                    placeholder="ชื่อ-นามสกุล" 
                                    className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl font-bold outline-none transition-all" 
                                    value={formData.name} 
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                                    required 
                                />
                                <input 
                                    type="text" 
                                    placeholder="รหัสพนักงาน" 
                                    className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl font-bold outline-none transition-all" 
                                    value={formData.staff_id} 
                                    onChange={(e) => setFormData({ ...formData, staff_id: e.target.value })} 
                                />
                                <select 
                                    className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl font-bold outline-none transition-all appearance-none" 
                                    value={formData.department_id} 
                                    onChange={(e) => setFormData({ ...formData, department_id: e.target.value })} 
                                    required
                                >
                                    <option value="">-- เลือกแผนก --</option>
                                    {departments.map(dept => (
                                        <option key={dept.id} value={dept.id}>{dept.name}</option>
                                    ))}
                                </select>
                            </div>

                            <button 
                                type="submit" 
                                disabled={uploading} 
                                className="w-full py-5 bg-slate-900 hover:bg-black disabled:bg-slate-300 text-white rounded-[1.5rem] font-black shadow-xl transition-all flex items-center justify-center gap-3 active:scale-95"
                            >
                                {uploading ? <Loader2 className="animate-spin" /> : <UserPlus size={22} />}
                                {uploading ? "กำลังบันทึก..." : "เพิ่มพนักงานเข้าสู่ระบบ"}
                            </button>
                        </div>
                    </form>
                </section>

                <section className="lg:col-span-8">
                    <div className="bg-white rounded-[2.5rem] border-4 border-white shadow-xl overflow-hidden">
                        <div className="p-8 border-b border-slate-50 bg-slate-50/30 flex justify-between items-center">
                            <h3 className="text-xl font-black text-slate-900">รายชื่อทั้งหมด ({employees.length})</h3>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
                            {loading ? (
                                <div className="col-span-full py-20 text-center">
                                    <Loader2 className="animate-spin mx-auto text-slate-300" size={48} />
                                    <p className="text-slate-400 font-bold mt-4">กำลังโหลด...</p>
                                </div>
                            ) : employees.length === 0 ? (
                                <div className="col-span-full py-20 text-center text-slate-300 font-bold">
                                    ยังไม่มีพนักงานในระบบ
                                </div>
                            ) : (
                                employees.map((emp) => (
                                    <div 
                                        key={emp.id} 
                                        className="group bg-slate-50/50 p-5 rounded-[2rem] flex items-center gap-5 border-2 border-transparent hover:border-white hover:bg-white hover:shadow-xl transition-all"
                                    >
                                        <div className="relative">
                                            <img 
                                                src={emp.image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.name)}`} 
                                                className="w-16 h-16 rounded-2xl object-cover shadow-md border-2 border-white bg-white" 
                                                alt={emp.name}
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.name)}&background=random`;
                                                }}
                                            />
                                            <div 
                                                className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-4 border-white" 
                                                style={{ backgroundColor: emp.departments?.color_code || '#cbd5e1' }} 
                                            />
                                        </div>
                                        <div className="flex-grow min-w-0">
                                            <div className="font-black text-slate-900 text-lg truncate">{emp.name}</div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-400">
                                                    ID: {emp.staff_id || 'N/A'}
                                                </span>
                                                <span 
                                                    className="text-[10px] font-black px-2 py-0.5 rounded-lg text-white" 
                                                    style={{ backgroundColor: emp.departments?.color_code || '#cbd5e1' }}
                                                >
                                                    {emp.departments?.name}
                                                </span>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => handleDelete(emp.id, emp.name)} 
                                            className="p-3 text-slate-300 hover:text-rose-600 transition-all opacity-0 group-hover:opacity-100"
                                        >
                                            <Trash2 size={20} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}