import '../globals.css'
import Sidebar from '../components/Sidebar'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Worldwide',
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />

      {/* 
        mobile  : ไม่มี pl (sidebar อยู่ข้างล่าง) + pb เผื่อ bottom nav
        desktop : pl-24 เพื่อเว้นที่ sidebar ซ้าย + pb กลับเป็น pb-6 ปกติ
      */}
      <main className="min-h-dvh px-4 pt-0 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pl-24 lg:pr-6 lg:pb-6">
        <div className="mx-auto max-w-full rounded-2xl bg-white shadow-sm min-h-[70vh]">
          {children}
        </div>
      </main>
    </>
  )
}