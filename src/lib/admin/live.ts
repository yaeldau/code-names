import type { SupabaseClient } from '@supabase/supabase-js'
import type { GameStatus, Team } from '@/types/game'
import { ONLINE_THRESHOLD_SECONDS } from '@/lib/presence/shared'

/**
 * Live dashboard data for /admin/live (E1). Read with the service role through
 * analytics_dashboard() — counts and per-game aggregates only. There are no
 * visitor identifiers anywhere: live numbers count open tabs, history counts
 * visits (tab sessions) — never unique people.
 */

export interface LiveRoom {
  code: string
  status: GameStatus
  current_team: Team
  tabs: number
  visible_tabs: number
  last_activity: string
}

export interface LiveSnapshot {
  generated_at: string
  online_seconds: number
  tabs_online: number
  visible_tabs_online: number
  tabs_in_games: number
  occupied_rooms: number
  occupied_rooms_in_progress: number
  visits_today: number
  visits_7d: number
  visits_30d: number
  visits_total: number
  room_entries_today: number
  room_entries_7d: number
  room_entries_30d: number
  games_created_today: number
  games_created_7d: number
  games_created_30d: number
  /** First day with recorded statistics (YYYY-MM-DD), or null if none yet. */
  tracking_since: string | null
  beats_today: number
  daily_beat_cap: number
  paused: boolean
  rooms: LiveRoom[]
}

export type LiveResult =
  | { state: 'ok'; data: LiveSnapshot; gamesNotFinished: number | null }
  /** The analytics migration isn't applied here yet. */
  | { state: 'unavailable' }
  /** Query failed — must be shown as an error, never as zeros. */
  | { state: 'error' }

const NUMBER_FIELDS = [
  'online_seconds', 'tabs_online', 'visible_tabs_online', 'tabs_in_games', 'occupied_rooms', 'occupied_rooms_in_progress',
  'visits_today', 'visits_7d', 'visits_30d', 'visits_total', 'room_entries_today', 'room_entries_7d', 'room_entries_30d',
  'games_created_today', 'games_created_7d', 'games_created_30d', 'beats_today', 'daily_beat_cap',
] as const

/** Defensive shape check of the function's JSON (never trust it blindly). */
export function parseLiveSnapshot(raw: unknown): LiveSnapshot | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.generated_at !== 'string' || Number.isNaN(Date.parse(r.generated_at))) return null
  for (const f of NUMBER_FIELDS) if (typeof r[f] !== 'number' || !Number.isFinite(r[f] as number)) return null
  if (typeof r.paused !== 'boolean') return null
  if (r.tracking_since !== null && typeof r.tracking_since !== 'string') return null
  if (!Array.isArray(r.rooms)) return null
  const rooms: LiveRoom[] = []
  for (const x of r.rooms) {
    if (typeof x !== 'object' || x === null) return null
    const o = x as Record<string, unknown>
    if (typeof o.code !== 'string' || typeof o.status !== 'string' || typeof o.current_team !== 'string'
      || typeof o.tabs !== 'number' || typeof o.visible_tabs !== 'number' || typeof o.last_activity !== 'string') return null
    rooms.push({
      code: o.code, status: o.status as GameStatus, current_team: o.current_team as Team,
      tabs: o.tabs, visible_tabs: o.visible_tabs, last_activity: o.last_activity,
    })
  }
  return { ...(r as unknown as LiveSnapshot), rooms }
}

export async function getLiveSnapshot(service: SupabaseClient): Promise<LiveResult> {
  const [dash, games] = await Promise.all([
    service.rpc('analytics_dashboard', { p_online_seconds: ONLINE_THRESHOLD_SECONDS }),
    service.from('games').select('id', { count: 'exact', head: true }).neq('status', 'finished'),
  ])
  if (dash.error) {
    // PGRST202: function not found (migration not applied in this environment).
    if (dash.error.code === 'PGRST202' || dash.error.code === '42883') return { state: 'unavailable' }
    console.error('[admin] live dashboard query failed', dash.error.code)
    return { state: 'error' }
  }
  const data = parseLiveSnapshot(dash.data)
  if (!data) {
    console.error('[admin] live dashboard returned an unexpected shape')
    return { state: 'error' }
  }
  return { state: 'ok', data, gamesNotFinished: games.error ? null : games.count ?? null }
}

/** Freshness of a snapshot as seen by the browser. */
export function freshness(generatedAtIso: string, nowMs: number, staleAfterMs = 40_000): { ageSeconds: number; stale: boolean } {
  const age = Math.max(0, nowMs - Date.parse(generatedAtIso))
  return { ageSeconds: Math.round(age / 1000), stale: age > staleAfterMs }
}
