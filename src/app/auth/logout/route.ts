import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const { origin } = new URL(req.url)
  return NextResponse.redirect(`${origin}/auth/login`)
}
