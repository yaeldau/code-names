import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createPauseMemo, handleHeartbeat } from '@/lib/presence/handle-heartbeat'
import { ipBucket, presenceSecretConfigured } from '@/lib/presence/ip-bucket'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Off unless explicitly enabled (build-time flag), so this can ship before the
// migration exists. When off, the beacon isn't rendered and this route 404s.
const ENABLED = process.env.NEXT_PUBLIC_PRESENCE_ENABLED === 'true'
// Once the daily budget is exhausted (or the kill switch is on), this instance
// stops querying the database for a few minutes. Invocations still count.
const pauseMemo = createPauseMemo()

export async function POST(request: Request) {
  if (!ENABLED) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey || !presenceSecretConfigured()) {
    // Misconfiguration is permanent for this deployment: 404 makes the beacon stop.
    return NextResponse.json({ error: 'not_enabled' }, { status: 404 })
  }

  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const bucket = await ipBucket(ip)
    if (!bucket) return NextResponse.json({ error: 'not_enabled' }, { status: 404 })
    const result = await handleHeartbeat({
      service: createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }),
      rawBody: await request.text(),
      ipBucket: bucket,
      pauseMemo,
    })
    const response = NextResponse.json(result.body, { status: result.status })
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (err) {
    console.error('[presence] unhandled error', err instanceof Error ? err.message : 'unknown')
    return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  }
}
