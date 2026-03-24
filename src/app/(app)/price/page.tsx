"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
    Search, X, Tag, Package, Pencil, Trash2, 
    Plus, LayoutGrid, GripVertical, Eye, EyeOff, ChevronDown, Clock
} from 'lucide-react';

interface Product {
    id: string;
    name: string;
    category: string;
    detail?: string;
    price1: number;
    price2: number;
    price3: number;
    is_visible: boolean;
    updated_at: string;
}

export default function PricePage() {
    const supabase = createClient();
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [userRole, setUserRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    
    const [viewMode, setViewMode] = useState<'all' | 'active'>('all');
    const [showFormModal, setShowFormModal] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    
    const [isCatOpen, setIsCatOpen] = useState(false);
    const [catSearch, setCatSearch] = useState("");
    const dropdownRef = useRef<HTMLDivElement>(null);

    const [formData, setFormData] = useState({
        name: '', category: '', detail: '', price1: '', price2: '', price3: ''
    });

    const isAdmin = userRole === 'admin';

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleString('th-TH', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const filteredDropdownCats = categories.filter(cat => 
        cat.toLowerCase().includes(catSearch.toLowerCase())
    );

    const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
    const handleDragStart = (index: number) => { if (!isAdmin) return; setDraggedItemIndex(index); };
    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedItemIndex === null || draggedItemIndex === index) return;
        const newCategories = [...categories];
        const draggedItem = newCategories[draggedItemIndex];
        newCategories.splice(draggedItemIndex, 1);
        newCategories.splice(index, 0, draggedItem);
        setDraggedItemIndex(index);
        setCategories(newCategories);
    };
    const handleDragEnd = () => { setDraggedItemIndex(null); localStorage.setItem('category_priority', JSON.stringify(categories)); };

    const fetchProducts = async () => {
        const { data, error } = await supabase.from("products").select("*").order("updated_at", { ascending: false });
        if (!error && data) {
            const fetchedProducts = data as Product[];
            setProducts(fetchedProducts);
            const uniqueCats = Array.from(new Set(fetchedProducts.map((p) => p.category))).filter(Boolean) as string[];
            const savedPriority = localStorage.getItem('category_priority');
            if (savedPriority) {
                const priorityArray = JSON.parse(savedPriority) as string[];
                const sortedCats = priorityArray.filter((c) => uniqueCats.includes(c));
                const newCats = uniqueCats.filter(c => !priorityArray.includes(c));
                setCategories([...sortedCats, ...newCats]);
            } else { setCategories(uniqueCats.sort()); }
        }
    };

    const handleEditCategory = async (oldName: string) => {
        const newName = prompt("แก้ไขชื่อหมวดหมู่:", oldName);
        if (!newName || newName === oldName) return;

        const { error } = await supabase
            .from("products")
            .update({ category: newName })
            .eq("category", oldName);

        if (error) {
            alert("ไม่สามารถแก้ไขได้: " + error.message);
        } else {
            const savedPriority = localStorage.getItem('category_priority');
            if (savedPriority) {
                const priorityArray = JSON.parse(savedPriority) as string[];
                const updatedPriority = priorityArray.map(c => c === oldName ? newName : c);
                localStorage.setItem('category_priority', JSON.stringify(updatedPriority));
            }
            if (selectedCategory === oldName) setSelectedCategory(newName);
            fetchProducts();
        }
    };

    const handleDeleteCategory = async (catName: string) => {
        if (confirm(`คุณแน่ใจหรือไม่ที่จะลบหมวดหมู่ "${catName}"?\n** คำเตือน: สินค้าทั้งหมดในหมวดนี้จะถูกลบไปด้วย **`)) {
            const { error } = await supabase
                .from("products")
                .delete()
                .eq("category", catName);

            if (error) {
                alert("ลบไม่สำเร็จ: " + error.message);
            } else {
                const savedPriority = localStorage.getItem('category_priority');
                if (savedPriority) {
                    const priorityArray = JSON.parse(savedPriority) as string[];
                    const updatedPriority = priorityArray.filter(c => c !== catName);
                    localStorage.setItem('category_priority', JSON.stringify(updatedPriority));
                }
                if (selectedCategory === catName) setSelectedCategory('all');
                fetchProducts();
            }
        }
    };

    useEffect(() => {
        async function checkAuth() {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
                setUserRole(profile?.role || 'admin');
            } else { setUserRole('admin'); }
            await fetchProducts();
            setLoading(false);
        }
        checkAuth();
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) { setIsCatOpen(false); }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const toggleVisibility = async (id: string, currentStatus: boolean) => {
        const { error } = await supabase.from("products").update({ is_visible: !currentStatus }).eq("id", id);
        if (!error) { fetchProducts(); }
    };

    const handleSaveProduct = async (e: React.FormEvent) => {
        e.preventDefault();
        const payload = {
            name: formData.name, category: formData.category, detail: formData.detail,
            price1: Number(formData.price1) || 0, price2: Number(formData.price2) || 0, price3: Number(formData.price3) || 0,
            updated_at: new Date().toISOString()
        };
        if (editingId) { await supabase.from("products").update(payload).eq("id", editingId);
        } else { await supabase.from("products").insert([{ ...payload, is_visible: true }]); }
        setShowFormModal(false); setEditingId(null); fetchProducts();
    };

    const handleDeleteProduct = async (id: string) => {
        if (confirm("คุณแน่ใจหรือไม่ที่จะลบสินค้านี้?")) {
            const { error } = await supabase.from("products").delete().eq("id", id);
            if (error) { alert("ลบไม่สำเร็จ: " + error.message); } else { fetchProducts(); }
        }
    };

    const sortedAndFilteredProducts = useMemo(() => {
        const filtered = products.filter(p => {
            const searchLower = searchTerm.toLowerCase();
            const matchesSearch = p.name.toLowerCase().includes(searchLower) || 
                                 p.category.toLowerCase().includes(searchLower) ||
                                 (p.detail && p.detail.toLowerCase().includes(searchLower));
            const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
            const matchesVisibility = viewMode === 'all' ? true : p.is_visible;
            return matchesSearch && matchesCat && matchesVisibility;
        });

        const groups: Record<string, Product[]> = {};
        filtered.forEach(p => {
            if (!groups[p.category]) groups[p.category] = [];
            groups[p.category].push(p);
        });

        return categories
            .filter(cat => groups[cat])
            .map(cat => ({
                category: cat,
                items: groups[cat].sort((a, b) => 
                    new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
                )
            }));
    }, [products, searchTerm, selectedCategory, viewMode, categories]);

    if (loading) return <div className="flex h-screen items-center justify-center font-black text-slate-400 italic animate-pulse">กำลังโหลดข้อมูล...</div>;

    return (
        <main className="flex min-h-screen bg-slate-50/50">
            <aside className="w-56 bg-white border-r border-slate-100 p-4 hidden lg:block sticky top-0 h-screen overflow-y-auto">
                <div className="flex items-center gap-2 mb-8 px-2">
                    <LayoutGrid className="text-slate-900" size={16} />
                    <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">หมวดหมู่</h2>
                </div>
                <ul className="space-y-1.5">
                    <li>
                        <button 
                            className={`w-full text-left px-4 py-2 rounded-xl font-bold text-[11px] transition-all ${selectedCategory === 'all' ? 'bg-slate-900 text-white shadow-lg' : 'hover:bg-slate-50 text-slate-500'}`} 
                            onClick={() => setSelectedCategory('all')}
                        >
                            ทั้งหมด
                        </button>
                    </li>
                    {categories.map((cat, index) => (
                        <li 
                            key={cat} 
                            draggable={isAdmin} 
                            onDragStart={() => handleDragStart(index)} 
                            onDragOver={(e) => handleDragOver(e, index)} 
                            onDragEnd={handleDragEnd} 
                            className={`flex items-center gap-1 group transition-opacity ${draggedItemIndex === index ? 'opacity-20' : 'opacity-100'}`}
                        >
                            {isAdmin && (
                                <div className="cursor-grab active:cursor-grabbing p-1 text-slate-200 group-hover:text-slate-400 transition-colors">
                                    <GripVertical size={12} />
                                </div>
                            )}
                            <div className="flex-1 flex items-center gap-1 relative group/catitem">
                                <button 
                                    className={`flex-1 text-left px-4 py-2 rounded-xl font-bold text-[11px] transition-all ${selectedCategory === cat ? 'bg-slate-900 text-white shadow-md' : 'hover:bg-slate-50 text-slate-500'}`} 
                                    onClick={() => setSelectedCategory(cat)}
                                >
                                    {cat}
                                </button>
                                
                                {isAdmin && (
                                    <div className="absolute right-1 hidden group-hover/catitem:flex items-center gap-0.5 bg-white/10 rounded-lg px-1 backdrop-blur-sm">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleEditCategory(cat); }}
                                            className="p-1.5 text-orange-400 hover:text-orange-600 transition-colors"
                                            title="แก้ไขชื่อหมวดหมู่"
                                        >
                                            <Pencil size={10} />
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat); }}
                                            className="p-1.5 text-rose-400 hover:text-rose-600 transition-colors"
                                            title="ลบหมวดหมู่"
                                        >
                                            <Trash2 size={10} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            </aside>

            <div className="flex-1 p-4 md:p-8">
                <header className="mb-8 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-slate-900 rounded-2xl text-white shadow-xl rotate-3"><Package size={24} /></div>
                        <div>
                            <h1 className="text-2xl font-black text-slate-900 leading-tight">{selectedCategory === 'all' ? 'รายการสินค้า' : selectedCategory}</h1>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sorting by Category & Last Updated</p>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row items-center gap-4 w-full xl:w-auto">
                        <div className="bg-slate-200/60 p-1.5 rounded-2xl flex items-center w-full md:w-auto shadow-inner">
                            <button onClick={() => setViewMode('all')} className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-xs font-black transition-all ${viewMode === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><LayoutGrid size={14} /> ทั้งหมด</button>
                            <button onClick={() => setViewMode('active')} className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-xs font-black transition-all ${viewMode === 'active' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}><Eye size={14} /> เปิดขายอยู่</button>
                        </div>
                        <div className="flex gap-2 w-full md:w-auto">
                            <button onClick={() => { setEditingId(null); setFormData({name:'',category:'',detail:'',price1:'',price2:'',price3:''}); setShowFormModal(true); }} className="flex-1 md:flex-none px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-100 active:scale-95 transition-all"><Plus size={16} /> เพิ่มใหม่</button>
                            <div className="relative flex-1 md:w-64 group">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors" size={14} />
                                <input type="text" placeholder="ค้นหาชื่อ, รายละเอียด..." className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold outline-none focus:border-slate-900 text-xs transition-all shadow-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                            </div>
                        </div>
                    </div>
                </header>

                <div className="space-y-12">
                    {sortedAndFilteredProducts.map((group) => (
                        <section key={group.category} className="space-y-6">
                            <div className="flex items-center gap-4">
                                <h2 className="text-sm font-black text-slate-800 bg-white px-5 py-2 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-2">
                                    <Tag size={14} className="text-blue-500" /> {group.category}
                                    <span className="ml-2 text-[9px] bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full">{group.items.length}</span>
                                </h2>
                                <div className="h-[1px] flex-1 bg-slate-200"></div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                                {group.items.map(p => (
                                    <div key={p.id} className={`bg-white border border-slate-100 rounded-[2rem] p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative flex flex-col ${!p.is_visible ? 'opacity-50 border-dashed bg-slate-50/50' : ''}`}>
                                        <div className="flex justify-between items-start mb-4">
                                            <span className={`text-[8px] font-black px-2 py-1 rounded-lg uppercase tracking-tighter ${!p.is_visible ? 'bg-slate-200 text-slate-500' : 'bg-emerald-100 text-emerald-700'}`}>{!p.is_visible ? 'Hidden' : 'Active'}</span>
                                            <div className="flex gap-1">
                                                <button onClick={() => toggleVisibility(p.id, p.is_visible)} className="p-2 text-blue-400 hover:bg-blue-50 rounded-xl transition-all">{!p.is_visible ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                                                <button onClick={() => { setEditingId(p.id); setFormData({name: p.name, category: p.category, detail: p.detail || '', price1: String(p.price1), price2: String(p.price2), price3: String(p.price3)}); setShowFormModal(true); }} className="p-2 text-orange-400 hover:bg-orange-50 rounded-xl transition-all"><Pencil size={16} /></button>
                                                <button onClick={() => handleDeleteProduct(p.id)} className="p-2 text-rose-400 hover:bg-rose-50 rounded-xl transition-all"><Trash2 size={16} /></button>
                                            </div>
                                        </div>
                                        
                                        <div className="flex-1">
                                            <h3 className="text-lg font-black text-slate-900 mb-1 leading-tight">{p.name}</h3>
                                            {p.detail && (
                                                <p className="text-[11px] font-medium text-slate-400 mb-5 line-clamp-2 italic">
                                                    {`"${p.detail}"`}
                                                </p>
                                            )}
                                        </div>

                                        <div className="p-4 bg-slate-50 rounded-[1.5rem] space-y-2 border border-slate-100 mb-4">
                                            <div className="flex justify-between items-center"><span className="text-[9px] font-bold text-slate-400">ราคา 1</span><span className="text-base font-black text-slate-900">฿{p.price1.toLocaleString()}</span></div>
                                            <div className="flex justify-between items-center"><span className="text-[9px] font-bold text-slate-400">ราคา 2</span><span className="text-base font-black text-blue-600">฿{p.price2.toLocaleString()}</span></div>
                                            <div className="flex justify-between items-center"><span className="text-[9px] font-bold text-slate-400">ราคา 3</span><span className="text-base font-black text-purple-600">฿{p.price3.toLocaleString()}</span></div>
                                        </div>

                                        <div className="flex items-center justify-end gap-1.5 text-slate-300">
                                            <Clock size={10} />
                                            <span className="text-[9px] font-bold uppercase tracking-tight">แก้ไขเมื่อ: {formatDate(p.updated_at)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            </div>

            {showFormModal && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[150] flex items-center justify-center p-4">
                    <div className={`bg-white rounded-[2.5rem] border w-full max-w-lg shadow-2xl p-8 overflow-y-auto max-h-[90vh] ${editingId ? 'border-orange-100' : 'border-slate-100'}`}>
                        <div className="flex justify-between items-center mb-8">
                            <div>
                                <h2 className="text-2xl font-black text-slate-900">{editingId ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h2>
                                <p className="text-xs text-slate-400 font-bold">กรอกข้อมูลให้ครบถ้วนเพื่ออัปเดตระบบ</p>
                            </div>
                            <button onClick={() => setShowFormModal(false)} className="p-3 hover:bg-slate-100 rounded-full text-slate-400 transition-all"><X size={20}/></button>
                        </div>
                        <form onSubmit={handleSaveProduct} className="space-y-5">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 ml-2 uppercase tracking-widest">Product Name</label>
                                <input required placeholder="ชื่อสินค้า..." className="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-slate-900 transition-all text-sm" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                            </div>

                            <div className="space-y-1 relative" ref={dropdownRef}>
                                <label className="text-[10px] font-black text-slate-400 ml-2 uppercase tracking-widest">Category</label>
                                <div onClick={() => setIsCatOpen(!isCatOpen)} className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-2 border-transparent cursor-pointer flex justify-between items-center hover:bg-slate-100 transition-all text-sm">
                                    <span className={formData.category ? "text-slate-900" : "text-slate-400"}>{formData.category || "เลือกหมวดหมู่..."}</span>
                                    <ChevronDown size={18} className={`transition-transform duration-300 text-slate-400 ${isCatOpen ? 'rotate-180' : ''}`} />
                                </div>
                                {isCatOpen && (
                                    <div className="absolute top-[110%] left-0 w-full bg-white border-2 border-slate-100 rounded-2xl shadow-2xl z-[160] overflow-hidden">
                                        <div className="p-3 border-b border-slate-50">
                                            <div className="relative">
                                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                <input autoFocus className="w-full pl-9 pr-4 py-2 bg-slate-50 rounded-xl text-xs font-bold outline-none border-2 border-transparent focus:border-slate-900" placeholder="ค้นหาหมวดหมู่..." value={catSearch} onChange={(e) => setCatSearch(e.target.value)} />
                                            </div>
                                        </div>
                                        <div className="max-h-48 overflow-y-auto">
                                            {filteredDropdownCats.map((cat) => (
                                                <div key={cat} className="px-4 py-3 hover:bg-slate-50 cursor-pointer font-bold text-xs text-slate-700 flex items-center justify-between group" onClick={() => { setFormData({...formData, category: cat}); setIsCatOpen(false); setCatSearch(""); }}>
                                                    {cat} <Tag size={12} className="opacity-0 group-hover:opacity-100 text-slate-300" />
                                                </div>
                                            ))}
                                            {catSearch && !categories.includes(catSearch) && (
                                                <div className="px-4 py-4 bg-blue-50 hover:bg-blue-100 cursor-pointer font-black text-xs text-blue-600 flex items-center gap-2 transition-colors" onClick={() => { setFormData({...formData, category: catSearch}); setIsCatOpen(false); setCatSearch(""); }}>
                                                    <Plus size={14} /> 
                                                    <span>เพิ่มใหม่: {`"${catSearch}"`}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 ml-2 uppercase tracking-widest">Product Description</label>
                                <textarea rows={2} placeholder="รายละเอียด..." className="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-slate-900 transition-all text-sm" value={formData.detail} onChange={e => setFormData({...formData, detail: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 ml-2 uppercase">Price 1</label>
                                <input type="number" required className="w-full p-4 bg-slate-50 rounded-2xl font-black outline-none border-2 border-transparent focus:border-emerald-500 text-sm" value={formData.price1} onChange={e => setFormData({...formData, price1: e.target.value})} /></div>
                                <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 ml-2 uppercase">Price 2</label>
                                <input type="number" required className="w-full p-4 bg-slate-50 rounded-2xl font-black outline-none border-2 border-transparent focus:border-blue-500 text-sm" value={formData.price2} onChange={e => setFormData({...formData, price2: e.target.value})} /></div>
                                <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 ml-2 uppercase">Price 3</label>
                                <input type="number" required className="w-full p-4 bg-slate-50 rounded-2xl font-black outline-none border-2 border-transparent focus:border-purple-500 text-sm" value={formData.price3} onChange={e => setFormData({...formData, price3: e.target.value})} /></div>
                            </div>
                            <button type="submit" className={`w-full py-5 rounded-[1.5rem] font-black text-white shadow-xl transition-all active:scale-95 mt-6 ${editingId ? 'bg-orange-500 shadow-orange-100' : 'bg-slate-900 shadow-slate-200'}`}>
                                {editingId ? 'ยืนยันการแก้ไขข้อมูล' : 'บันทึกข้อมูลสินค้าใหม่'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </main>
    );
}