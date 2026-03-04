import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

export async function middleware(req: NextRequest) {
  // 1. สร้าง Response Object เบื้องต้น
  const res = NextResponse.next({
    request: {
      headers: req.headers,
    },
  })

  // 2. สร้าง Supabase Client สำหรับ Middleware
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          res.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          res.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // 3. ตรวจสอบ Session ของผู้ใช้
  const { data: { user } } = await supabase.auth.getUser()
  const path = req.nextUrl.pathname

  // ==========================================================
  // 4. การจัดการสิทธิ์ (Access Control Logic)
  // ==========================================================

  // รายชื่อหน้าที่ต้อง "Admin เท่านั้น" ถึงจะเข้าได้
  const adminOnlyPaths = ['/employees', '/departments', '/price']
  
  // รายชื่อหน้าที่ "User ทั่วไป" และ "Admin" เข้าได้ (ต้อง Login ก่อน)
  const userPaths = ['/home', '/calendar', '/settings']

  const isProtectedRoute = [...adminOnlyPaths, ...userPaths].some(p => path.startsWith(p))
  const isAdminPath = adminOnlyPaths.some(p => path.startsWith(p))

  // กรณีที่ 1: พยายามเข้าหน้าที่มีการป้องกัน แต่ยังไม่ได้ Login
  if (isProtectedRoute && !user) {
    const url = req.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  // กรณีที่ 2: Login เรียบร้อยแล้ว
  if (user) {
    // ดึงข้อมูล Profile เพื่อเช็ค Role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const isAdmin = profile?.role === 'admin'

    // *** หัวใจสำคัญ: ถ้าเข้าหน้า Admin แต่คนเข้าไม่ใช่ Admin ให้เตะกลับไปหน้า Home ***
    if (isAdminPath && !isAdmin) {
      const url = req.nextUrl.clone()
      url.pathname = '/home'
      return NextResponse.redirect(url)
    }

    // ถ้า Login อยู่แล้ว จะพยายามเข้าหน้า Login/Register ให้ส่งไปหน้า Home
    if (path.startsWith('/auth/login') || path.startsWith('/auth/register')) {
      const url = req.nextUrl.clone()
      url.pathname = '/home'
      return NextResponse.redirect(url)
    }
  }

  return res
}

// 5. กำหนด Matcher เพื่อระบุว่า Middleware นี้จะทำงานใน Path ไหนบ้าง
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}