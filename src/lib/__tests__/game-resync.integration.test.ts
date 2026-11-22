/**
 * A1 resync — integration tests against an ISOLATED local Supabase.
 *
 * Skipped unless SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY /
 * SUPABASE_TEST_SERVICE_ROLE_KEY are set, and refuses any URL that is not
 * localhost (so it can never run against production by accident). The
 * database must have migrations 001–009 applied with the legacy Supabase
 * default grants (anon can SELECT/INSERT/UPDATE public tables), matching how
 * the production app writes directly from the browser.
 *
 * Uses the real supabase-js client, real PostgREST/RLS, and real Realtime
 * (Node 22 global WebSocket), with the same write code GameBoard uses
 * (lib/game-writes.ts) and the same resync code (lib/game-resync.ts).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import { deriveGameUpdates } from '@/lib/game-logic'
import { saveEndTurn, saveReveal } from '@/lib/game-writes'
import {
  createResyncScheduler,
  fetchGameSnapshot,
  reconcileResync,
  type LocalGameState,
  type ResyncSnapshot,
} from '@/lib/game-resync'
import type { Card, CardType, Clue, Game } from '@/types/game'

const url = process.env.SUPABASE_TEST_URL ?? ''
const anonKey = process.env.SUPABASE_TEST_ANON_KEY ?? ''
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? ''
const isLocal = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)
const enabled = Boolean(url && anonKey && serviceKey && isLocal)
const describeIntegration = enabled ? describe : describe.skip

const TYPES: CardType[] = [
  ...Array<CardType>(9).fill('red'),
  ...Array<CardType>(8).fill('blue'),
  ...Array<CardType>(7).fill('neutral'),
  'assassin',
]
const WORDS = Array.from({ length: 25 }, (_, i) => `מילה${i}`)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function waitFor(cond: () => boolean, timeoutMs = 10_000, label = 'condition') {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`)
    await sleep(25)
  }
}

describeIntegration('A1 resync — local Supabase integration', () => {
  let service: SupabaseClient
  const clients: SupabaseClient[] = []
  const gameIds: string[] = []

  function newClient(fetchImpl?: typeof fetch): SupabaseClient {
    const c = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      ...(fetchImpl ? { global: { fetch: fetchImpl } } : {}),
    })
    clients.push(c)
    return c
  }

  beforeAll(() => {
    service = createClient(url, serviceKey, { auth: { persistSession: false } })
  })

  afterEach(async () => {
    for (const c of clients.splice(0)) await c.removeAllChannels()
    if (gameIds.length) await service.from('games').delete().in('id', gameIds.splice(0))
  })

  afterAll(async () => {
    await service.removeAllChannels()
  })

  async function createGame(client: SupabaseClient): Promise<{ game: Game; cards: Card[] }> {
    const { data, error } = await client.rpc('create_game', { p_words: WORDS, p_types: TYPES })
    if (error) throw error
    const snap = await fetchGameSnapshot(client, (await client.from('games').select('id').eq('code', data.code).single()).data!.id)
    gameIds.push(snap.game.id)
    return { game: snap.game, cards: snap.cards }
  }

  const cardOf = (cards: Card[], type: CardType, nth = 0) => cards.filter((c) => c.type === type)[nth]

  /** Subscribes with exactly GameBoard's bindings; records events and statuses. */
  function subscribeLikeGameBoard(client: SupabaseClient, gameId: string) {
    const events: { table: string; row: Record<string, unknown> }[] = []
    const statuses: string[] = []
    const channel: RealtimeChannel = client
      .channel(`game:${gameId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'cards', filter: `game_id=eq.${gameId}` },
        (p) => events.push({ table: 'cards', row: p.new }))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (p) => events.push({ table: 'games', row: p.new }))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'clues', filter: `game_id=eq.${gameId}` },
        (p) => events.push({ table: 'clues', row: p.new }))
      .subscribe((s) => statuses.push(s))
    return { channel, events, statuses, joins: () => statuses.filter((s) => s === 'SUBSCRIBED').length }
  }

  /** Simulates an abrupt network drop of the client's Realtime socket. */
  function dropSocket(client: SupabaseClient) {
    const rt = client.realtime as unknown as { socketAdapter: { getSocket: () => { conn: WebSocket | null } } }
    rt.socketAdapter.getSocket().conn?.close(4000, 'simulated network drop')
  }

  function localFrom(game: Game, cards: Card[], clues: Clue[] = []): LocalGameState {
    return { game, cards, clues, activeClue: null, appliedVersion: game.version }
  }

  const reconcileCtx = (confirmed: Iterable<string> = [], pending: Iterable<string> = []) => ({
    confirmedRevealed: new Set(confirmed),
    pendingReveals: new Set(pending),
    realtimeEventsDuringFetch: false,
  })

  // ── Write semantics ───────────────────────────────────────────────────────

  it('normal card reveal: saved, counters updated, delivered to another client via Realtime', async () => {
    const a = newClient()
    const b = newClient()
    const { game, cards } = await createGame(a)
    const sub = subscribeLikeGameBoard(b, game.id)
    await waitFor(() => sub.joins() === 1, 10_000, 'subscribe')

    const red = cardOf(cards, 'red')
    const outcome = await saveReveal(a, game.id, red.id, deriveGameUpdates(game, red))
    expect(outcome).toMatchObject({ saved: true, gameWriteFailed: false })

    await waitFor(() => sub.events.some((e) => e.table === 'games'), 10_000, 'games event')
    expect(sub.events.find((e) => e.table === 'cards')?.row).toMatchObject({ id: red.id, revealed: true })
    expect(sub.events.find((e) => e.table === 'games')?.row).toMatchObject({ red_remaining: 8, version: game.version + 1 })
  })

  it('winning reveal via the client path: card saved, games row rejected by RLS 008; resync still shows the win', async () => {
    const a = newClient()
    const { game, cards } = await createGame(a)
    const assassin = cardOf(cards, 'assassin')

    const outcome = await saveReveal(a, game.id, assassin.id, deriveGameUpdates(game, assassin))
    expect(outcome.cardSaved).toBe(true)
    expect(outcome.gameWriteFailed).toBe(true)
    expect(outcome.details[1]).toMatchObject({ code: '42501' })

    const snap = await fetchGameSnapshot(a, game.id)
    // The DB row never becomes finished from a client (pre-existing, prod impact to verify).
    expect(snap.game.status).toBe('active')
    // Resync must not "un-finish" the game on screen.
    const optimisticWin = localFrom({ ...game, status: 'finished', winner: 'blue' }, snap.cards)
    expect(reconcileResync(optimisticWin, snap, reconcileCtx([assassin.id]))!.game).toMatchObject({ status: 'finished', winner: 'blue' })
    const freshViewer = localFrom(game, cards)
    expect(reconcileResync(freshViewer, snap, reconcileCtx())!.game).toMatchObject({ status: 'finished', winner: 'blue' })
  })

  it('winning by revealing a team’s last card: resync derives the win from the cards', async () => {
    const a = newClient()
    const { game, cards } = await createGame(a)
    let g = game
    for (const red of cards.filter((c) => c.type === 'red')) {
      const updates = deriveGameUpdates(g, red)
      await saveReveal(a, game.id, red.id, updates)
      g = { ...g, ...updates }
    }
    const snap = await fetchGameSnapshot(a, game.id)
    expect(snap.game.status).toBe('active') // last write (status=finished) rejected by RLS
    expect(snap.game.red_remaining).toBe(1)
    const result = reconcileResync(localFrom(game, cards), snap, reconcileCtx())!
    expect(result.game).toMatchObject({ status: 'finished', winner: 'red', red_remaining: 0 })
  })

  it('failed card reveal (game finished in the DB): detected via count 0, then rolled back by resync', async () => {
    const a = newClient()
    const b = newClient()
    const { game, cards } = await createGame(a)
    // A game finished in the DB (only possible server-side today — see above).
    await service.from('games').update({ status: 'finished', winner: 'blue' }).eq('id', game.id)

    // B still thinks the game is active and optimistically reveals a card.
    const red = cardOf(cards, 'red')
    const outcome = await saveReveal(b, game.id, red.id, deriveGameUpdates(game, red))
    expect(outcome).toMatchObject({ saved: false, cardSaved: false, gameWriteFailed: true })
    expect(outcome.details).toEqual([{ count: 0 }, { count: 0 }])

    const optimistic = localFrom(
      { ...game, red_remaining: 8 },
      cards.map((c) => (c.id === red.id ? { ...c, revealed: true } : c))
    )
    const snap = await fetchGameSnapshot(b, game.id)
    const result = reconcileResync(optimistic, snap, reconcileCtx())!
    expect(result.rolledBackCardIds).toEqual([red.id])
    expect(result.game).toMatchObject({ status: 'finished', red_remaining: 9 })
  })

  it('end-turn failure on a finished game: detected, and resync restores server state', async () => {
    const a = newClient()
    const { game, cards } = await createGame(a)
    await service.from('games').update({ status: 'finished', winner: 'blue' }).eq('id', game.id)

    const outcome = await saveEndTurn(a, game.id, 'blue')
    expect(outcome).toEqual({ saved: false, details: { count: 0 } })

    const snap = await fetchGameSnapshot(a, game.id)
    const result = reconcileResync(localFrom({ ...game, current_team: 'blue' }, cards), snap, reconcileCtx())!
    expect(result.game.current_team).toBe('red')
    expect(result.game.status).toBe('finished')
  })

  it('network failure: write reports not saved (no throw); snapshot fetch rejects', async () => {
    const dead = createClient('http://127.0.0.1:9', anonKey, { auth: { persistSession: false } })
    const outcome = await saveReveal(dead, '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', { red_remaining: 8 })
    expect(outcome.saved).toBe(false)
    expect(outcome.gameWriteFailed).toBe(true)
    await expect(fetchGameSnapshot(dead, '00000000-0000-0000-0000-000000000000')).rejects.toThrow(/resync/)
  })

  // ── Disconnect / reconnect ────────────────────────────────────────────────

  it('reconnect after missed reveals, clue and turn change: events are NOT replayed, resync restores the board', async () => {
    const a = newClient()
    const b = newClient()
    const { game, cards } = await createGame(a)
    const sub = subscribeLikeGameBoard(b, game.id)
    await waitFor(() => sub.joins() === 1, 10_000, 'subscribe')
    const bLocal = localFrom(game, cards)

    dropSocket(b)
    await waitFor(() => sub.statuses.includes('CHANNEL_ERROR'), 5_000, 'channel error')

    // While B is offline: red clue, two red reveals, a neutral (turn → blue), blue clue.
    const red0 = cardOf(cards, 'red', 0)
    const red1 = cardOf(cards, 'red', 1)
    const neutral = cardOf(cards, 'neutral')
    await a.from('clues').insert({ game_id: game.id, team: 'red', word: 'רמז-אדום', count: 2 })
    let g = game
    for (const card of [red0, red1, neutral]) {
      const updates = deriveGameUpdates(g, card)
      expect((await saveReveal(a, game.id, card.id, updates)).saved).toBe(true)
      g = { ...g, ...updates }
    }
    await a.from('clues').insert({ game_id: game.id, team: 'blue', word: 'רמז-כחול', count: 1 })

    await waitFor(() => sub.joins() === 2, 20_000, 'rejoin')
    await sleep(500)
    // Confirms the premise of A1: nothing that happened offline was delivered.
    expect(sub.events).toEqual([])

    const snap = await fetchGameSnapshot(b, game.id)
    const result = reconcileResync(bLocal, snap, reconcileCtx())!
    expect(result.gameApplied).toBe(true)
    expect(result.game).toMatchObject({ current_team: 'blue', red_remaining: 7, status: 'active' })
    expect(result.cards.filter((c) => c.revealed).map((c) => c.id).sort()).toEqual([red0.id, red1.id, neutral.id].sort())
    expect(result.clues.map((c) => c.word)).toEqual(['רמז-אדום', 'רמז-כחול'])
    expect(result.turnChanged).toBe(true)
    expect(result.activeClue?.word).toBe('רמז-כחול')
  })

  it('game completed while disconnected: resync shows the finished game and winner', async () => {
    const a = newClient()
    const b = newClient()
    const { game, cards } = await createGame(a)
    const sub = subscribeLikeGameBoard(b, game.id)
    await waitFor(() => sub.joins() === 1, 10_000, 'subscribe')

    dropSocket(b)
    await waitFor(() => sub.statuses.includes('CHANNEL_ERROR'), 5_000, 'channel error')
    const assassin = cardOf(cards, 'assassin')
    await saveReveal(a, game.id, assassin.id, deriveGameUpdates(game, assassin))
    await waitFor(() => sub.joins() === 2, 20_000, 'rejoin')

    const result = reconcileResync(localFrom(game, cards), await fetchGameSnapshot(b, game.id), reconcileCtx())!
    expect(result.game).toMatchObject({ status: 'finished', winner: 'blue' })
  })

  it('new game created while disconnected: next_game_code is persisted and reaches the resync', async () => {
    const a = newClient()
    const b = newClient()
    const { game, cards } = await createGame(a)
    const sub = subscribeLikeGameBoard(b, game.id)
    await waitFor(() => sub.joins() === 1, 10_000, 'subscribe')

    dropSocket(b)
    await waitFor(() => sub.statuses.includes('CHANNEL_ERROR'), 5_000, 'channel error')
    // A wins (on screen), then presses "new game": same anon write startNewGame makes.
    const assassin = cardOf(cards, 'assassin')
    await saveReveal(a, game.id, assassin.id, deriveGameUpdates(game, assassin))
    const { data: next } = await a.rpc('create_game', { p_words: WORDS, p_types: TYPES })
    const { data: nextRow } = await a.from('games').select('id').eq('code', next.code).single()
    gameIds.push(nextRow!.id)
    const link = await a
      .from('games')
      .update({ next_game_code: next.code, next_game_spymaster_token: next.spymaster_token }, { count: 'exact' })
      .eq('id', game.id)
      .is('next_game_code', null)
    // Persisted because the row is still `active` in the DB (see RLS 008 note).
    expect(link.count).toBe(1)

    await waitFor(() => sub.joins() === 2, 20_000, 'rejoin')
    const result = reconcileResync(localFrom(game, cards), await fetchGameSnapshot(b, game.id), reconcileCtx())!
    expect(result.game.next_game_code).toBe(next.code)
  })

  // ── Concurrency ───────────────────────────────────────────────────────────

  it('simultaneous reveals from two clients: both cards land; documents the existing lost-update on counters', async () => {
    const a = newClient()
    const c = newClient()
    const { game, cards } = await createGame(a)
    const red0 = cardOf(cards, 'red', 0)
    const red1 = cardOf(cards, 'red', 1)

    // Both clients derive from the same (stale for one of them) game state.
    const [o1, o2] = await Promise.all([
      saveReveal(a, game.id, red0.id, deriveGameUpdates(game, red0)),
      saveReveal(c, game.id, red1.id, deriveGameUpdates(game, red1)),
    ])
    expect(o1.saved && o2.saved).toBe(true)

    const snap = await fetchGameSnapshot(a, game.id)
    expect(snap.cards.filter((x) => x.revealed)).toHaveLength(2)
    // Pre-existing race (not introduced or fixed by A1; fixed by the atomic
    // reveal RPC in A4): absolute writes lose a decrement.
    expect(snap.game.red_remaining).toBe(8)

    // Resync still converges every client onto the same server truth.
    const result = reconcileResync(localFrom(game, cards), snap, reconcileCtx())!
    expect(result.game.red_remaining).toBe(snap.game.red_remaining)
    expect(result.cards.filter((x) => x.revealed)).toHaveLength(2)
  })

  // ── Scheduler with real network ───────────────────────────────────────────

  function countingFetch() {
    const calls: string[] = []
    const impl: typeof fetch = (input, init) => {
      calls.push(`${init?.method ?? 'GET'} ${String(input instanceof Request ? input.url : input).split('?')[0].split('/').pop()}`)
      return fetch(input, init)
    }
    return { impl, calls }
  }

  it('rapid reconnect / visibility events: exactly one snapshot (3 GETs) hits the database', async () => {
    const a = newClient()
    const { game } = await createGame(a)
    const { impl, calls } = countingFetch()
    const b = newClient(impl)
    const applied: ResyncSnapshot[] = []
    const scheduler = createResyncScheduler({
      fetchSnapshot: () => fetchGameSnapshot(b, game.id),
      apply: (s) => applied.push(s),
      isBusy: () => false,
      getActionEpoch: () => 0,
      getRealtimeSeq: () => 0,
      debounceMs: 50,
    })
    for (const reason of ['visible', 'online', 'realtime-rejoin', 'pageshow', 'visible']) scheduler.request(reason)
    await waitFor(() => applied.length === 1, 5_000, 'apply')
    await sleep(300)
    scheduler.dispose()
    expect(applied).toHaveLength(1)
    expect(calls.sort()).toEqual(['GET cards', 'GET clues', 'GET games'])
  })

  it('in-flight action during resync: snapshot waits for the action, then includes it', async () => {
    const a = newClient()
    const { game, cards } = await createGame(a)
    const red = cardOf(cards, 'red')
    let busy = 0
    let epoch = 0
    const applied: ResyncSnapshot[] = []
    const scheduler = createResyncScheduler({
      fetchSnapshot: () => fetchGameSnapshot(a, game.id),
      apply: (s) => applied.push(s),
      isBusy: () => busy > 0,
      getActionEpoch: () => epoch,
      getRealtimeSeq: () => 0,
      debounceMs: 50,
    })

    busy += 1
    epoch += 1
    const write = saveReveal(a, game.id, red.id, deriveGameUpdates(game, red))
    scheduler.request('visible') // arrives mid-action → deferred
    await sleep(200)
    expect(applied).toHaveLength(0)

    expect((await write).saved).toBe(true)
    busy -= 1
    scheduler.notifyIdle()
    await waitFor(() => applied.length === 1, 5_000, 'apply')
    scheduler.dispose()
    expect(applied[0].cards.find((c) => c.id === red.id)?.revealed).toBe(true)
    expect(applied[0].game.red_remaining).toBe(8)
  })

  // ── Old / new client compatibility ────────────────────────────────────────

  it('old client (pre-A1 writes, no count) and new client interoperate on the same game', async () => {
    const oldClient = newClient()
    const newer = newClient()
    const { game, cards } = await createGame(newer)
    const oldSub = subscribeLikeGameBoard(oldClient, game.id)
    const newSub = subscribeLikeGameBoard(newer, game.id)
    await waitFor(() => oldSub.joins() === 1 && newSub.joins() === 1, 10_000, 'subscribe')

    // Old client: exactly the pre-A1 GameBoard writes.
    const red = cardOf(cards, 'red')
    const updates = deriveGameUpdates(game, red)
    await Promise.all([
      oldClient.from('cards').update({ revealed: true }).eq('id', red.id),
      oldClient.from('games').update(updates).eq('id', game.id),
    ])
    // New client: A1 write path.
    const after = { ...game, ...updates }
    const blue = cardOf(cards, 'blue')
    expect((await saveReveal(newer, game.id, blue.id, deriveGameUpdates(after, blue))).saved).toBe(true)

    for (const sub of [oldSub, newSub]) {
      await waitFor(() => sub.events.filter((e) => e.table === 'cards').length === 2, 10_000, 'card events')
    }
    const snap = await fetchGameSnapshot(newer, game.id)
    expect(snap.game).toMatchObject({ red_remaining: 8, blue_remaining: 7, current_team: 'blue' })
  })
})
