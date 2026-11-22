import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createClueSubmitter,
  findClue,
  insertClue,
  newClueId,
  pickActiveClue,
  submitClue,
  type ClueDraft,
  type ClueSubmitOutcome,
  type SubmitterState,
} from '@/lib/clue-submit'
import { reconcileResync } from '@/lib/game-resync'
import type { Card, Clue, Game, Team } from '@/types/game'

// ─── Fixtures ───────────────────────────────────────────────────────────────

const GAME_ID = 'game-1'

function clue(id: string, team: Team = 'red', minute = 1): Clue {
  return { id, game_id: GAME_ID, team, word: 'רמז', count: 2, created_at: `2026-11-22T10:0${minute}:00.000Z` }
}

type Res = { data: unknown; error: { code: string; message: string } | null; status: number }
const ok = (data: unknown, status = 201): Res => ({ data, error: null, status })
const err = (code: string, status: number): Res => ({ data: null, error: { code, message: code }, status })
const NETWORK: Res = { data: null, error: { code: '', message: 'TypeError: Failed to fetch' }, status: 0 }
const HANG = 'hang' as const

/**
 * Scripted Supabase stand-in for exactly the two calls the module makes:
 * insert(...).select().abortSignal(s).single() and
 * select('*').eq('id', x).abortSignal(s).maybeSingle().
 * HANG resolves only when the AbortSignal fires (like a real fetch).
 */
function fakeSupabase(script: { insert?: (Res | typeof HANG)[]; lookup?: (Res | typeof HANG)[] }) {
  const calls = { insert: [] as Record<string, unknown>[], lookup: [] as string[] }
  const insertQ = [...(script.insert ?? [])]
  const lookupQ = [...(script.lookup ?? [])]
  const settle = (next: Res | typeof HANG | undefined, signal?: AbortSignal): Promise<Res> => {
    if (next === undefined) throw new Error('unexpected call')
    if (next !== HANG) return Promise.resolve(next)
    return new Promise((resolve) =>
      signal?.addEventListener('abort', () =>
        resolve({ data: null, error: { code: '', message: 'AbortError: aborted' }, status: 0 })
      )
    )
  }
  const client = {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        calls.insert.push(row)
        let signal: AbortSignal | undefined
        const b = {
          select: () => b,
          abortSignal: (s: AbortSignal) => { signal = s; return b },
          single: () => settle(insertQ.shift(), signal),
        }
        return b
      },
      select: () => {
        let signal: AbortSignal | undefined
        const b = {
          eq: (_c: string, v: string) => { calls.lookup.push(v); return b },
          abortSignal: (s: AbortSignal) => { signal = s; return b },
          maybeSingle: () => settle(lookupQ.shift(), signal),
        }
        return b
      },
    }),
  }
  return { client: client as unknown as SupabaseClient, calls }
}

const draft = (overrides: Partial<ClueDraft> = {}): ClueDraft => ({
  id: 'id-1', gameId: GAME_ID, team: 'red', word: 'רמז', count: 2, ...overrides,
})

afterEach(() => { vi.useRealTimers() })

// ─── insertClue / submitClue / findClue (classification) ────────────────────

describe('insertClue / submitClue', () => {
  it('1. successful INSERT → saved, with the server row', async () => {
    const { client, calls } = fakeSupabase({ insert: [ok(clue('id-1'))] })
    expect(await submitClue(client, draft())).toEqual({ kind: 'saved', clue: clue('id-1') })
    // The client-chosen id is what gets inserted (idempotency key).
    expect(calls.insert[0]).toMatchObject({ id: 'id-1', game_id: GAME_ID, team: 'red', word: 'רמז', count: 2 })
  })

  it('4. INSERT error (value too long / bad enum) → rejected: invalid, no lookup', async () => {
    const { client, calls } = fakeSupabase({ insert: [err('22001', 400)] })
    expect(await submitClue(client, draft())).toEqual({ kind: 'rejected', reason: 'invalid' })
    expect(calls.lookup).toHaveLength(0)
  })

  it('5. RLS rejection (game not active) → rejected: not-allowed', async () => {
    const { client } = fakeSupabase({ insert: [err('42501', 401)] })
    expect(await submitClue(client, draft())).toEqual({ kind: 'rejected', reason: 'not-allowed' })
  })

  it('6. network failure → reconciles by id; absent → uncertain', async () => {
    const { client, calls } = fakeSupabase({ insert: [NETWORK], lookup: [ok(null, 200)] })
    expect(await submitClue(client, draft())).toEqual({ kind: 'uncertain' })
    expect(calls.lookup).toEqual(['id-1'])
  })

  it('13. lost acknowledgment: network failure but the row exists → saved', async () => {
    const { client } = fakeSupabase({ insert: [NETWORK], lookup: [ok(clue('id-1'), 200)] })
    expect(await submitClue(client, draft())).toEqual({ kind: 'saved', clue: clue('id-1') })
  })

  it('network failure and the lookup fails too → uncertain (never claims failure)', async () => {
    const { client } = fakeSupabase({ insert: [NETWORK], lookup: [NETWORK] })
    expect(await submitClue(client, draft())).toEqual({ kind: 'uncertain' })
  })

  it('10. duplicate id (23505) on a retry → saved via lookup, not a second clue', async () => {
    const { client } = fakeSupabase({ insert: [err('23505', 409)], lookup: [ok(clue('id-1'), 200)] })
    expect(await insertClue(client, draft())).toEqual({ kind: 'saved', clue: clue('id-1') })
  })

  it('5xx → uncertain (the server may have committed)', async () => {
    const { client } = fakeSupabase({ insert: [err('', 503)], lookup: [ok(null, 200)] })
    expect(await submitClue(client, draft())).toEqual({ kind: 'uncertain' })
  })

  it('request timeout → aborted → uncertain', async () => {
    vi.useFakeTimers()
    const { client } = fakeSupabase({ insert: [HANG] })
    const p = insertClue(client, draft(), 10_000)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await p).toEqual({ kind: 'uncertain' })
  })

  it('findClue: found / absent / unknown', async () => {
    const { client } = fakeSupabase({ lookup: [ok(clue('a'), 200), ok(null, 200), NETWORK] })
    expect(await findClue(client, 'a')).toEqual(clue('a'))
    expect(await findClue(client, 'b')).toBeNull()
    expect(await findClue(client, 'c')).toBe('unknown')
  })
})

// ─── Submitter state machine ────────────────────────────────────────────────

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

function setup(overrides: { lookup?: (id: string) => Promise<Clue | null | 'unknown'> } = {}) {
  const pending: { draft: ClueDraft; d: ReturnType<typeof deferred<ClueSubmitOutcome>> }[] = []
  const states: SubmitterState[] = []
  const saved: Clue[] = []
  const syncs: number[] = []
  let n = 0
  const submit = vi.fn((d: ClueDraft) => {
    const dd = deferred<ClueSubmitOutcome>()
    pending.push({ draft: d, d: dd })
    return dd.promise
  })
  const lookup = vi.fn(overrides.lookup ?? (async () => null))
  const submitter = createClueSubmitter({
    submit,
    lookup,
    newId: () => `id-${++n}`,
    onState: (s) => states.push(s),
    onSaved: (c) => saved.push(c),
    onSyncNeeded: () => syncs.push(1),
  })
  const input = (o: Partial<{ word: string; count: number; team: Team }> = {}) => ({
    gameId: GAME_ID, team: 'red' as Team, word: 'רמז', count: 2, ...o,
  })
  const last = () => states[states.length - 1]
  return { submitter, submit, lookup, pending, states, saved, syncs, input, last }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('createClueSubmitter', () => {
  it('2/3. stays pending (form untouched) until confirmed; clears only on success', async () => {
    const t = setup()
    const p = t.submitter.submit(t.input())
    expect(t.last()).toEqual({ sending: true, message: null })
    expect(t.saved).toHaveLength(0) // onSaved is what clears the form

    t.pending[0].d.resolve({ kind: 'saved', clue: clue('id-1') })
    await p
    expect(t.saved.map((c) => c.id)).toEqual(['id-1'])
    expect(t.last()).toEqual({ sending: false, message: null })
  })

  it('3. a failed submission never clears the form', async () => {
    const t = setup()
    const p = t.submitter.submit(t.input())
    t.pending[0].d.resolve({ kind: 'rejected', reason: 'invalid' })
    await p
    expect(t.saved).toHaveLength(0)
    expect(t.last()).toEqual({ sending: false, message: 'invalid' })
  })

  it('7. double click / repeated Enter while pending → exactly one request', async () => {
    const t = setup()
    const p1 = t.submitter.submit(t.input())
    const p2 = t.submitter.submit(t.input())
    const p3 = t.submitter.submit(t.input())
    expect(t.submit).toHaveBeenCalledTimes(1)
    t.pending[0].d.resolve({ kind: 'saved', clue: clue('id-1') })
    await Promise.all([p1, p2, p3])
    expect(t.saved).toHaveLength(1)
  })

  it('rapid responses: after a success, the next submit is a new clue with a new id', async () => {
    const t = setup()
    const p1 = t.submitter.submit(t.input())
    t.pending[0].d.resolve({ kind: 'saved', clue: clue('id-1') })
    await p1
    const p2 = t.submitter.submit(t.input({ word: 'אחר', team: 'blue' }))
    expect(t.pending[1].draft.id).toBe('id-2')
    t.pending[1].d.resolve({ kind: 'saved', clue: clue('id-2', 'blue') })
    await p2
  })

  it('whitespace-only clue → message, no request', async () => {
    const t = setup()
    await t.submitter.submit(t.input({ word: '   ' }))
    expect(t.submit).not.toHaveBeenCalled()
    expect(t.last()).toEqual({ sending: false, message: 'empty' })
  })

  it('trims the word before sending', async () => {
    const t = setup()
    void t.submitter.submit(t.input({ word: '  ים  ' }))
    expect(t.pending[0].draft.word).toBe('ים')
  })

  it('5. rejection (RLS) → not-allowed message, resync requested, next try uses a new id', async () => {
    const t = setup()
    const p = t.submitter.submit(t.input())
    t.pending[0].d.resolve({ kind: 'rejected', reason: 'not-allowed' })
    await p
    expect(t.last().message).toBe('not-allowed')
    expect(t.syncs).toHaveLength(1)
    void t.submitter.submit(t.input())
    expect(t.pending[1].draft.id).toBe('id-2')
  })

  it('8. Realtime shows our clue before the INSERT response → confirmed once, no error', async () => {
    const t = setup()
    const p = t.submitter.submit(t.input())
    expect(t.submitter.markConfirmed('id-1')).toBe(true)
    // Even if the response is then lost, the clue is known to exist.
    t.pending[0].d.resolve({ kind: 'uncertain' })
    await p
    expect(t.last()).toEqual({ sending: false, message: null })
    expect(t.saved).toHaveLength(0) // already shown by Realtime; nothing to add
    expect(t.submitter.markConfirmed('someone-else')).toBe(false)
  })

  it('13. uncertain → retry with the same values reuses the same id (DB blocks a duplicate)', async () => {
    const t = setup()
    const p1 = t.submitter.submit(t.input())
    t.pending[0].d.resolve({ kind: 'uncertain' })
    await p1
    expect(t.last().message).toBe('uncertain')
    expect(t.syncs).toHaveLength(1)

    const p2 = t.submitter.submit(t.input())
    expect(t.pending[1].draft.id).toBe('id-1')
    expect(t.lookup).not.toHaveBeenCalled()
    t.pending[1].d.resolve({ kind: 'saved', clue: clue('id-1') })
    await p2
    expect(t.saved.map((c) => c.id)).toEqual(['id-1'])
  })

  it('13. uncertain → user edits the clue → checks the previous one first; it landed → no second clue', async () => {
    const t = setup({ lookup: async () => clue('id-1') })
    const p1 = t.submitter.submit(t.input())
    t.pending[0].d.resolve({ kind: 'uncertain' })
    await p1

    await t.submitter.submit(t.input({ word: 'אחר' }))
    expect(t.lookup).toHaveBeenCalledWith('id-1')
    expect(t.submit).toHaveBeenCalledTimes(1) // no new INSERT
    expect(t.saved.map((c) => c.id)).toEqual(['id-1'])
  })

  it('13. uncertain → edited → previous confirmed absent → sends the new clue with a new id', async () => {
    const t = setup({ lookup: async () => null })
    const p1 = t.submitter.submit(t.input())
    t.pending[0].d.resolve({ kind: 'uncertain' })
    await p1
    const p2 = t.submitter.submit(t.input({ word: 'אחר' }))
    await flush()
    expect(t.pending[1].draft).toMatchObject({ id: 'id-2', word: 'אחר' })
    t.pending[1].d.resolve({ kind: 'saved', clue: clue('id-2') })
    await p2
  })

  it('13. uncertain → edited → lookup still fails → no INSERT at all (could duplicate)', async () => {
    const t = setup({ lookup: async () => 'unknown' })
    const p1 = t.submitter.submit(t.input())
    t.pending[0].d.resolve({ kind: 'uncertain' })
    await p1
    await t.submitter.submit(t.input({ word: 'אחר' }))
    expect(t.submit).toHaveBeenCalledTimes(1)
    expect(t.last()).toEqual({ sending: false, message: 'uncertain' })
  })

  it('12. uncertain clue from an earlier turn does not block the next turn’s clue', async () => {
    const t = setup({ lookup: async () => clue('id-1', 'red') })
    const p1 = t.submitter.submit(t.input())
    t.pending[0].d.resolve({ kind: 'uncertain' })
    await p1
    // Turn moved to blue; spymaster writes the blue clue.
    const p2 = t.submitter.submit(t.input({ team: 'blue', word: 'כחול' }))
    await flush()
    expect(t.pending[1].draft).toMatchObject({ id: 'id-2', team: 'blue' })
    t.pending[1].d.resolve({ kind: 'saved', clue: clue('id-2', 'blue') })
    await p2
  })

  it('a clue confirmed later by Realtime/resync clears the pending uncertain attempt', async () => {
    const t = setup()
    const p1 = t.submitter.submit(t.input())
    t.pending[0].d.resolve({ kind: 'uncertain' })
    await p1
    expect(t.submitter.markConfirmed('id-1')).toBe(true)
    expect(t.last()).toEqual({ sending: false, message: null })
    // Next clue goes straight out with a fresh id, no lookup.
    void t.submitter.submit(t.input({ word: 'חדש', team: 'blue' }))
    expect(t.lookup).not.toHaveBeenCalled()
    expect(t.pending[1].draft.id).toBe('id-2')
  })

  it('14. unmount during submission: no state updates or callbacks afterwards', async () => {
    const t = setup()
    const p = t.submitter.submit(t.input())
    const before = t.states.length
    t.submitter.dispose()
    t.pending[0].d.resolve({ kind: 'saved', clue: clue('id-1') })
    await p
    expect(t.states.length).toBe(before)
    expect(t.saved).toHaveLength(0)
    expect(t.syncs).toHaveLength(0)
    await t.submitter.submit(t.input())
    expect(t.submit).toHaveBeenCalledTimes(1)
  })
})

// ─── Active clue & A1 interplay ─────────────────────────────────────────────

describe('pickActiveClue', () => {
  const game = (team: Team, status = 'active') => ({ status, current_team: team })

  it('activates a confirmed clue for the current turn', () => {
    expect(pickActiveClue(null, clue('a'), game('red'))).toEqual(clue('a'))
  })
  it('12. turn changed while the INSERT was pending → history only, not active', () => {
    const other = clue('b', 'blue', 5)
    expect(pickActiveClue(other, clue('a', 'red'), game('blue'))).toBe(other)
    expect(pickActiveClue(null, clue('a', 'red'), game('blue'))).toBeNull()
  })
  it('11. game finished while pending → not activated', () => {
    expect(pickActiveClue(null, clue('a'), game('red', 'finished'))).toBeNull()
  })
  it('a late response never replaces a newer clue of the same team', () => {
    const newer = clue('n', 'red', 5)
    expect(pickActiveClue(newer, clue('a', 'red', 1), game('red'))).toBe(newer)
  })
  it('Realtime already set it → unchanged reference', () => {
    const a = clue('a')
    expect(pickActiveClue(a, { ...a }, game('red'))).toBe(a)
  })
})

describe('9. A1 resync after a confirmed submission', () => {
  const g: Game = {
    id: GAME_ID, code: 'ABC123', status: 'active', current_team: 'red', red_remaining: 9, blue_remaining: 8,
    winner: null, spymaster_token: 't', version: 1, created_at: '2026-11-22T10:00:00.000Z',
    next_game_code: null, next_game_spymaster_token: null,
  }
  const cards: Card[] = []

  it('clue added from the INSERT response + the same clue in a snapshot → exactly once, still active', () => {
    const mine = clue('mine', 'red', 2)
    const result = reconcileResync(
      { game: g, cards, clues: [mine], activeClue: mine, appliedVersion: 1 },
      { game: g, cards, clues: [{ ...mine }], },
      { confirmedRevealed: new Set(), pendingReveals: new Set(), realtimeEventsDuringFetch: false }
    )!
    expect(result.clues.map((c) => c.id)).toEqual(['mine'])
    expect(result.activeClue).toBe(mine)
  })

  it('snapshot taken before our INSERT committed does not remove the clue', () => {
    const mine = clue('mine', 'red', 2)
    const result = reconcileResync(
      { game: g, cards, clues: [mine], activeClue: mine, appliedVersion: 1 },
      { game: g, cards, clues: [] },
      { confirmedRevealed: new Set(), pendingReveals: new Set(), realtimeEventsDuringFetch: true }
    )!
    expect(result.clues.map((c) => c.id)).toEqual(['mine'])
    expect(result.activeClue).toBe(mine)
  })
})

describe('newClueId', () => {
  it('produces RFC 4122 v4 ids, also without crypto.randomUUID (insecure LAN http)', () => {
    const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    expect(newClueId()).toMatch(re)
    const original = crypto.randomUUID
    try {
      // @ts-expect-error — simulate a non-secure context
      crypto.randomUUID = undefined
      const ids = new Set(Array.from({ length: 50 }, () => newClueId()))
      expect(ids.size).toBe(50)
      for (const id of ids) expect(id).toMatch(re)
    } finally {
      crypto.randomUUID = original
    }
  })
})
