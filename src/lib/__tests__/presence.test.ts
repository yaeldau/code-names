import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { classifyPath, parsePresencePayload, HEARTBEAT_INTERVAL_MS, ONLINE_THRESHOLD_SECONDS, type PresencePayload } from '@/lib/presence/shared'
import { ipBucket, presenceSecretConfigured } from '@/lib/presence/ip-bucket'
import { createPresenceController, MAX_BACKOFF_MS } from '@/lib/presence/client'
import { freshness, parseLiveSnapshot } from '@/lib/admin/live'
import { createPauseMemo, handleHeartbeat } from '@/lib/presence/handle-heartbeat'

const TAB = '11111111-2222-4333-8444-555555555555'

// ─── Protocol ───────────────────────────────────────────────────────────────

describe('classifyPath', () => {
  it('maps pages to categories', () => {
    expect(classifyPath('/')).toEqual({ page: 'home', gameCode: null })
    expect(classifyPath('/how-to-play')).toEqual({ page: 'how_to_play', gameCode: null })
    expect(classifyPath('/game/ab12cd')).toEqual({ page: 'game', gameCode: 'AB12CD' })
    expect(classifyPath('/something')).toEqual({ page: 'other', gameCode: null })
  })
  it('never forwards query strings (spymaster token) and rejects junk codes', () => {
    expect(classifyPath('/game/AB12CD?spymaster=secret')).toEqual({ page: 'game', gameCode: 'AB12CD' })
    expect(classifyPath('/game/<script>')).toEqual({ page: 'other', gameCode: null })
    expect(classifyPath('/game/AB12CD/extra')).toEqual({ page: 'other', gameCode: null })
  })
  it('the admin area never reports', () => {
    expect(classifyPath('/admin')).toBeNull()
    expect(classifyPath('/admin/live')).toBeNull()
    expect(classifyPath('/administrator')).toEqual({ page: 'other', gameCode: null })
  })
})

describe('parsePresencePayload', () => {
  const ok = { tabId: TAB, page: 'game', gameCode: 'AB12CD', visible: true }
  it('accepts a valid body', () => {
    expect(parsePresencePayload(ok)).toEqual({ ...ok, leave: false })
    expect(parsePresencePayload({ tabId: TAB, page: 'home', gameCode: null, visible: false, leave: true }))
      .toEqual({ tabId: TAB, page: 'home', gameCode: null, visible: false, leave: true })
  })
  it('rejects anything malformed', () => {
    for (const bad of [
      null, 'x', {}, { ...ok, tabId: 'not-a-uuid' }, { ...ok, page: 'admin' }, { ...ok, gameCode: 'ab12cd' },
      { ...ok, gameCode: "AB'; DROP" }, { ...ok, page: 'home' }, { ...ok, visible: 'yes' }, { ...ok, leave: 1 },
      { ...ok, page: 'game', gameCode: null },
    ]) expect(parsePresencePayload(bad)).toBeNull()
  })
  it('extra fields (e.g. a client timestamp) are ignored, never passed on', () => {
    const p = parsePresencePayload({ ...ok, lastSeen: '2099-01-01', visitorId: 'someone-else' })
    expect(p).toEqual({ ...ok, leave: false })
  })
})

// ─── Signed visitor cookie ──────────────────────────────────────────────────

describe('IP rate-limit bucket (no cookie, no stored identifier)', () => {
  const saved = { ...process.env }
  afterEach(() => { process.env = { ...saved } })
  const day1 = new Date('2026-11-22T10:00:00Z')
  const day1Later = new Date('2026-11-22T23:59:00Z')
  const day2 = new Date('2026-11-23T00:01:00Z')

  it('is a keyed hash (not a plain SHA-256 of the IP), stable within a UTC day', async () => {
    process.env.PRESENCE_SECRET = 'secret-x'
    const a = await ipBucket('203.0.113.7', day1)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await ipBucket('203.0.113.7', day1Later)).toBe(a)
    expect(await ipBucket('203.0.113.8', day1)).not.toBe(a)
    const { createHash } = await import('node:crypto')
    expect(a).not.toBe(createHash('sha256').update('203.0.113.7').digest('hex'))
  })

  it('rotates daily and per secret, so buckets cannot be linked across days', async () => {
    process.env.PRESENCE_SECRET = 'secret-x'
    const a = await ipBucket('203.0.113.7', day1)
    expect(await ipBucket('203.0.113.7', day2)).not.toBe(a)
    process.env.PRESENCE_SECRET = 'secret-y'
    expect(await ipBucket('203.0.113.7', day1)).not.toBe(a)
  })

  it('falls back to a key derived from ADMIN_SESSION_SECRET; no secret → disabled', async () => {
    delete process.env.PRESENCE_SECRET
    process.env.ADMIN_SESSION_SECRET = 'admin-secret'
    expect(presenceSecretConfigured()).toBe(true)
    expect(await ipBucket('1.2.3.4', day1)).toMatch(/^[0-9a-f]{64}$/)
    delete process.env.ADMIN_SESSION_SECRET
    expect(presenceSecretConfigured()).toBe(false)
    expect(await ipBucket('1.2.3.4', day1)).toBeNull()
  })
})

// ─── Heartbeat scheduling ───────────────────────────────────────────────────

function harness(opts: { visible?: boolean; status?: number } = {}) {
  const sent: PresencePayload[] = []
  const beacons: PresencePayload[] = []
  let status = opts.status ?? 200
  const c = createPresenceController({
    tabId: TAB,
    initiallyVisible: opts.visible ?? true,
    transport: {
      send: async (p) => { sent.push(p); return status },
      beacon: (p) => { beacons.push(p) },
    },
  })
  return { c, sent, beacons, setStatus: (s: number) => { status = s } }
}

describe('presence controller', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('beats on load, then every interval while visible — one timer only', async () => {
    const h = harness()
    h.c.setPath('/')
    await vi.advanceTimersByTimeAsync(300)
    expect(h.sent).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 4)
    expect(h.sent).toHaveLength(5)
    expect(h.sent.every((p) => p.tabId === TAB && p.page === 'home')).toBe(true)
  })

  it('route changes beat promptly (coalesced) with the new game', async () => {
    const h = harness()
    h.c.setPath('/')
    await vi.advanceTimersByTimeAsync(300)
    h.c.setPath('/game/AAAAAA')
    h.c.setPath('/game/BBBBBB') // fast double navigation → one beat
    await vi.advanceTimersByTimeAsync(300)
    expect(h.sent.map((p) => p.gameCode)).toEqual([null, 'BBBBBB'])
    h.c.setPath('/game/BBBBBB') // same path: nothing
    await vi.advanceTimersByTimeAsync(300)
    expect(h.sent).toHaveLength(2)
  })

  it('hidden tab: one invisible beat, then silence; visible again: immediate beat', async () => {
    const h = harness()
    h.c.setPath('/game/AAAAAA')
    await vi.advanceTimersByTimeAsync(300)
    h.c.setVisible(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(h.sent.at(-1)).toMatchObject({ visible: false })
    const n = h.sent.length
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 10)
    expect(h.sent).toHaveLength(n)
    h.c.setVisible(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(h.sent.at(-1)).toMatchObject({ visible: true, gameCode: 'AAAAAA' })
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS)
    expect(h.sent).toHaveLength(n + 2)
  })

  it('transient server errors back off exponentially (45, 45, 90, 180 … ≤ 10 min) and recover to the normal cadence', async () => {
    const h = harness({ status: 503 })
    h.c.setPath('/')
    await vi.advanceTimersByTimeAsync(300)
    expect(h.sent).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS) // 1st retry at the normal interval
    expect(h.sent).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS) // nothing yet: now waiting 90 s
    expect(h.sent).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS)
    expect(h.sent).toHaveLength(3)
    // A one-hour outage costs a bounded number of requests (backoff caps at 10 min), not 80.
    await vi.advanceTimersByTimeAsync(60 * 60_000)
    expect(h.sent.length).toBeLessThan(13)
    expect(h.c.disabled).toBe(false)
    h.setStatus(200)
    await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS) // next attempt succeeds …
    const n = h.sent.length
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS) // … and the normal cadence is back
    expect(h.sent).toHaveLength(n + 1)
  })

  it('a single lost beat never takes the tab offline: the retry comes within the 120 s window', async () => {
    const h = harness()
    h.c.setPath('/')
    await vi.advanceTimersByTimeAsync(300)
    h.setStatus(0)
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS) // this one fails
    h.setStatus(200)
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS) // retry 90 s after the last success
    expect(h.sent).toHaveLength(3)
    expect(2 * HEARTBEAT_INTERVAL_MS).toBeLessThan(ONLINE_THRESHOLD_SECONDS * 1000)
  })

  it('network failures back off too; reconnect beats immediately', async () => {
    const h = harness({ status: 0 })
    h.c.setPath('/')
    await vi.advanceTimersByTimeAsync(300 + HEARTBEAT_INTERVAL_MS * 2)
    expect(h.sent).toHaveLength(2)
    h.setStatus(200)
    h.c.online()
    await vi.advanceTimersByTimeAsync(0)
    expect(h.sent).toHaveLength(3)
  })

  it('bad request / feature off / not migrated / rate limited / budget → stops for good (no retry loop)', async () => {
    for (const s of [400, 404, 413, 429]) {
      const h = harness({ status: s })
      h.c.setPath('/')
      await vi.advanceTimersByTimeAsync(300 + HEARTBEAT_INTERVAL_MS * 10)
      h.c.online()
      h.c.setVisible(false); h.c.setVisible(true)
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 10)
      expect(h.sent).toHaveLength(1)
      expect(h.c.disabled).toBe(true)
    }
  })

  it('pagehide sends a best-effort leave beacon and stops the timer', async () => {
    const h = harness()
    h.c.setPath('/game/AAAAAA')
    await vi.advanceTimersByTimeAsync(300)
    h.c.pageHide()
    expect(h.beacons).toEqual([{ tabId: TAB, page: 'game', gameCode: 'AAAAAA', visible: true, leave: true }])
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 3)
    expect(h.sent).toHaveLength(1)
  })

  it('admin pages never report; leaving admin resumes', async () => {
    const h = harness()
    h.c.setPath('/admin/live')
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 3)
    expect(h.sent).toHaveLength(0)
    h.c.setPath('/')
    await vi.advanceTimersByTimeAsync(300)
    expect(h.sent).toHaveLength(1)
  })

  it('a slow request never overlaps: triggers during it collapse into one follow-up', async () => {
    let release!: (s: number) => void
    const sent: PresencePayload[] = []
    const c = createPresenceController({
      tabId: TAB, initiallyVisible: true,
      transport: { send: (p) => { sent.push(p); return new Promise((r) => { release = r }) }, beacon: () => {} },
    })
    c.setPath('/')
    await vi.advanceTimersByTimeAsync(300)
    c.online(); c.online()
    await vi.advanceTimersByTimeAsync(0)
    c.setPath('/game/AAAAAA')
    await vi.advanceTimersByTimeAsync(300)
    expect(sent).toHaveLength(1)
    release(200)
    await vi.advanceTimersByTimeAsync(0)
    expect(sent).toHaveLength(2)
    expect(sent[1].gameCode).toBe('AAAAAA')
  })

  it('starting hidden (background tab) still records one beat, marked invisible', async () => {
    const h = harness({ visible: false })
    h.c.setPath('/')
    await vi.advanceTimersByTimeAsync(300 + HEARTBEAT_INTERVAL_MS * 3)
    expect(h.sent).toEqual([{ tabId: TAB, page: 'home', gameCode: null, visible: false }])
  })
})

// ─── Dashboard data ─────────────────────────────────────────────────────────

describe('pause memo (server instance)', () => {
  it('stays paused for its TTL, then lets requests through to the database again', () => {
    let t = 1_000
    const m = createPauseMemo(300_000, () => t)
    expect(m.isPaused()).toBe(false)
    m.trip()
    t += 299_000
    expect(m.isPaused()).toBe(true)
    t += 2_000
    expect(m.isPaused()).toBe(false)
  })
  it('answers 429 without calling the database while paused', async () => {
    const m = createPauseMemo(60_000)
    m.trip()
    const rpc = vi.fn()
    const r = await handleHeartbeat({ service: { rpc } as never, rawBody: '{}', ipBucket: 'x', pauseMemo: m })
    expect(r).toEqual({ status: 429, body: { status: 'paused' } })
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('parseLiveSnapshot / freshness', () => {
  const good = {
    generated_at: '2026-11-22T12:00:00Z', online_seconds: 120, tabs_online: 4, visible_tabs_online: 3, tabs_in_games: 3,
    occupied_rooms: 1, occupied_rooms_in_progress: 1, visits_today: 5, visits_7d: 9, visits_30d: 12, visits_total: 40,
    room_entries_today: 2, room_entries_7d: 4, room_entries_30d: 6, games_created_today: 1, games_created_7d: 3,
    games_created_30d: 8, tracking_since: '2026-11-20', beats_today: 100, daily_beat_cap: 8000, paused: false,
    rooms: [{ code: 'AB12CD', status: 'active', current_team: 'red', tabs: 3, visible_tabs: 2, last_activity: '2026-11-22T11:59:50Z' }],
  }
  it('accepts a well-formed snapshot (incl. empty rooms)', () => {
    expect(parseLiveSnapshot(good)?.rooms).toHaveLength(1)
    expect(parseLiveSnapshot({ ...good, rooms: [] })?.rooms).toEqual([])
    expect(parseLiveSnapshot({ ...good, tracking_since: null })?.tracking_since).toBeNull()
  })
  it('rejects malformed data so errors are never shown as zeros', () => {
    expect(parseLiveSnapshot(null)).toBeNull()
    expect(parseLiveSnapshot({ ...good, tabs_online: null })).toBeNull()
    expect(parseLiveSnapshot({ ...good, paused: 'no' })).toBeNull()
    expect(parseLiveSnapshot({ ...good, generated_at: 'nope' })).toBeNull()
    expect(parseLiveSnapshot({ ...good, rooms: [{ code: 'X' }] })).toBeNull()
  })
  it('freshness: stale after 40 s', () => {
    const t = Date.parse(good.generated_at)
    expect(freshness(good.generated_at, t + 12_000)).toEqual({ ageSeconds: 12, stale: false })
    expect(freshness(good.generated_at, t + 41_000)).toEqual({ ageSeconds: 41, stale: true })
  })
})
