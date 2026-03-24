import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // ตรวจสอบ User (ใช้ getUser เพื่อความปลอดภัยสูงสุด)
  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  // กำหนดเส้นทาง
  const adminOnlyPaths = ['/employees', '/departments', '/price']
  const userPaths = ['/home', '/calendar', '/settings', '/map']
  const isAdminPath = adminOnlyPaths.some(p => path.startsWith(p))
  const isProtectedRoute = isAdminPath || userPaths.some(p => path.startsWith(p))

  // 1. ถ้าพยายามเข้าหน้าที่ต้องล็อกอิน แต่ยังไม่ได้ล็อกอิน
  if (!user && isProtectedRoute) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  // 2. ถ้าล็อกอินแล้ว
  if (user) {
    // เช็ค Role จาก Database (แนะนำให้เปลี่ยนไปใช้ Custom Claims ในอนาคตเพื่อความเร็ว)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const isAdmin = profile?.role === 'admin'

    // ถ้าเข้าหน้า Admin แต่ไม่ใช่ Admin -> ส่งไปหน้า Home
    if (isAdminPath && !isAdmin) {
      return NextResponse.redirect(new URL('/home', request.url))
    }

    // ถ้าล็อกอินอยู่แล้ว จะเข้าหน้า Login/Register -> ส่งไปหน้า Home
    if (path.startsWith('/auth/login') || path.startsWith('/auth/register')) {
      return NextResponse.redirect(new URL('/home', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}