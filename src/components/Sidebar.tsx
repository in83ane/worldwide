'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Calendar, Settings, DollarSign } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// ตัวช่วยรวม class
function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export default function Sidebar() {
  const pathname = usePathname()
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // 1. โหลด role จาก Supabase
  useEffect(() => {
    const supabase = createClient()

    async function loadRole() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        setRole(profile?.role ?? 'user')
      }
      setLoading(false)
    }

    loadRole()
  }, [])

  // 2. รายการเมนู: อัปเดต href ของเช็คราคาเป็น /price
  const NAV = [
    { 
      href: '/home', 
      label: 'Home', 
      icon: Home 
    },
    { 
      href: '/price', // แก้ไขจาก /home/price เป็น /price
      label: 'เช็คราคา', 
      icon: DollarSign, 
      adminOnly: true 
    },
    { 
      href: '/calendar', 
      label: 'ตารางงาน', 
      icon: Calendar 
    },
    { 
      href: '/settings', 
      label: 'ตั้งค่า', 
      icon: Settings 
    },
  ]

  return (
    <aside className="fixed left-0 top-0 z-40 h-dvh w-20 border-r bg-white shadow-sm">
      <div className="flex h-full flex-col items-center">
        
        {/* ส่วนหัว: เว้นพื้นที่ว่างไว้ */}
        <div className="h-10 flex items-center justify-center" />

        {/* Navigation Menu */}
        <nav className="flex-1 w-full space-y-4 px-2 mt-4">
          {NAV.map(({ href, label, icon: Icon, adminOnly }) => {
            
            if (adminOnly && role !== 'admin') return null

            // เช็คสถานะ Active ให้ตรงกับ pathname
            const active = pathname === href || pathname?.startsWith(href + '/')
            
            return (
              <div key={href} className="relative group flex justify-center">
                <Link
                  href={href}
                  className={cx(
                    'flex items-center justify-center rounded-2xl w-14 h-14 transition-all duration-200 outline-none',
                    active
                      ? 'bg-slate-900 text-white shadow-lg shadow-slate-200'
                      : 'text-slate-400 hover:bg-slate-50 hover:text-slate-900'
                  )}
                >
                  <Icon size={24} strokeWidth={active ? 2.5 : 2} />
                </Link>

                {/* Tooltip */}
                <div
                  className={cx(
                    'absolute left-full top-1/2 z-50 ml-4 -translate-y-1/2',
                    'whitespace-nowrap rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xl',
                    'pointer-events-none opacity-0 transition-all duration-200 translate-x-[-10px] group-hover:opacity-100 group-hover:translate-x-0'
                  )}
                >
                  {label}
                  <div className="absolute right-full top-1/2 -translate-y-1/2 border-8 border-transparent border-r-slate-900"></div>
                </div>
              </div>
            )
          })}
        </nav>

        {/* ส่วนท้าย Sidebar */}
        <div className="pb-8">
           <div className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white shadow-sm" />
        </div>
      </div>
    </aside>
  )
}