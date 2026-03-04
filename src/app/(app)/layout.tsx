import '../globals.css'
import Sidebar from '../../components/Sidebar'
// import Topbar from '../../components/Topbar' // ⚠️ หากลบ Topbar ออกแล้ว ให้ลบการ import นี้ทิ้งไปเลย
import type { Metadata } from 'next'

// กำหนด metadata object
export const metadata: Metadata = {
  title: 'Worldwide', // กำหนดชื่อแท็บตรงนี้
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />

      {/* 1. แก้ไข: แทนที่ p-6 ด้วย px-6 pt-0 pb-6 เพื่อลบ Padding ด้านบนของ Main Layout */}
      {/* min-h-dvh คือ ความสูงของหน้าจอทั้งหมด, pl-24 คือ space สำหรับ Sidebar */}
      <main className="min-h-dvh pl-24 px-6 pt-0 pb-6"> 

        {/* 2. แก้ไข: ลบ p-6 ออกจาก Div ภายใน เพราะหน้าย่อยจะกำหนด Padding เอง */}
        <div className="mx-auto max-w-full rounded-2xl bg-white shadow-sm min-h-[70vh]">
          {children}
        </div>
      </main>
    </>
  )
}