import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

async function cookieAdapter() {
  const cookieStore = await cookies()
  return {
    getAll: () => cookieStore.getAll(),
    setAll: (
      cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]
    ) => {
      try {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2])
        })
      } catch {
        // No-op when called from a Server Component
      }
    },
  }
}

export async function createClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: await cookieAdapter() }
  )
}

/** Service-role client for mutations that bypass RLS (Server Actions only). */
export async function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: await cookieAdapter() }
  )
}
