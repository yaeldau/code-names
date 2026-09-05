'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ADMIN_SESSION_COOKIE, createAdminSessionValue, timingSafeEqual } from '@/lib/admin/session'

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/admin',
    maxAge,
  }
}

export async function adminLogin(formData: FormData) {
  const password = String(formData.get('password') ?? '')
  const expected = process.env.ADMIN_PASSWORD

  // No configured password means login can never succeed — fail closed rather
  // than comparing against an empty string.
  if (!expected || !timingSafeEqual(password, expected)) {
    redirect('/admin/login?error=1')
  }

  const { value, maxAge } = await createAdminSessionValue()
  const cookieStore = await cookies()
  cookieStore.set(ADMIN_SESSION_COOKIE, value, cookieOptions(maxAge))

  redirect('/admin')
}

export async function adminLogout() {
  const cookieStore = await cookies()
  cookieStore.set(ADMIN_SESSION_COOKIE, '', cookieOptions(0))
  redirect('/admin/login')
}