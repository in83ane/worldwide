import '../globals.css'
import Sidebar from '../../components/Sidebar'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Worldwide',
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      {/*
        mobile  : ไม่มี pl (sidebar อยู่ข้างล่าง) + pb เผื่อ bottom nav (≈80px + safe area)
        desktop : pl-20 เว้นที่ sidebar ซ้าย + pb-0 ปกติ
        หน้าย่อยแต่ละหน้าจัดการ padding/max-width ของตัวเองได้เลย
      */}
      <main className="min-h-dvh lg:pl-20 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0">
        {children}
      </main>
    </>
  )
}