"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Loader2, Search, UserX, Trash2, AlertCircle, UserCheck } from "lucide-react";

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

export default function DisabledEmployeesPage() {
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    const fetchDisabled = useCallback(async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from("employees")
                .select("*, departments(*)")
                .eq("is_active", false)
                .order("created_at", { ascending: false });

            if (error) throw error;
            if (data) setEmployees(data as unknown as Employee[]);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("Error fetching disabled employees:", message);
        } finally {
            setLoading(false);
        }
    }, [supabase]);

    useEffect(() => { fetchDisabled(); }, [fetchDisabled]);

    const handleRestore = async (emp: Employee) => {
        const email = prompt(`ดึงคุณ ${emp.name} กลับเข้าทำงาน\nกรุณาระบุ Email สำหรับใช้ Login:`);
        if (!email) return;

        const password = prompt(`ตั้งรหัสผ่านใหม่สำหรับคุณ ${emp.name}\n(อย่างน้อย 6 ตัวอักษร):`);
        if (!password) return;
        if (password.length < 6) {
            alert("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('/employees/api', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, name: emp.name })
            });

            const authRes = await res.json();
            if (authRes.error) throw new Error(authRes.error);

            const newUserId = authRes.user.id;
            await supabase.from("profiles").update({ email }).eq("id", newUserId);

            const { error: updateError } = await supabase
                .from("employees")
                .update({ is_active: true, user_id: newUserId })
                .eq("id", emp.id);

            if (updateError) throw updateError;

            alert(`ดึงคุณ ${emp.name} กลับเข้าทำงานและสร้างบัญชีใหม่เรียบร้อยแล้ว`);
            setEmployees(prev => prev.filter(e => e.id !== emp.id));
        } catch (err) {
            alert("เกิดข้อผิดพลาด: " + (err instanceof Error ? err.message : "ไม่ทราบสาเหตุ"));
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteForever = async (emp: Employee) => {
        if (!confirm(`ยืนยันการลบคุณ ${emp.name} ออกจากระบบถาวร?\n(ข้อมูลและบัญชีผู้ใช้จะหายไปทั้งหมดและไม่สามารถกู้คืนได้)`)) return;

        setLoading(true);
        try {
            // 1. ลบบัญชีใน auth.users ก่อน (ถ้ามี user_id)
            //    เพื่อไม่ให้ login ได้อีกต่อไป
            if (emp.user_id) {
                const res = await fetch('/employees/api', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: emp.user_id }),
                });
                const result = await res.json();
                // ถ้า error ที่ไม่ใช่ "not found" ให้หยุด
                if (!res.ok && !result.error?.includes('not found')) {
                    throw new Error(result.error || 'ลบบัญชีไม่สำเร็จ');
                }
            }

            // 2. ลบแถวใน employees
            const { error } = await supabase.from("employees").delete().eq("id", emp.id);
            if (error) throw error;

            setEmployees(prev => prev.filter(e => e.id !== emp.id));
        } catch (err) {
            alert("ไม่สามารถลบข้อมูลได้: " + (err instanceof Error ? err.message : "ไม่ทราบสาเหตุ"));
        } finally {
            setLoading(false);
        }
    };

    const filtered = useMemo(() => {
        return employees.filter(e => {
            const s = searchQuery.toLowerCase();
            return (e.name?.toLowerCase().includes(s) ?? false) || (e.staff_id?.includes(searchQuery) ?? false);
        });
    }, [employees, searchQuery]);

    return (
        <main className="max-w-5xl mx-auto p-4 md:p-8 min-h-screen bg-slate-50/30">
            <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-slate-900 rounded-2xl text-white shadow-xl">
                        <UserX size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Inactive Staff</h1>
                        <p className="text-slate-400 font-bold text-sm">รายชื่อพนักงานที่พ้นสภาพ</p>
                    </div>
                </div>
                <button 
                    onClick={() => router.push("/employees")} 
                    className="text-slate-400 hover:text-slate-900 font-bold text-sm flex items-center gap-2 px-2 transition-colors"
                >
                    <ArrowLeft size={18} /> กลับไปหน้าจัดการพนักงาน
                </button>
            </header>

            <div className="bg-white rounded-[2.5rem] border-4 border-white shadow-xl overflow-hidden min-h-[500px]">
                <div className="p-6 border-b border-slate-50 bg-slate-50/30 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                            type="text" 
                            placeholder="ค้นหาพนักงานที่พ้นสภาพ..." 
                            className="w-full pl-11 pr-4 py-3 bg-white border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-slate-900 transition-all" 
                            value={searchQuery} 
                            onChange={(e) => setSearchQuery(e.target.value)} 
                        />
                    </div>
                    <div className="text-slate-400 text-sm font-bold">ทั้งหมด {filtered.length} รายการ</div>
                </div>

                <div className="p-6 space-y-4">
                    {loading ? (
                        <div className="py-20 flex justify-center">
                            <Loader2 className="animate-spin text-slate-200" size={40} />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="py-20 text-center text-slate-300 font-bold flex flex-col items-center gap-2">
                            <AlertCircle size={48} className="opacity-20" />
                            ไม่มีข้อมูลพนักงานที่พ้นสภาพ
                        </div>
                    ) : (
                        filtered.map((emp) => (
                            <div key={emp.id} className="p-4 rounded-[2rem] border-2 border-slate-50 bg-white flex items-center gap-4 group transition-all hover:border-slate-100 shadow-sm hover:shadow-md">
                                <div className="w-14 h-14 rounded-2xl overflow-hidden grayscale opacity-50 bg-slate-100 flex-shrink-0">
                                    <img 
                                        src={emp.image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.name)}&background=random`} 
                                        className="w-full h-full object-cover" 
                                        alt={emp.name} 
                                    />
                                </div>
                                <div className="flex-grow min-w-0">
                                    <div className="font-black text-slate-500 group-hover:text-slate-900 transition-all truncate">
                                        {emp.name}
                                    </div>
                                    <div className="text-[10px] font-bold text-slate-400 truncate">
                                        ID: {emp.staff_id} | {emp.departments?.name || 'ทั่วไป'}
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => handleRestore(emp)} 
                                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white hover:bg-black rounded-xl font-bold text-xs transition-all active:scale-95 shadow-md"
                                    >
                                        <UserCheck size={16} /> ดึงกลับเข้าทำงาน
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteForever(emp)} 
                                        className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                                        title="ลบประวัติถาวร"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
            
            <footer className="mt-8 text-center">
                <p className="text-slate-400 text-xs font-medium italic">
                    * พนักงานที่พ้นสภาพจะถูกลบบัญชีผู้ใช้เดิมออกเพื่อความปลอดภัย การดึงกลับเข้าทำงานต้องกำหนดรหัสผ่านใหม่เสมอ
                </p>
            </footer>
        </main>
    );
}