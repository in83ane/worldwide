'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from 'next/navigation' // เพิ่ม useRouter สำหรับการ Redirect

// ตรวจสอบให้แน่ใจว่าคุณได้สร้างตาราง 'profiles' ที่มีคอลัมน์ 'id' และ 'role' แล้ว

export default function AuthPage() {
  const supabase = createClient()
  const router = useRouter() // สร้าง instance ของ router
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isLogin, setIsLogin] = useState(true)

  const handleAuth = async () => {
    setLoading(true)
    setError(null)

    // 1. Validation เบื้องต้น
    if (!email || !password) {
      setError('กรุณากรอก Email และ Password')
      setLoading(false)
      return
    }

    if (!isLogin && password !== confirmPassword) {
      setError('Password ไม่ตรงกัน')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Password ต้องมีอย่างน้อย 6 ตัวอักษร')
      setLoading(false)
      return
    }

    try {
      let response
      
      if (isLogin) {
        // 2. Login
        response = await supabase.auth.signInWithPassword({
          email,
          password,
        })
      } else {
        // 3. Register: สร้างผู้ใช้ใน auth.users
        response = await supabase.auth.signUp({
          email,
          password,
          options: {
            // ใช้ window.location.origin สำหรับการ Redirect ที่ถูกต้อง
            emailRedirectTo: `${window.location.origin}/home`,
          },
        })

        // จัดการ Auth error ทันที
        if (response.error) {
          throw response.error
        }
        
        // 4. บันทึกข้อมูล Profile (Role) ลงในตาราง profiles
        const user = response.data.user
        if (user) {
          // ใช้ insert เพื่อเพิ่มแถวใหม่ในตาราง profiles
          const { error: dbError } = await supabase.from('profiles').insert([
            { 
              id: user.id, 
              email: user.email,
              role: 'user', // กำหนด role เริ่มต้นเป็น 'user'
            },
          ])

          if (dbError) {
            // หาก Insert ล้มเหลว ให้แสดง error จาก DB และหยุด
            console.error('Database Insert Error:', dbError)
            // ข้อความนี้จะช่วยให้คุณ debug ปัญหา RLS/Schema
            throw new Error(`Database error saving new user: ${dbError.message}. ตรวจสอบ RLS Policy สำหรับ INSERT บนตาราง profiles`)
          }
        }
      }

      // 5. จัดการ Success และ Redirect/Alert
      if (response.error) {
        // จัดการ error จาก Login หรือ Auth error อื่นๆ
        if (response.error.message.includes('already registered')) {
          setError('Email นี้สมัครไปแล้ว')
        } else if (response.error.message.includes('invalid email')) {
          setError('Email ไม่ถูกต้อง')
        } else {
          setError(response.error.message)
        }
      } else {
        // Success
        if (isLogin) {
          // หาก Login สำเร็จ ใช้วิธี Redirect ของ Next.js
          router.push('/home')
        } else {
          // หาก Register สำเร็จและ Insert DB สำเร็จ
          alert('สมัครสมาชิกสำเร็จ! โปรดยืนยัน Email ของคุณ')
          setIsLogin(true)
        }
      }
    // ***************************************************************
    // ** จุดที่ทำการแก้ไข: เปลี่ยน 'any' เป็น 'unknown' และจัดการ Type **
    // ***************************************************************
    } catch (err: unknown) { 
      // จับ error ที่ throw มาจากทั้ง Auth และ Database Insert และจัดการ type 'unknown'
      
      let errorMessage = 'เกิดข้อผิดพลาดบางอย่าง'
      
      // ตรวจสอบว่า err เป็น object ที่มี property message หรือไม่
      if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
          errorMessage = (err as { message: string }).message
      } else if (err instanceof Error) {
          errorMessage = err.message
      }
      
      // หากข้อความ error เกี่ยวกับ RLS ให้ระบุชัดเจน
      if (errorMessage.includes('Row Level Security')) {
          errorMessage = "ข้อผิดพลาดด้านความปลอดภัย: ตรวจสอบ RLS Policy ในตาราง Profiles"
      }
      
      setError(errorMessage)

    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-dvh grid place-items-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">{isLogin ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}</CardTitle>
        </CardHeader>
        
        <div className="p-6 pt-0">
          <div className="space-y-4">
            <div>
              <Label htmlFor="email" className="block mb-1">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@email.com"
              />
            </div>
            <div>
              <Label htmlFor="password" className="block mb-1">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="รหัสผ่าน"
              />
            </div>

            {!isLogin && (
              <div>
                <Label htmlFor="confirmPassword" className="block mb-1">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="ยืนยันรหัสผ่าน"
                />
              </div>
            )}

            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
          </div>

          <CardFooter className="p-0 pt-6 flex flex-col items-center">
            <Button className="w-full" onClick={handleAuth} disabled={loading}>
              {loading ? 'กำลังโหลด...' : isLogin ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
            </Button>

            <p className="text-center text-sm mt-4">
              {isLogin ? (
                <>
                  ยังไม่มีบัญชี?{' '}
                  <button type="button" className="text-blue-500 hover:underline" onClick={() => setIsLogin(false)}>
                    สมัครสมาชิก
                  </button>
                </>
              ) : (
                <>
                  มีบัญชีแล้ว?{' '}
                  <button type="button" className="text-blue-500 hover:underline" onClick={() => setIsLogin(true)}>
                    เข้าสู่ระบบ
                  </button>
                </>
              )}
            </p>
          </CardFooter>
        </div>
      </Card>
    </main>
  )
}