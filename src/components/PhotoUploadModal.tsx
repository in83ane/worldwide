'use client';

import React, { useRef, useState, useCallback } from 'react';
import { Camera, Upload, X, RotateCcw, CheckCircle2, Loader2, Image as ImageIcon } from 'lucide-react';

interface PhotoUploadModalProps {
  mode: 'start' | 'complete';
  jobDetail: string;
  onConfirm: (file: File) => Promise<void>;
  onCancel: () => void;
}

export default function PhotoUploadModal({ mode, jobDetail, onConfirm, onCancel }: PhotoUploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const isStart = mode === 'start';
  const accentColor = isStart ? '#3b82f6' : '#10b981';
  const label = isStart ? 'เริ่มงาน' : 'เสร็จสิ้นงาน';
  const icon = isStart
    ? <Camera size={22} className="text-blue-500" />
    : <CheckCircle2 size={22} className="text-emerald-500" />;

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    // reset input value so same file can be re-selected
    e.target.value = '';
  }, []);

  const handleConfirm = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      await onConfirm(selectedFile);
    } finally {
      setUploading(false);
    }
  };

  const handleReset = () => {
    setPreview(null);
    setSelectedFile(null);
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white w-full sm:max-w-md sm:rounded-[2.5rem] rounded-t-[2.5rem] shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Accent bar */}
        <div className="h-2" style={{ backgroundColor: accentColor }} />
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="w-10 h-1.5 rounded-full bg-slate-200" />
        </div>

        <div className="p-6 sm:p-8">
          {/* Header */}
          <div className="flex justify-between items-start mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                {icon}
                <h3 className="text-lg font-black text-slate-800">ยืนยันภาพ{label}</h3>
              </div>
              <p className="text-xs font-bold text-slate-400 line-clamp-1 max-w-[260px]">{jobDetail}</p>
            </div>
            <button
              onClick={onCancel}
              className="p-2.5 bg-slate-50 rounded-2xl text-slate-400 hover:bg-slate-100 transition-colors shrink-0 ml-2"
            >
              <X size={18} />
            </button>
          </div>

          {/* Photo area */}
          {preview ? (
            <div className="relative mb-5">
              <img
                src={preview}
                alt="preview"
                className="w-full h-64 object-cover rounded-[1.5rem] border-4 border-slate-100 shadow-md"
              />
              <button
                onClick={handleReset}
                className="absolute top-3 right-3 p-2 bg-white/90 rounded-2xl text-slate-600 hover:bg-white shadow-lg transition-all"
              >
                <RotateCcw size={16} />
              </button>
              <div
                className="absolute bottom-3 left-3 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wide text-white shadow"
                style={{ backgroundColor: accentColor }}
              >
                พร้อมยืนยัน
              </div>
            </div>
          ) : (
            <div className="mb-5 border-4 border-dashed border-slate-200 rounded-[1.5rem] h-52 flex flex-col items-center justify-center gap-3 bg-slate-50">
              <ImageIcon size={40} className="text-slate-200" />
              <p className="text-sm font-bold text-slate-400">ถ่ายหรืออัพโหลดรูปภาพ</p>
              <p className="text-[11px] text-slate-300 font-bold">เพื่อยืนยัน{label}</p>
            </div>
          )}

          {/* Hidden inputs */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Buttons */}
          {!preview ? (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex flex-col items-center gap-2 p-4 bg-slate-900 text-white rounded-[1.5rem] font-black text-sm active:scale-95 transition-all shadow-lg"
              >
                <Camera size={22} />
                ถ่ายรูป
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center gap-2 p-4 bg-slate-50 text-slate-700 border-2 border-slate-100 rounded-[1.5rem] font-black text-sm active:scale-95 transition-all"
              >
                <Upload size={22} />
                อัพโหลด
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={handleConfirm}
                disabled={uploading}
                className="flex-[2] py-4 rounded-[1.5rem] text-white font-black text-sm shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                style={{ backgroundColor: accentColor }}
              >
                {uploading ? (
                  <><Loader2 size={18} className="animate-spin" /> กำลังบันทึก...</>
                ) : (
                  <><CheckCircle2 size={18} /> ยืนยัน{label}</>
                )}
              </button>
              <button
                onClick={handleReset}
                disabled={uploading}
                className="flex-1 py-4 bg-slate-100 rounded-[1.5rem] font-black text-sm text-slate-500 hover:bg-slate-200 active:scale-95 transition-all disabled:opacity-50"
              >
                เปลี่ยนรูป
              </button>
            </div>
          )}

          <button
            onClick={onCancel}
            disabled={uploading}
            className="w-full mt-3 py-3 text-slate-400 font-bold text-sm hover:text-slate-600 transition-colors disabled:opacity-50"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  );
}