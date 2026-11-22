/**
 * D1/E1 presence analytics — integration tests against an ISOLATED local
 * Supabase (real PostgREST, real grants/RLS, migration 012). Exercises the real
 * /api/presence logic (handleHeartbeat) and the real dashboard query.
 * Skipped unless SUPABASE_TEST_* is set; refuses any non-localhost URL.
 * Fixture time travel (moving last_seen back) is done with the service role,
 * which is test setup — clients can never do this.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createPauseMemo, handleHeartbeat } from '@/lib/presence/handle-heartbeat'
import { getLiveSnapshot, type LiveSnapshot } from '@/lib/admin/live'
import type { CardType } from '@/types/game'

const url = process.env.SUPABASE_TEST_URL ?? ''
const anonKey = process.env.SUPABASE_TEST_ANON_KEY ?? ''
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? ''
const isLocal = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)
const describeIntegration = url && anonKey && serviceKey && isLocal && process.env.SUPABASE_TEST_NO_012 !== '1' ? describe : describe.skip

const TYPES: CardType[] = [...Array<CardType>(9).fill('red'), ...Array<CardType>(8).fill('blue'), ...Array<CardType>(7).fill('neutral'), 'assassin']
const uuid = () => crypto.randomUUID()
/** A random 64-hex bucket, standing in for the keyed IP hash the route computes. */
const bucket = () => (uuid() + uuid()).replace(/-/g, '').slice(0, 64)

describeIntegration('D1/E1 presence — local Supabase', () => {
  let service: SupabaseClient
  let anon: SupabaseClient
  const tabs: string[] = []
  const gameCodes: string[] = []

  beforeAll(() => {
    service = createClient(url, serviceKey, { auth: { persistSession: false } })
    anon = createClient(url, anonKey, { auth: { persistSession: false } })
  })
  afterAll(async () => {
    if (tabs.length) await service.from('analytics_presence').delete().in('tab_id', tabs)
    if (gameCodes.length) await service.from('games').delete().in('code', gameCodes)
    await service.from('analytics_settings').update({ daily_beat_cap: 8000, paused: false }).eq('id', true)
  })

  /** Sends one heartbeat for a tab, like the route would (no cookies exist). */
  async function beat(body: Record<string, unknown>, ip = bucket()) {
    if (typeof body.tabId === 'string') tabs.push(body.tabId)
    return handleHeartbeat({ service, rawBody: JSON.stringify(body), ipBucket: ip })
  }
  const at = (tabId: string, page: string, gameCode: string | null = null, visible = true) => ({ tabId, page, gameCode, visible })

  async function newGame(status: 'active' | 'finished' = 'active') {
    const { data, error } = await anon.rpc('create_game', { p_words: TYPES.map((_, i) => `w${i}`), p_types: TYPES })
    if (error) throw error
    gameCodes.push(data.code)
    if (status === 'finished') await service.from('games').update({ status: 'finished', winner: 'red' }).eq('code', data.code)
    return data.code as string
  }
  async function snap(): Promise<LiveSnapshot> {
    const r = await getLiveSnapshot(service)
    if (r.state !== 'ok') throw new Error(`dashboard ${r.state}`)
    return r.data
  }
  const room = (s: LiveSnapshot, code: string) => s.rooms.find((r) => r.code === code)
  const rowOf = async (tabId: string) =>
    (await service.from('analytics_presence').select('*').eq('tab_id', tabId).maybeSingle()).data

  // ── Identity & history ───────────────────────────────────────────────────

  it('a first beat counts one visit; nothing identifies the browser (no cookie, no visitor id)', async () => {
    const before = await snap()
    const r = await beat(at(uuid(), 'home'))
    expect(r).toEqual({ status: 200, body: { status: 'ok' } }) // the result type has no cookie at all
    const after = await snap()
    expect(after.visits_today).toBe(before.visits_today + 1)
    expect(after.visits_total).toBe(before.visits_total + 1)
    expect(after.tracking_since).not.toBeNull()
  })

  it('a reload (new in-memory tab id) is a new visit — visits are not people', async () => {
    const before = (await snap()).visits_today
    await beat(at(uuid(), 'home'))
    await beat(at(uuid(), 'home'))
    expect((await snap()).visits_today).toBe(before + 2)
  })

  it('stored columns hold no identifier beyond the random tab id; history is numbers only', async () => {
    const tab = uuid()
    await beat(at(tab, 'home'))
    expect(Object.keys((await rowOf(tab))!).sort()).toEqual(['first_seen', 'game_id', 'last_seen', 'left_at', 'page', 'tab_id', 'visible'])
    const { data } = await service.from('analytics_daily').select('*').limit(1).single()
    expect(Object.keys(data!).sort()).toEqual(['beats', 'day', 'room_entries', 'visits'])
  })

  // ── Occupancy ─────────────────────────────────────────────────────────────

  it('two tabs in a room = 2 tabs; entering and moving between rooms counts room entries', async () => {
    const g1 = await newGame()
    const g2 = await newGame()
    const before = await snap()
    const t1 = uuid()
    await beat(at(t1, 'game', g1))
    await beat(at(uuid(), 'game', g1, false))
    let s = await snap()
    expect(room(s, g1)).toMatchObject({ tabs: 2, visible_tabs: 1 })
    expect(s.tabs_in_games).toBe(before.tabs_in_games + 2)
    await beat(at(t1, 'game', g2)) // same tab moves to another game
    s = await snap()
    expect(room(s, g1)).toMatchObject({ tabs: 1 })
    expect(room(s, g2)).toMatchObject({ tabs: 1 })
    expect(s.room_entries_today).toBe(before.room_entries_today + 3)
    await beat(at(t1, 'game', g2, false)) // only visibility changed: no new entry
    expect((await snap()).room_entries_today).toBe(before.room_entries_today + 3)
  })

  it('a stale heartbeat drops out of the live counts; the next heartbeat restores it', async () => {
    const code = await newGame()
    const tab = uuid()
    await beat(at(tab, 'game', code))
    await service.from('analytics_presence').update({ last_seen: new Date(Date.now() - 300_000).toISOString() }).eq('tab_id', tab)
    expect(room(await snap(), code)).toBeUndefined()
    await beat(at(tab, 'game', code))
    expect(room(await snap(), code)).toMatchObject({ tabs: 1 })
  })

  it('a finished game can have viewers without counting as a game in progress', async () => {
    const code = await newGame('finished')
    const before = await snap()
    await beat(at(uuid(), 'game', code))
    const after = await snap()
    expect(room(after, code)).toMatchObject({ status: 'finished', tabs: 1 })
    expect(after.occupied_rooms).toBe(before.occupied_rooms + 1)
    expect(after.occupied_rooms_in_progress).toBe(before.occupied_rooms_in_progress)
  })

  it('games created today/7d/30d come from the games table', async () => {
    const before = await snap()
    await newGame()
    const after = await snap()
    expect(after.games_created_today).toBe(before.games_created_today + 1)
    expect(after.games_created_30d).toBe(before.games_created_30d + 1)
  })

  // ── Leave / tombstone ─────────────────────────────────────────────────────

  it('hidden tab is still online (until it expires) and counted as not visible; leave removes it', async () => {
    const tab = uuid()
    await beat(at(tab, 'home'))
    await beat(at(tab, 'home', null, false))
    expect(await rowOf(tab)).toMatchObject({ visible: false })
    const before = await snap()
    expect((await beat({ ...at(tab, 'home', null, false), leave: true })).body).toEqual({ status: 'left' })
    expect((await snap()).tabs_online).toBe(before.tabs_online - 1)
  })

  it('leave racing a regular beat (both in flight at navigation) always ends as left — 20 rounds', async () => {
    const code = await newGame()
    for (let i = 0; i < 20; i++) {
      const tab = uuid()
      await beat(at(tab, 'game', code))
      await new Promise((r) => setTimeout(r, 5_100 / 20))
      await Promise.all([beat({ ...at(tab, 'game', code), leave: true }), beat(at(tab, 'game', code, false))])
      expect((await rowOf(tab))?.left_at, `round ${i}`).not.toBeNull()
    }
    expect(room(await snap(), code)).toBeUndefined()
  })

  it('a leave that overtakes the tab’s first beat wins, and no visit is counted', async () => {
    const code = await newGame()
    const tab = uuid()
    const before = (await snap()).visits_today
    await beat({ ...at(tab, 'game', code), leave: true })
    expect((await beat(at(tab, 'game', code))).body).toEqual({ status: 'left' })
    expect(room(await snap(), code)).toBeUndefined()
    expect((await snap()).visits_today).toBe(before)
  })

  it('a beat already in flight when the tab closed cannot resurrect it; a later one (bfcache restore) can', async () => {
    const code = await newGame()
    const tab = uuid()
    await beat(at(tab, 'game', code))
    await beat({ ...at(tab, 'game', code), leave: true })
    expect((await beat(at(tab, 'game', code))).body).toEqual({ status: 'left' })
    expect(room(await snap(), code)).toBeUndefined()
    await service.from('analytics_presence').update({ left_at: new Date(Date.now() - 10_000).toISOString() }).eq('tab_id', tab)
    const visits = (await snap()).visits_today
    expect((await beat(at(tab, 'game', code))).body).toEqual({ status: 'ok' })
    const s = await snap()
    expect(room(s, code)).toMatchObject({ tabs: 1 })
    expect(s.visits_today).toBe(visits) // restored page, not a new visit
  })

  // ── Retention ─────────────────────────────────────────────────────────────

  it('retention: a new tab triggers cleanup of tabs >1 h old and presence buckets >1 h old; feedback rows untouched', async () => {
    const old = uuid()
    await beat(at(old, 'home'))
    const longAgo = new Date(Date.now() - 2 * 3600_000).toISOString()
    await service.from('analytics_presence').update({ last_seen: longAgo }).eq('tab_id', old)
    await service.from('feedback_rate_limits').upsert({ ip_hash: 'presence-tab:test-old', window_start: longAgo, count: 1 })
    await service.from('feedback_rate_limits').upsert({ ip_hash: 'feedback-unrelated-test', window_start: longAgo, count: 1 })

    await beat(at(uuid(), 'home')) // any new tab runs the cleanup — no scheduler needed

    expect(await rowOf(old)).toBeNull()
    const buckets = (await service.from('feedback_rate_limits').select('ip_hash').in('ip_hash', ['presence-tab:test-old', 'feedback-unrelated-test'])).data!
    expect(buckets.map((b) => b.ip_hash)).toEqual(['feedback-unrelated-test'])
    await service.from('feedback_rate_limits').delete().eq('ip_hash', 'feedback-unrelated-test')
  })

  // ── Cost guard ────────────────────────────────────────────────────────────

  it('daily budget: once today’s requests exceed the cap every beat answers 429 (beacon stops); kill switch too', async () => {
    const tab = uuid()
    await beat(at(tab, 'home'))
    try {
      const used = (await snap()).beats_today
      await service.from('analytics_settings').update({ daily_beat_cap: used + 2 }).eq('id', true)
      expect((await beat(at(uuid(), 'home'))).status).toBe(200)
      expect((await beat(at(uuid(), 'home'))).status).toBe(200)
      expect(await beat(at(uuid(), 'home'))).toEqual({ status: 429, body: { status: 'paused' } })
      expect((await beat({ ...at(tab, 'home'), leave: true })).status).toBe(429)

      await service.from('analytics_settings').update({ daily_beat_cap: 1_000_000, paused: true }).eq('id', true)
      expect(await beat(at(uuid(), 'home'))).toEqual({ status: 429, body: { status: 'paused' } })
      expect((await snap()).paused).toBe(true)

      // Per-instance pause memory: after one 'paused' answer the database isn't queried at all.
      const memo = createPauseMemo(60_000)
      const beatsBefore = (await snap()).beats_today
      await service.from('analytics_settings').update({ paused: false, daily_beat_cap: beatsBefore }).eq('id', true)
      const first = await handleHeartbeat({ service, rawBody: JSON.stringify(at(uuid(), 'home')), ipBucket: bucket(), pauseMemo: memo })
      expect(first).toEqual({ status: 429, body: { status: 'paused' } })
      const afterFirst = (await snap()).beats_today
      for (let i = 0; i < 5; i++) {
        expect((await handleHeartbeat({ service, rawBody: JSON.stringify(at(uuid(), 'home')), ipBucket: bucket(), pauseMemo: memo })).status).toBe(429)
      }
      expect((await snap()).beats_today).toBe(afterFirst) // no DB writes while the memo is set
    } finally {
      await service.from('analytics_settings').update({ daily_beat_cap: 8000, paused: false }).eq('id', true)
    }
    expect((await beat(at(uuid(), 'home'))).status).toBe(200)
  })

  // ── Security ──────────────────────────────────────────────────────────────

  it('anon cannot read presence, history or settings, nor call the analytics functions', async () => {
    for (const t of ['analytics_presence', 'analytics_daily', 'analytics_settings']) {
      const r = await anon.from(t).select('*').limit(1)
      expect(r.error?.code, t).toBe('42501')
      expect(r.data).toBeNull()
    }
    expect((await anon.rpc('analytics_dashboard', { p_online_seconds: 120 })).error).not.toBeNull()
    expect((await anon.rpc('analytics_cleanup')).error).not.toBeNull()
    const h = await anon.rpc('analytics_heartbeat', { p_tab: uuid(), p_page: 'home', p_game_code: null, p_visible: true, p_ip_bucket: bucket() })
    expect(h.error).not.toBeNull()
  })

  it('anon cannot insert/update/delete presence, history or settings directly', async () => {
    const tab = uuid()
    await beat(at(tab, 'home'))
    const before = await rowOf(tab)
    expect((await anon.from('analytics_presence').insert({ tab_id: uuid(), page: 'home' })).error?.code).toBe('42501')
    expect((await anon.from('analytics_presence').update({ page: 'other' }).eq('tab_id', tab)).error?.code).toBe('42501')
    expect((await anon.from('analytics_presence').delete().eq('tab_id', tab)).error?.code).toBe('42501')
    expect((await anon.from('analytics_daily').update({ visits: 0 }).gte('visits', 0)).error?.code).toBe('42501')
    expect((await anon.from('analytics_settings').update({ paused: true }).eq('id', true)).error?.code).toBe('42501')
    expect(await rowOf(tab)).toEqual(before)
  })

  it('client timestamps are ignored — last_seen is the database clock', async () => {
    const tab = uuid()
    await beat({ ...at(tab, 'home'), lastSeen: '2099-01-01T00:00:00Z', last_seen: '2099-01-01T00:00:00Z' })
    expect(Math.abs(Date.parse((await rowOf(tab))!.last_seen) - Date.now())).toBeLessThan(60_000)
  })

  it('concurrent first beats of one tab create one row and count exactly one visit', async () => {
    const code = await newGame()
    const before = await snap()
    const tab = uuid()
    const results = await Promise.all(Array.from({ length: 10 }, () => beat(at(tab, 'game', code))))
    expect(results.every((r) => r.status === 200)).toBe(true)
    const { count } = await service.from('analytics_presence').select('tab_id', { count: 'exact', head: true }).eq('tab_id', tab)
    expect(count).toBe(1)
    const after = await snap()
    expect(after.visits_today).toBe(before.visits_today + 1)
    expect(after.room_entries_today).toBe(before.room_entries_today + 1)
  })

  it('malformed bodies / game codes / buckets are rejected; an unknown code is recorded as "other"', async () => {
    for (const bad of [
      'not json', JSON.stringify({ tabId: 'x', page: 'home', visible: true }),
      JSON.stringify({ tabId: uuid(), page: 'game', gameCode: "x'); drop", visible: true }),
      JSON.stringify({ tabId: uuid(), page: 'admin', gameCode: null, visible: true }),
      'x'.repeat(2000),
    ]) {
      expect([400, 413]).toContain((await handleHeartbeat({ service, rawBody: bad, ipBucket: bucket() })).status)
    }
    expect((await handleHeartbeat({ service, rawBody: JSON.stringify(at(uuid(), 'home')), ipBucket: 'not-a-hash' })).status).toBe(400)
    const tab = uuid()
    await beat(at(tab, 'game', 'ZZZZZZ'))
    expect(await rowOf(tab)).toMatchObject({ page: 'other', game_id: null })
  })

  it('abuse bounds: unchanged beats within 5 s are not written; new tab ids are rate-limited per IP bucket', async () => {
    const tab = uuid()
    await beat(at(tab, 'home'))
    expect((await beat(at(tab, 'home'))).body).toEqual({ status: 'throttled' })

    const ip = bucket()
    const statuses: number[] = []
    for (let i = 0; i < 122; i++) statuses.push((await beat(at(uuid(), 'home'), ip)).status)
    expect(statuses.slice(0, 120).every((s) => s === 200)).toBe(true)
    expect(statuses.slice(120)).toEqual([429, 429])
    expect((await beat(at(tab, 'home', null, false), ip)).status).toBe(200) // existing tabs keep working
    expect((await beat(at(uuid(), 'home'))).status).toBe(200) // other networks unaffected
  }, 60_000)
})

// Run with SUPABASE_TEST_NO_012=1 against a DB WITHOUT migration 012 (like
// production before the release): the route must answer 404 so beacons stop.
const describeNo012 = url && anonKey && serviceKey && isLocal && process.env.SUPABASE_TEST_NO_012 === '1' ? describe : describe.skip
describeNo012('D1/E1 presence — database without migration 012', () => {
  it('heartbeat → 404 not_enabled (permanent), nothing thrown; dashboard → unavailable', async () => {
    const service = createClient(url, serviceKey, { auth: { persistSession: false } })
    const r = await handleHeartbeat({
      service,
      rawBody: JSON.stringify({ tabId: crypto.randomUUID(), page: 'home', gameCode: null, visible: true }),
      ipBucket: bucket(),
    })
    expect(r).toEqual({ status: 404, body: { error: 'not_enabled' } })
    expect(await getLiveSnapshot(service)).toEqual({ state: 'unavailable' })
  })
})
