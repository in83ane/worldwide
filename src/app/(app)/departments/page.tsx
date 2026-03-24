"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutGrid,
  Plus,
  Trash2,
  ArrowLeft,
  Palette,
  Loader2,
  CheckCircle2,
  Edit3,
  X
} from "lucide-react";

interface Department {
  id: string;
  name: string;
  color_code: string;
  created_at: string;
}

export default function DepartmentsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [name, setName] = useState<string>("");
  const [color, setColor] = useState<string>("#3b82f6");

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editId, setEditId] = useState<string | null>(null);

  const fetchDepartments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("departments")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setDepartments(data as Department[]);
    setLoading(false);
  };

  useEffect(() => { fetchDepartments(); }, []);

  const resetForm = () => {
    setName(""); setColor("#3b82f6"); setIsEditing(false); setEditId(null);
  };

  const handleEditClick = (dept: Department) => {
    setIsEditing(true); setEditId(dept.id); setName(dept.name); setColor(dept.color_code);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      setIsSubmitting(true);
      if (isEditing && editId) {
        const { error } = await supabase.from("departments").update({ name: name.trim(), color_code: color }).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("departments").insert([{ name: name.trim(), color_code: color }]);
        if (error) {
          if (error.code === '23505') return alert("มีชื่อแผนกนี้อยู่ในระบบแล้ว");
          throw error;
        }
      }
      resetForm();
      fetchDepartments();
    } catch (err) {
      console.error(err);
      alert(isEditing ? "ไม่สามารถแก้ไขข้อมูลได้" : "ไม่สามารถเพิ่มแผนกได้");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, deptName: string) => {
    if (!confirm(`ยืนยันการลบแผนก "${deptName}"?\n*พนักงานในแผนกนี้จะกลายเป็น 'ไม่มีแผนก'`)) return;
    const { error } = await supabase.from("departments").delete().eq("id", id);
    if (error) { alert("ไม่สามารถลบได้เนื่องจากมีการใช้งานอยู่"); }
    else { if (editId === id) resetForm(); fetchDepartments(); }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      <header className="mb-8 md:mb-10">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-900 font-bold mb-4 transition-colors group"
        >
          <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          ย้อนกลับ
        </button>

        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-200">
            <LayoutGrid size={28} />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">จัดการแผนก</h1>
            <p className="text-slate-500 font-bold text-sm">กำหนดชื่อแผนกและสีสัญลักษณ์ประจำสายงาน</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        <section className="lg:col-span-1">
          <form
            onSubmit={handleSubmit}
            className={`bg-white p-6 rounded-[2.5rem] border-4 transition-all duration-300 shadow-xl shadow-slate-200/60 lg:sticky lg:top-8 ${isEditing ? 'border-orange-400' : 'border-white'}`}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                {isEditing ? (
                  <><Edit3 size={20} className="text-orange-500" /> แก้ไขแผนก</>
                ) : (
                  <><Plus size={20} className="text-indigo-600" /> เพิ่มแผนกใหม่</>
                )}
              </h2>
              {isEditing && (
                <button type="button" onClick={resetForm} className="text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
              )}
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-xs font-black text-slate-500 mb-2 ml-1 uppercase">ชื่อแผนก</label>
                <input
                  type="text"
                  placeholder="เช่น ไอที, ซ่อมบำรุง..."
                  className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl font-bold outline-none transition-all shadow-inner"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 mb-2 ml-1 uppercase flex items-center gap-1">
                  <Palette size={14} /> สีประจำแผนก
                </label>
                <div className="flex items-center gap-4 p-2 bg-slate-50 rounded-2xl border-2 border-transparent focus-within:border-indigo-600 transition-all shadow-inner">
                  <input
                    type="color"
                    className="w-14 h-14 rounded-xl cursor-pointer bg-transparent border-0"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                  />
                  <div className="flex-grow">
                    <div className="text-sm font-black text-slate-700">{color.toUpperCase()}</div>
                    <div className="text-[10px] font-bold text-slate-400">ตัวอย่างสีที่จะแสดง</div>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full py-4 text-white rounded-2xl font-black shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 ${
                  isEditing
                    ? 'bg-orange-500 hover:bg-orange-600 shadow-orange-100'
                    : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100'
                }`}
              >
                {isSubmitting ? <Loader2 className="animate-spin" /> : <CheckCircle2 size={20} />}
                {isEditing ? "อัปเดตข้อมูล" : "บันทึกแผนก"}
              </button>

              {isEditing && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="w-full text-center text-sm font-bold text-slate-400 hover:text-slate-600"
                >
                  ยกเลิกการแก้ไข
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="lg:col-span-2">
          <div className="bg-white rounded-[2.5rem] border-4 border-white shadow-xl shadow-slate-200/60 overflow-hidden">
            <div className="p-6 border-b border-slate-50 bg-slate-50/50">
              <h3 className="font-black text-slate-900 flex items-center gap-2">
                รายการแผนกทั้งหมด
                <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-lg text-xs">{departments.length}</span>
              </h3>
            </div>

            <div className="divide-y divide-slate-50">
              {loading ? (
                <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto text-slate-300" size={40} /></div>
              ) : departments.length > 0 ? (
                departments.map((dept) => (
                  <div
                    key={dept.id}
                    className={`p-5 flex items-center justify-between hover:bg-slate-50 transition-colors group ${editId === dept.id ? 'bg-orange-50/50' : ''}`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className="w-12 h-12 rounded-2xl shadow-inner border-4 border-white flex-shrink-0"
                        style={{ backgroundColor: dept.color_code }}
                      />
                      <div>
                        <div className="font-black text-slate-900 text-base md:text-lg leading-tight">{dept.name}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          Code: {dept.color_code}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEditClick(dept)}
                        className="p-3 text-slate-300 hover:text-orange-500 hover:bg-orange-50 rounded-xl transition-all"
                        title="แก้ไขแผนก"
                      >
                        <Edit3 size={20} />
                      </button>
                      <button
                        onClick={() => handleDelete(dept.id, dept.name)}
                        className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                        title="ลบแผนก"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-20 text-center">
                  <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                    <LayoutGrid size={32} />
                  </div>
                  <p className="font-bold text-slate-400">ยังไม่มีข้อมูลแผนกในระบบ</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}