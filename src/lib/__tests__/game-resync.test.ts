import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createResyncScheduler,
  fetchGameSnapshot,
  reconcileResync,
  type LocalGameState,
  type ReconcileContext,
  type ResyncSnapshot,
} from '@/lib/game-resync'
import type { Card, CardType, Clue, Game, Team } from '@/types/game'

// ─── Fixtures ───────────────────────────────────────────────────────────────

const GAME_ID = 'game-1'

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: GAME_ID,
    code: 'ABC123',
    status: 'active',
    current_team: 'red',
    red_remaining: 9,
    blue_remaining: 8,
    winner: null,
    spymaster_token: 'token',
    version: 1,
    created_at: '2026-11-22T10:00:00.000Z',
    next_game_code: null,
    next_game_spymaster_token: null,
    ...overrides,
  }
}

const TYPES: CardType[] = [
  ...Array<CardType>(9).fill('red'),
  ...Array<CardType>(8).fill('blue'),
  ...Array<CardType>(7).fill('neutral'),
  'assassin',
]

function makeCards(revealedIds: string[] = []): Card[] {
  return TYPES.map((type, i) => ({
    id: `card-${i}`,
    game_id: GAME_ID,
    word: `word-${i}`,
    type,
    position: i,
    revealed: revealedIds.includes(`card-${i}`),
  }))
}

function makeClue(id: string, team: Team, minute: number, word = id): Clue {
  return {
    id,
    game_id: GAME_ID,
    team,
    word,
    count: 2,
    created_at: `2026-11-22T10:${String(minute).padStart(2, '0')}:00.000Z`,
  }
}

function local(overrides: Partial<LocalGameState> = {}): LocalGameState {
  return {
    game: makeGame(),
    cards: makeCards(),
    clues: [],
    activeClue: null,
    appliedVersion: 1,
    ...overrides,
  }
}

function ctx(overrides: Partial<ReconcileContext> = {}): ReconcileContext {
  return {
    confirmedRevealed: new Set(),
    pendingReveals: new Set(),
    realtimeEventsDuringFetch: false,
    ...overrides,
  }
}

function revealedIds(cards: Card[]): string[] {
  return cards.filter((c) => c.revealed).map((c) => c.id)
}

// ─── reconcileResync ────────────────────────────────────────────────────────

describe('reconcileResync', () => {
  it('normal uninterrupted gameplay: an identical snapshot changes nothing', () => {
    const clue = makeClue('c1', 'red', 1)
    const state = local({
      game: makeGame({ version: 3, red_remaining: 8 }),
      cards: makeCards(['card-0']),
      clues: [clue],
      activeClue: clue,
      appliedVersion: 3,
    })
    const snapshot: ResyncSnapshot = { game: state.game, cards: state.cards, clues: state.clues }

    const result = reconcileResync(state, snapshot, ctx({ confirmedRevealed: new Set(['card-0']) }))!

    // Same references → React bails out, a no-op resync causes no re-render.
    expect(result.game).toBe(state.game)
    expect(result.cards).toBe(state.cards)
    expect(revealedIds(result.cards)).toEqual(['card-0'])
    expect(result.clues).toBe(state.clues)
    expect(result.activeClue).toBe(clue)
    expect(result.turnChanged).toBe(false)
    expect(result.rolledBackCardIds).toEqual([])
    expect(result.appliedVersion).toBe(3)
  })

  it('no-op resync with fresh (but equal) objects from the network keeps local references', () => {
    const clue = makeClue('c1', 'red', 1)
    const state = local({ game: makeGame({ version: 2 }), cards: makeCards(['card-0']), clues: [clue], activeClue: clue, appliedVersion: 2 })
    const snapshot: ResyncSnapshot = {
      game: makeGame({ version: 2 }),
      cards: makeCards(['card-0']),
      clues: [makeClue('c1', 'red', 1)],
    }
    const result = reconcileResync(state, snapshot, ctx({ confirmedRevealed: new Set(['card-0']) }))!
    expect(result.gameApplied).toBe(true)
    expect(result.game).toBe(state.game)
    expect(result.cards).toBe(state.cards)
    expect(result.clues).toBe(state.clues)
    expect(result.activeClue).toBe(clue)
  })

  it('only the changed card gets a new reference', () => {
    const state = local()
    const snapshot: ResyncSnapshot = { game: makeGame({ version: 2, red_remaining: 8 }), cards: makeCards(['card-3']), clues: [] }
    const result = reconcileResync(state, snapshot, ctx())!
    expect(result.cards).not.toBe(state.cards)
    result.cards.forEach((c, i) => {
      if (c.id === 'card-3') expect(c).not.toBe(state.cards[i])
      else expect(c).toBe(state.cards[i])
    })
  })

  it('reconnect after missed card reveals: applies reveals, counters and version', () => {
    const snapshot: ResyncSnapshot = {
      game: makeGame({ version: 3, red_remaining: 7 }),
      cards: makeCards(['card-0', 'card-1']),
      clues: [],
    }

    const result = reconcileResync(local(), snapshot, ctx())!

    expect(result.gameApplied).toBe(true)
    expect(result.appliedVersion).toBe(3)
    expect(result.game.red_remaining).toBe(7)
    expect(revealedIds(result.cards)).toEqual(['card-0', 'card-1'])
    expect(result.turnChanged).toBe(false)
  })

  it('reconnect after a missed clue of the current team: shows it as the active clue', () => {
    const missed = makeClue('c1', 'red', 1)
    const snapshot: ResyncSnapshot = { game: makeGame(), cards: makeCards(), clues: [missed] }

    const result = reconcileResync(local(), snapshot, ctx())!

    expect(result.clues).toEqual([missed])
    expect(result.activeClue).toEqual(missed)
    expect(result.turnChanged).toBe(false)
  })

  it('missed turn change plus the new team’s clue: resets the turn and activates that clue', () => {
    const oldRed = makeClue('c1', 'red', 1)
    const missedBlue = makeClue('c2', 'blue', 5)
    const state = local({ clues: [oldRed], activeClue: oldRed })
    const snapshot: ResyncSnapshot = {
      game: makeGame({ version: 4, current_team: 'blue', red_remaining: 8 }),
      cards: makeCards(['card-0', 'card-20']),
      clues: [oldRed, missedBlue],
    }

    const result = reconcileResync(state, snapshot, ctx())!

    expect(result.game.current_team).toBe('blue')
    expect(result.turnChanged).toBe(true)
    expect(result.activeClue).toEqual(missedBlue)
    expect(result.clues.map((c) => c.id)).toEqual(['c1', 'c2'])
  })

  it('missed a full round (red → blue → red) with no new red clue: clears the stale active clue', () => {
    const oldRed = makeClue('c1', 'red', 1)
    const missedBlue = makeClue('c2', 'blue', 5)
    const state = local({ clues: [oldRed], activeClue: oldRed })
    const snapshot: ResyncSnapshot = {
      game: makeGame({ version: 6, current_team: 'red' }),
      cards: makeCards(),
      clues: [oldRed, missedBlue],
    }

    const result = reconcileResync(state, snapshot, ctx())!

    expect(result.turnChanged).toBe(true)
    expect(result.activeClue).toBeNull()
  })

  it('turn changed but the new team has not given a clue yet: no active clue', () => {
    const oldRed = makeClue('c1', 'red', 1)
    const state = local({ clues: [oldRed], activeClue: oldRed })
    const snapshot: ResyncSnapshot = {
      game: makeGame({ version: 2, current_team: 'blue' }),
      cards: makeCards(),
      clues: [oldRed],
    }

    const result = reconcileResync(state, snapshot, ctx())!

    expect(result.turnChanged).toBe(true)
    expect(result.activeClue).toBeNull()
  })

  it('game completed during disconnection: applies finished status and winner', () => {
    const snapshot: ResyncSnapshot = {
      game: makeGame({ version: 9, status: 'finished', winner: 'blue' }),
      cards: makeCards(['card-24']),
      clues: [],
    }

    const result = reconcileResync(local(), snapshot, ctx())!

    expect(result.game.status).toBe('finished')
    expect(result.game.winner).toBe('blue')
    expect(revealedIds(result.cards)).toEqual(['card-24'])
  })

  it('new game created during disconnection: propagates next_game_code so GameBoard navigates', () => {
    const snapshot: ResyncSnapshot = {
      game: makeGame({
        version: 10,
        status: 'finished',
        winner: 'red',
        next_game_code: 'NEW123',
        next_game_spymaster_token: 'next-token',
      }),
      cards: makeCards(),
      clues: [],
    }

    const result = reconcileResync(local(), snapshot, ctx())!

    expect(result.game.next_game_code).toBe('NEW123')
    expect(result.game.next_game_spymaster_token).toBe('next-token')
  })

  it('failed optimistic card reveal: rolls the card and the derived game state back', () => {
    // Locally: card-0 shown revealed with derived counters, but the write never landed.
    const state = local({
      game: makeGame({ red_remaining: 8 }),
      cards: makeCards(['card-0']),
      appliedVersion: 1,
    })
    const snapshot: ResyncSnapshot = { game: makeGame({ version: 1 }), cards: makeCards(), clues: [] }

    const result = reconcileResync(state, snapshot, ctx())!

    expect(result.rolledBackCardIds).toEqual(['card-0'])
    expect(revealedIds(result.cards)).toEqual([])
    expect(result.gameApplied).toBe(true)
    expect(result.game.red_remaining).toBe(9)
  })

  it('failed optimistic assassin reveal: un-finishes the locally finished game', () => {
    const state = local({
      game: makeGame({ status: 'finished', winner: 'blue' }),
      cards: makeCards(['card-24']),
    })
    const snapshot: ResyncSnapshot = { game: makeGame(), cards: makeCards(), clues: [] }

    const result = reconcileResync(state, snapshot, ctx())!

    expect(result.game.status).toBe('active')
    expect(result.game.winner).toBeNull()
    expect(result.rolledBackCardIds).toEqual(['card-24'])
  })

  it('pending action during resync: keeps an in-flight optimistic reveal', () => {
    const state = local({ cards: makeCards(['card-3']) })
    const snapshot: ResyncSnapshot = { game: makeGame(), cards: makeCards(), clues: [] }

    const result = reconcileResync(state, snapshot, ctx({ pendingReveals: new Set(['card-3']) }))!

    expect(revealedIds(result.cards)).toEqual(['card-3'])
    expect(result.rolledBackCardIds).toEqual([])
  })

  it('stale snapshot after a newer Realtime update: keeps the newer game row', () => {
    const state = local({
      game: makeGame({ version: 5, current_team: 'blue', red_remaining: 7 }),
      cards: makeCards(['card-0', 'card-1']),
      appliedVersion: 5,
    })
    const stale: ResyncSnapshot = {
      game: makeGame({ version: 4, current_team: 'red', red_remaining: 7 }),
      cards: makeCards(['card-0']),
      clues: [],
    }

    const result = reconcileResync(
      state,
      stale,
      ctx({ confirmedRevealed: new Set(['card-0', 'card-1']), realtimeEventsDuringFetch: true })
    )!

    expect(result.gameApplied).toBe(false)
    expect(result.game).toBe(state.game)
    expect(result.appliedVersion).toBe(5)
    // card-1 was confirmed by a Realtime event newer than the snapshot.
    expect(revealedIds(result.cards)).toEqual(['card-0', 'card-1'])
    expect(result.rolledBackCardIds).toEqual([])
    expect(result.turnChanged).toBe(false)
  })

  it('same-version snapshot racing a Realtime card event: does not overwrite derived state', () => {
    // A non-clicker derived red_remaining=8 from a card event during the fetch;
    // the matching games event (version 2) hasn't arrived yet.
    const state = local({
      game: makeGame({ version: 1, red_remaining: 8 }),
      cards: makeCards(['card-0']),
      appliedVersion: 1,
    })
    const snapshot: ResyncSnapshot = { game: makeGame({ version: 1 }), cards: makeCards(), clues: [] }

    const result = reconcileResync(
      state,
      snapshot,
      ctx({ confirmedRevealed: new Set(['card-0']), realtimeEventsDuringFetch: true })
    )!

    expect(result.gameApplied).toBe(false)
    expect(result.game.red_remaining).toBe(8)
    expect(revealedIds(result.cards)).toEqual(['card-0'])
  })

  it('never duplicates clues already received via Realtime and keeps them ordered', () => {
    const a = makeClue('c1', 'red', 1)
    const b = makeClue('c2', 'blue', 2)
    const c = makeClue('c3', 'red', 3)
    const state = local({ clues: [a, c], activeClue: c })
    const snapshot: ResyncSnapshot = { game: makeGame(), cards: makeCards(), clues: [a, b] }

    const result = reconcileResync(state, snapshot, ctx({ realtimeEventsDuringFetch: true }))!

    expect(result.clues.map((x) => x.id)).toEqual(['c1', 'c2', 'c3'])
    expect(result.activeClue).toBe(c)
  })

  it('DB row still active but the assassin card is revealed: derives the finished state (RLS 008)', () => {
    const snapshot: ResyncSnapshot = {
      game: makeGame({ version: 2, current_team: 'red' }),
      cards: makeCards(['card-24']),
      clues: [],
    }
    const result = reconcileResync(local(), snapshot, ctx())!
    expect(result.game).toMatchObject({ status: 'finished', winner: 'blue' })
  })

  it('DB row still active but all blue cards are revealed: blue wins with 0 remaining', () => {
    const blueIds = Array.from({ length: 8 }, (_, i) => `card-${9 + i}`)
    const snapshot: ResyncSnapshot = {
      game: makeGame({ version: 9, current_team: 'blue', blue_remaining: 1 }),
      cards: makeCards(blueIds),
      clues: [],
    }
    const result = reconcileResync(local(), snapshot, ctx())!
    expect(result.game).toMatchObject({ status: 'finished', winner: 'blue', blue_remaining: 0 })
  })

  it('locally finished game is never re-derived or downgraded by an active DB row with the win saved', () => {
    const state = local({ game: makeGame({ status: 'finished', winner: 'red' }), cards: makeCards(['card-24']) })
    const snapshot: ResyncSnapshot = { game: makeGame({ version: 1 }), cards: makeCards(['card-24']), clues: [] }
    const result = reconcileResync(state, snapshot, ctx({ confirmedRevealed: new Set(['card-24']) }))!
    // Keeps exactly the finished state already on screen.
    expect(result.game).toMatchObject({ status: 'finished', winner: 'red' })
  })

  it('ignores a snapshot for a different game', () => {
    const snapshot: ResyncSnapshot = { game: makeGame({ id: 'other' }), cards: [], clues: [] }
    expect(reconcileResync(local(), snapshot, ctx())).toBeNull()
  })
})

// ─── fetchGameSnapshot ──────────────────────────────────────────────────────

type Result = { data: unknown; error: { message: string } | null }

function fakeSupabase(results: Record<'games' | 'cards' | 'clues', Result | Error>): SupabaseClient {
  return {
    from(table: 'games' | 'cards' | 'clues') {
      const outcome = results[table]
      const settle = () => (outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome))
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => settle(),
        single: () => settle(),
      }
      return builder
    },
  } as unknown as SupabaseClient
}

describe('fetchGameSnapshot', () => {
  const ok = {
    games: { data: makeGame(), error: null },
    cards: { data: makeCards(), error: null },
    clues: { data: [], error: null },
  }

  it('returns all three parts on success', async () => {
    const snap = await fetchGameSnapshot(fakeSupabase(ok), GAME_ID)
    expect(snap.game.id).toBe(GAME_ID)
    expect(snap.cards).toHaveLength(25)
    expect(snap.clues).toEqual([])
  })

  it('network failure during resync: rejects instead of returning a partial snapshot', async () => {
    await expect(
      fetchGameSnapshot(fakeSupabase({ ...ok, cards: new TypeError('Failed to fetch') }), GAME_ID)
    ).rejects.toThrow('Failed to fetch')
  })

  it('rejects on a PostgREST error or empty cards', async () => {
    await expect(
      fetchGameSnapshot(fakeSupabase({ ...ok, clues: { data: null, error: { message: 'boom' } } }), GAME_ID)
    ).rejects.toThrow(/clues/)
    await expect(
      fetchGameSnapshot(fakeSupabase({ ...ok, cards: { data: [], error: null } }), GAME_ID)
    ).rejects.toThrow(/cards/)
  })
})

// ─── createResyncScheduler ──────────────────────────────────────────────────

describe('createResyncScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function setup(overrides: { fetchSnapshot?: () => Promise<string> } = {}) {
    const state = { busy: false, epoch: 0, rtSeq: 0 }
    const fetchSnapshot = vi.fn(overrides.fetchSnapshot ?? (() => Promise.resolve('snap')))
    const apply = vi.fn()
    const onFetchError = vi.fn()
    const scheduler = createResyncScheduler<string>({
      fetchSnapshot,
      apply,
      onFetchError,
      isBusy: () => state.busy,
      getActionEpoch: () => state.epoch,
      getRealtimeSeq: () => state.rtSeq,
      debounceMs: 300,
      retryDelaysMs: [1000, 3000],
    })
    return { state, fetchSnapshot, apply, onFetchError, scheduler }
  }

  it('normal gameplay: never fetches without a trigger', async () => {
    const { fetchSnapshot } = setup()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchSnapshot).not.toHaveBeenCalled()
  })

  it('multiple rapid reconnect / visibility events collapse into one fetch', async () => {
    const { scheduler, fetchSnapshot, apply } = setup()
    scheduler.request('visible')
    scheduler.request('online')
    scheduler.request('realtime-rejoin')
    scheduler.request('visible')
    await vi.advanceTimersByTimeAsync(1_000)
    expect(fetchSnapshot).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('a trigger during an in-flight fetch causes exactly one follow-up fetch', async () => {
    let release!: (v: string) => void
    const { scheduler, fetchSnapshot, apply } = setup({
      fetchSnapshot: () => new Promise<string>((resolve) => { release = resolve }),
    })
    scheduler.request('visible')
    await vi.advanceTimersByTimeAsync(300)
    expect(fetchSnapshot).toHaveBeenCalledTimes(1)

    scheduler.request('realtime-rejoin')
    scheduler.request('online')
    release('first')
    await vi.advanceTimersByTimeAsync(300)
    expect(apply).toHaveBeenCalledTimes(1)
    expect(fetchSnapshot).toHaveBeenCalledTimes(2)

    release('second')
    await vi.advanceTimersByTimeAsync(5_000)
    expect(apply).toHaveBeenCalledTimes(2)
    expect(fetchSnapshot).toHaveBeenCalledTimes(2)
  })

  it('pending action: defers the resync until the action settles', async () => {
    const { scheduler, state, fetchSnapshot, apply } = setup()
    state.busy = true
    scheduler.request('visible')
    await vi.advanceTimersByTimeAsync(5_000)
    expect(fetchSnapshot).not.toHaveBeenCalled()

    state.busy = false
    scheduler.notifyIdle()
    await vi.advanceTimersByTimeAsync(300)
    expect(fetchSnapshot).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('action started during the fetch: discards the snapshot and re-runs after it settles', async () => {
    let release!: (v: string) => void
    const { scheduler, state, fetchSnapshot, apply } = setup({
      fetchSnapshot: () => new Promise<string>((resolve) => { release = resolve }),
    })
    scheduler.request('visible')
    await vi.advanceTimersByTimeAsync(300)

    state.epoch += 1
    state.busy = true
    release('stale')
    await vi.advanceTimersByTimeAsync(0)
    expect(apply).not.toHaveBeenCalled()

    state.busy = false
    scheduler.notifyIdle()
    await vi.advanceTimersByTimeAsync(300)
    expect(fetchSnapshot).toHaveBeenCalledTimes(2)
    release('fresh')
    await vi.advanceTimersByTimeAsync(0)
    expect(apply).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledWith('fresh', { realtimeSeqAtStart: 0 })
  })

  it('action that started and settled during the fetch still invalidates the snapshot', async () => {
    let release!: (v: string) => void
    const { scheduler, state, fetchSnapshot, apply } = setup({
      fetchSnapshot: () => new Promise<string>((resolve) => { release = resolve }),
    })
    scheduler.request('visible')
    await vi.advanceTimersByTimeAsync(300)
    state.epoch += 1 // action started and finished while fetching
    release('stale')
    await vi.advanceTimersByTimeAsync(0)
    expect(apply).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(300)
    expect(fetchSnapshot).toHaveBeenCalledTimes(2)
  })

  it('reports the Realtime sequence observed at fetch start so stale data can be detected', async () => {
    let release!: (v: string) => void
    const { scheduler, state, apply } = setup({
      fetchSnapshot: () => new Promise<string>((resolve) => { release = resolve }),
    })
    state.rtSeq = 7
    scheduler.request('visible')
    await vi.advanceTimersByTimeAsync(300)
    state.rtSeq = 9 // events arrived during the fetch
    release('snap')
    await vi.advanceTimersByTimeAsync(0)
    expect(apply).toHaveBeenCalledWith('snap', { realtimeSeqAtStart: 7 })
  })

  it('network failure: retries with bounded backoff, then gives up without looping', async () => {
    const { scheduler, fetchSnapshot, apply, onFetchError } = setup({
      fetchSnapshot: () => Promise.reject(new TypeError('Failed to fetch')),
    })
    scheduler.request('online')
    await vi.advanceTimersByTimeAsync(300) // attempt 1
    await vi.advanceTimersByTimeAsync(1000) // attempt 2
    await vi.advanceTimersByTimeAsync(3000) // attempt 3
    await vi.advanceTimersByTimeAsync(60_000)

    expect(fetchSnapshot).toHaveBeenCalledTimes(3)
    expect(apply).not.toHaveBeenCalled()
    expect(onFetchError.mock.calls.map((c) => c[1])).toEqual([
      { attempt: 1, willRetry: true },
      { attempt: 2, willRetry: true },
      { attempt: 3, willRetry: false },
    ])
  })

  it('recovers on the next trigger after giving up, and a trigger replaces a pending retry', async () => {
    let fail = true
    const { scheduler, fetchSnapshot, apply } = setup({
      fetchSnapshot: () => (fail ? Promise.reject(new Error('offline')) : Promise.resolve('ok')),
    })
    scheduler.request('visible')
    await vi.advanceTimersByTimeAsync(300) // fails, retry in 1000ms
    fail = false
    scheduler.request('online') // replaces the retry with a 300ms debounce
    await vi.advanceTimersByTimeAsync(300)
    expect(fetchSnapshot).toHaveBeenCalledTimes(2)
    expect(apply).toHaveBeenCalledWith('ok', { realtimeSeqAtStart: 0 })
  })

  it('Realtime event not yet committed: waits for the commit before applying', async () => {
    let settled = false
    const fetchSnapshot = vi.fn(() => Promise.resolve('snap'))
    const apply = vi.fn()
    const scheduler = createResyncScheduler<string>({
      fetchSnapshot,
      apply,
      isBusy: () => false,
      getActionEpoch: () => 0,
      getRealtimeSeq: () => 0,
      isSettled: () => settled,
      debounceMs: 300,
      settleCheckMs: 50,
      maxSettleChecks: 20,
    })
    scheduler.request('visible')
    await vi.advanceTimersByTimeAsync(300 + 120)
    expect(apply).not.toHaveBeenCalled()

    scheduler.request('online') // arrives while waiting → coalesced as a follow-up
    settled = true
    await vi.advanceTimersByTimeAsync(50)
    expect(apply).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(300)
    expect(fetchSnapshot).toHaveBeenCalledTimes(2)
  })

  it('state that never settles: drops the snapshot instead of overwriting, and does not loop', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchSnapshot = vi.fn(() => Promise.resolve('snap'))
    const apply = vi.fn()
    const scheduler = createResyncScheduler<string>({
      fetchSnapshot,
      apply,
      isBusy: () => false,
      getActionEpoch: () => 0,
      getRealtimeSeq: () => 0,
      isSettled: () => false,
      debounceMs: 300,
      settleCheckMs: 50,
      maxSettleChecks: 4,
    })
    scheduler.request('visible')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(apply).not.toHaveBeenCalled()
    expect(fetchSnapshot).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('dispose cancels pending work and ignores in-flight results', async () => {
    let release!: (v: string) => void
    const { scheduler, apply } = setup({
      fetchSnapshot: () => new Promise<string>((resolve) => { release = resolve }),
    })
    scheduler.request('visible')
    await vi.advanceTimersByTimeAsync(300)
    scheduler.dispose()
    release('late')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(apply).not.toHaveBeenCalled()
  })
})
