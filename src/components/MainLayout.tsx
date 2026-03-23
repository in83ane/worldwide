// src/components/MainLayout.tsx
// ครอบทุกหน้าที่มี Sidebar แทน hardcode pl-20 ตรงๆ
// Desktop : padding-left 80px (sidebar width)
// Mobile/Tablet : padding-bottom 80px (bottom nav height)

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="
      min-h-dvh
      lg:pl-20
      pb-[calc(5rem+env(safe-area-inset-bottom))]
      lg:pb-0
    ">
      {children}
    </main>
  )
}