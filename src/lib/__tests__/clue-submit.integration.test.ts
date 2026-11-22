/**
 * A2 reliable clue submission — integration tests against an ISOLATED local
 * Supabase (real PostgREST, RLS from migrations 001–009, real Realtime).
 * Skipped unless SUPABASE_TEST_* is set; refuses any non-localhost URL.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { findClue, newClueId, submitClue, type ClueDraft } from '@/lib/clue-submit'
import type { CardType } from '@/types/game'

const url = process.env.SUPABASE_TEST_URL ?? ''
const anonKey = process.env.SUPABASE_TEST_ANON_KEY ?? ''
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? ''
const isLocal = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)
const describeIntegration = url && anonKey && serviceKey && isLocal ? describe : describe.skip

const TYPES: CardType[] = [
  ...Array<CardType>(9).fill('red'), ...Array<CardType>(8).fill('blue'),
  ...Array<CardType>(7).fill('neutral'), 'assassin',
]
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function waitFor(cond: () => boolean, ms = 10_000, label = 'condition') {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${label}`)
    await sleep(25)
  }
}

describeIntegration('A2 clue submission — local Supabase integration', () => {
  let service: SupabaseClient
  const clients: SupabaseClient[] = []
  const gameIds: string[] = []

  const client = (fetchImpl?: typeof fetch) => {
    const c = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      ...(fetchImpl ? { global: { fetch: fetchImpl } } : {}),
    })
    clients.push(c)
    return c
  }

  beforeAll(() => { service = createClient(url, serviceKey, { auth: { persistSession: false } }) })
  afterEach(async () => {
    for (const c of clients.splice(0)) await c.removeAllChannels()
    if (gameIds.length) await service.from('games').delete().in('id', gameIds.splice(0))
  })

  async function newGame(c: SupabaseClient) {
    const { data, error } = await c.rpc('create_game', { p_words: TYPES.map((_, i) => `w${i}`), p_types: TYPES })
    if (error) throw error
    const { data: g } = await c.from('games').select('id').eq('code', data.code).single()
    gameIds.push(g!.id)
    return g!.id as string
  }
  const draft = (gameId: string, o: Partial<ClueDraft> = {}): ClueDraft =>
    ({ id: newClueId(), gameId, team: 'red', word: 'רמז', count: 2, ...o })
  const countClues = async (gameId: string) =>
    (await service.from('clues').select('id', { count: 'exact', head: true }).eq('game_id', gameId)).count

  it('successful submission: saved with the server row, exactly one row', async () => {
    const c = client()
    const gameId = await newGame(c)
    const d = draft(gameId)
    const outcome = await submitClue(c, d)
    expect(outcome).toMatchObject({ kind: 'saved', clue: { id: d.id, team: 'red', word: 'רמז', count: 2 } })
    expect(await countClues(gameId)).toBe(1)
  })

  it('retrying the same clue (same id) never creates a second row', async () => {
    const c = client()
    const gameId = await newGame(c)
    const d = draft(gameId)
    await submitClue(c, d)
    const again = await submitClue(c, d)
    expect(again).toMatchObject({ kind: 'saved', clue: { id: d.id } })
    expect(await countClues(gameId)).toBe(1)
  })

  it('lost acknowledgment: server commits, response is lost → reconciled as saved; retry is a no-op', async () => {
    let dropNextInsertResponse = true
    const lossy: typeof fetch = async (input, init) => {
      const res = await fetch(input, init) // the request really reaches the server
      if (dropNextInsertResponse && init?.method === 'POST' && String(input).includes('/clues')) {
        dropNextInsertResponse = false
        throw new TypeError('Failed to fetch') // …but the browser never sees the reply
      }
      return res
    }
    const c = client(lossy)
    const gameId = await newGame(c)
    const d = draft(gameId)
    expect(await submitClue(c, d)).toMatchObject({ kind: 'saved', clue: { id: d.id } })
    expect(await submitClue(c, d)).toMatchObject({ kind: 'saved', clue: { id: d.id } })
    expect(await countClues(gameId)).toBe(1)
  })

  it('RLS: game finished → rejected (not-allowed), nothing written', async () => {
    const c = client()
    const gameId = await newGame(c)
    await service.from('games').update({ status: 'finished', winner: 'blue' }).eq('id', gameId)
    expect(await submitClue(c, draft(gameId))).toEqual({ kind: 'rejected', reason: 'not-allowed' })
    expect(await countClues(gameId)).toBe(0)
  })

  it('game finishes while the INSERT is in flight → rejected, nothing written', async () => {
    let finishFirst = true
    const slow: typeof fetch = async (input, init) => {
      if (finishFirst && init?.method === 'POST' && String(input).includes('/clues')) {
        finishFirst = false
        await service.from('games').update({ status: 'finished', winner: 'red' }).eq('id', gameIds[gameIds.length - 1])
      }
      return fetch(input, init)
    }
    const c = client(slow)
    const gameId = await newGame(c)
    expect(await submitClue(c, draft(gameId))).toEqual({ kind: 'rejected', reason: 'not-allowed' })
    expect(await countClues(gameId)).toBe(0)
  })

  it('invalid value (word longer than varchar(100)) → rejected (invalid), nothing written', async () => {
    const c = client()
    const gameId = await newGame(c)
    expect(await submitClue(c, draft(gameId, { word: 'א'.repeat(101) }))).toEqual({ kind: 'rejected', reason: 'invalid' })
    expect(await countClues(gameId)).toBe(0)
  })

  it('network failure (server unreachable) → uncertain, and lookup reports unknown', async () => {
    const dead = createClient('http://127.0.0.1:9', anonKey, { auth: { persistSession: false } })
    const d = draft('00000000-0000-0000-0000-000000000000')
    expect(await submitClue(dead, d)).toEqual({ kind: 'uncertain' })
    expect(await findClue(dead, d.id)).toBe('unknown')
  })

  it('Realtime delivers exactly one INSERT event even when the clue is submitted twice', async () => {
    const spymaster = client()
    const viewer = client()
    const gameId = await newGame(spymaster)
    const events: string[] = []
    let joined = false
    viewer.channel(`game:${gameId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'clues', filter: `game_id=eq.${gameId}` },
        (p) => events.push((p.new as { id: string }).id))
      .subscribe((s) => { if (s === 'SUBSCRIBED') joined = true })
    await waitFor(() => joined, 10_000, 'subscribe')

    const d = draft(gameId)
    await Promise.all([submitClue(spymaster, d), submitClue(spymaster, d)])
    await waitFor(() => events.length >= 1, 10_000, 'clue event')
    await sleep(500)
    expect(events).toEqual([d.id])
  })

  it('turn changed in the DB but the client still thinks it is red → INSERT accepted (documents the limitation)', async () => {
    const c = client()
    const gameId = await newGame(c)
    await service.from('games').update({ current_team: 'blue' }).eq('id', gameId)
    // RLS only checks that the game is active, not whose turn it is.
    expect(await submitClue(c, draft(gameId, { team: 'red' }))).toMatchObject({ kind: 'saved' })
  })
})
