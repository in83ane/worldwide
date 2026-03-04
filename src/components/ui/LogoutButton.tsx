'use client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

export default function LogoutButton() {
  const router = useRouter()
  const onClick = async () => {
    await fetch('/auth/logout', { method: 'POST' })
    router.replace('/auth/login')
  }
  return (
    <Button variant="outline" onClick={onClick}>
      <LogOut className="mr-2 h-4 w-4" />
      Logout
    </Button>
  )
}
