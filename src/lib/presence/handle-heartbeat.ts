import type { SupabaseClient } from '@supabase/supabase-js'
import { parsePresencePayload } from './shared'

/**
 * /api/presence core (D1/E1). Framework-free so it can be exercised against a
 * real local database in integration tests.
 *
 * Privacy/trust model:
 * - No cookie is read or set and nothing is stored in the browser. A tab is
 *   identified only by a random id that lives in the page's memory.
 * - The body is strictly validated; the database sets every timestamp.
 * - New tab ids are rate-limited per keyed IP bucket inside the database.
 * - Writes go through analytics_heartbeat() with the service role; the browser
 *   has no access to the analytics tables at all.
 * - A daily request budget / kill switch answers 'paused' → 429, which stops
 *   the beacon for the rest of the page load.
 */

export const MAX_BODY_BYTES = 1_024

/**
 * Per-server-instance memory of "presence is paused" (budget exhausted or kill
 * switch on). While set, requests are answered 429 without touching the
 * database. It does NOT avoid the serverless invocation itself — every request
 * that reaches /api/presence is a billed invocation whatever it returns.
 */
export interface PauseMemo {
  isPaused: () => boolean
  trip: () => void
}
export const PAUSE_MEMO_MS = 5 * 60_000
export function createPauseMemo(ttlMs = PAUSE_MEMO_MS, now: () => number = Date.now): PauseMemo {
  let until = 0
  return { isPaused: () => now() < until, trip: () => { until = now() + ttlMs } }
}

export interface HeartbeatResult {
  status: number
  body: Record<string, unknown>
}

export async function handleHeartbeat(opts: {
  service: SupabaseClient
  rawBody: string
  /** Keyed, daily-rotating IP hash (see ip-bucket.ts). */
  ipBucket: string
  pauseMemo?: PauseMemo
}): Promise<HeartbeatResult> {
  if (opts.pauseMemo?.isPaused()) return { status: 429, body: { status: 'paused' } }
  if (new TextEncoder().encode(opts.rawBody).length > MAX_BODY_BYTES) return { status: 413, body: { error: 'too_large' } }

  let parsed: unknown
  try {
    parsed = JSON.parse(opts.rawBody)
  } catch {
    return { status: 400, body: { error: 'bad_request' } }
  }
  const payload = parsePresencePayload(parsed)
  if (!payload) return { status: 400, body: { error: 'bad_request' } }

  const { data, error } = await opts.service.rpc('analytics_heartbeat', {
    p_tab: payload.tabId,
    p_page: payload.page,
    p_game_code: payload.gameCode,
    p_visible: payload.visible,
    p_ip_bucket: opts.ipBucket,
    p_leave: payload.leave ?? false,
  })
  if (error) {
    // 22023 = our own validation in the function (e.g. malformed game code).
    if (error.code === '22023') return { status: 400, body: { error: 'bad_request' } }
    // Function missing = migration not applied here: permanent, tell the beacon to stop.
    if (error.code === 'PGRST202' || error.code === '42883') return { status: 404, body: { error: 'not_enabled' } }
    // Anything else is treated as transient (503): the beacon keeps its normal cadence.
    return { status: 503, body: { error: 'unavailable' } }
  }
  // Over budget, switched off, or too many new tabs from one network: stop this page load.
  if (data === 'paused') {
    opts.pauseMemo?.trip()
    return { status: 429, body: { status: data } }
  }
  if (data === 'rate_limited') return { status: 429, body: { status: data } }
  return { status: 200, body: { status: data as string } }
}
