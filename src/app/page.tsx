// app/page.tsx

// 1. นำเข้าฟังก์ชัน redirect จาก next/navigation
import { redirect } from 'next/navigation';

export default function RootPage() {
  // 2. เรียกใช้ฟังก์ชัน redirect และระบุเส้นทางไปยังหน้า Login
  // ซึ่งจากโครงสร้างไฟล์ของคุณคือ /auth/login
  redirect('/auth/login');
  
  // (Note: คุณไม่จำเป็นต้อง return อะไรก็ได้เมื่อใช้ redirect)
}