import { createClient } from '@/lib/supabase/server'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import LogoutButton from '@/components/ui/LogoutButton'
import { Mail, ShieldCheck, Settings as SettingsIcon } from 'lucide-react'

function initials(nameOrEmail?: string) {
  if (!nameOrEmail) return 'U'
  const base = nameOrEmail.includes(' ')
    ? nameOrEmail.split(' ').slice(0, 2).join(' ')
    : nameOrEmail.split('@')[0]
  const [a = '', b = ''] = base.split(' ')
  return (a[0] + (b[0] ?? '')).toUpperCase()
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user?.id)
    .single()

  const name = (user?.user_metadata?.full_name as string) || user?.email || 'User'
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined
  const role = profile?.role || 'user'

  return (
    <div className="min-h-screen bg-slate-50/50 flex justify-center p-4 md:p-8">
      <div className="w-full max-w-3xl">

        <header className="mb-10">
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 flex items-center gap-3">
            <div className="p-3 bg-slate-900 rounded-2xl text-white">
              <SettingsIcon size={28} />
            </div>
            การตั้งค่า
          </h1>
          <p className="text-slate-500 font-bold mt-2 ml-1">จัดการข้อมูลส่วนตัวและบัญชีของคุณ</p>
        </header>

        <section className="bg-white rounded-[2.5rem] border-2 border-slate-100 p-6 md:p-8 shadow-sm overflow-hidden relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-bl-[5rem] -z-0 opacity-50" />

          <div className="relative z-10 flex flex-col md:flex-row items-center gap-6 md:gap-8">
            <div className="relative">
              <Avatar className="h-24 w-24 border-4 border-white shadow-xl">
                <AvatarImage src={avatarUrl} alt={name} />
                <AvatarFallback className="bg-slate-900 text-white text-2xl font-black">
                  {initials(name)}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1 bg-emerald-500 border-4 border-white w-7 h-7 rounded-full" />
            </div>

            <div className="flex-1 text-center md:text-left">
              <div className="flex flex-col md:flex-row md:items-center gap-2 mb-1">
                <h2 className="text-2xl font-black text-slate-900">{name}</h2>
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest w-fit mx-auto md:mx-0">
                  <ShieldCheck size={12} className="mr-1" /> {role}
                </span>
              </div>
              <p className="text-slate-500 font-bold flex items-center justify-center md:justify-start gap-2">
                <Mail size={16} /> {user?.email}
              </p>
            </div>

            <div className="w-full md:w-auto">
              <LogoutButton />
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}