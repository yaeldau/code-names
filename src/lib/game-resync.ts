import type { SupabaseClient } from '@supabase/supabase-js'
import type { Card, Clue, Game } from '@/types/game'

/**
 * Game-state resynchronization after a Realtime gap (socket reconnect, tab
 * returning from background, network coming back).
 *
 * Supabase `postgres_changes` events are not replayed after a reconnect, so a
 * client that was away can silently miss reveals, clues, turn changes, the
 * game ending, or the move to a new game. This module re-reads authoritative
 * state and reconciles it with local state without clobbering newer Realtime
 * updates or in-flight optimistic actions.
 *
 * Two parts, both framework-free so they can be unit tested:
 * - `reconcileResync` — pure merge of a fetched snapshot into local state.
 * - `createResyncScheduler` — coalesces triggers, defers while user actions
 *   are in flight, discards stale results, and retries failed fetches with a
 *   bounded backoff (never loops on its own).
 */

export interface ResyncSnapshot {
  game: Game
  cards: Card[]
  clues: Clue[]
}

export interface LocalGameState {
  game: Game
  cards: Card[]
  clues: Clue[]
  activeClue: Clue | null
  /** Highest `games.version` already applied locally (GameBoard's appliedVersion). */
  appliedVersion: number
}

export interface ReconcileContext {
  /** Cards confirmed revealed by the server (initial SSR, Realtime events, earlier snapshots). */
  confirmedRevealed: ReadonlySet<string>
  /** Cards whose optimistic reveal request has not settled yet. */
  pendingReveals: ReadonlySet<string>
  /** True if any Realtime event was applied while the snapshot was being fetched. */
  realtimeEventsDuringFetch: boolean
}

export interface ReconcileResult {
  game: Game
  cards: Card[]
  clues: Clue[]
  activeClue: Clue | null
  appliedVersion: number
  /** Whether the snapshot's game row replaced the local one. */
  gameApplied: boolean
  /** The turn moved on while we were away — the active clue and guess tracker must reset. */
  turnChanged: boolean
  /** Cards that were shown revealed locally but are not revealed on the server. */
  rolledBackCardIds: string[]
}

function shallowEqual<T extends object>(a: T, b: T): boolean {
  const keys = Object.keys(a) as (keyof T)[]
  return keys.length === Object.keys(b).length && keys.every((k) => Object.is(a[k], b[k]))
}

function clueTime(clue: Clue): number {
  const t = Date.parse(clue.created_at)
  return Number.isNaN(t) ? 0 : t
}

export function sortClues(clues: Clue[]): Clue[] {
  return [...clues].sort((a, b) => clueTime(a) - clueTime(b) || a.id.localeCompare(b.id))
}

/**
 * Merges an authoritative snapshot into local state.
 *
 * Game row — server is authoritative, but a snapshot must never overwrite a
 * newer Realtime update:
 * - `version > appliedVersion` → always applied.
 * - `version === appliedVersion` → applied only if no Realtime event arrived
 *   during the fetch. In that case local state can only differ through
 *   unconfirmed optimistic/derived updates, which the server state replaces
 *   (this is how a failed optimistic update is rolled back).
 * - `version < appliedVersion` → stale, ignored.
 *
 * Cards — `revealed` only ever goes false → true in the database, so a card
 * is shown revealed if the snapshot says so, if a Realtime event (possibly
 * newer than the snapshot) confirmed it, or if its reveal is still in flight.
 * Anything else that is revealed locally was an unconfirmed optimistic reveal
 * and is rolled back.
 *
 * Clues — insert-only, so the result is the union of local and fetched clues.
 */
export function reconcileResync(
  local: LocalGameState,
  snapshot: ResyncSnapshot,
  ctx: ReconcileContext
): ReconcileResult | null {
  const fresh = snapshot.game
  if (fresh.id !== local.game.id) return null

  const gameApplied = ctx.realtimeEventsDuringFetch
    ? fresh.version > local.appliedVersion
    : fresh.version >= local.appliedVersion
  let game = gameApplied ? { ...local.game, ...fresh } : local.game
  const appliedVersion = gameApplied ? fresh.version : local.appliedVersion

  const freshCards = new Map(snapshot.cards.map((c) => [c.id, c]))
  const rolledBackCardIds: string[] = []
  const mergedCards = local.cards.map((localCard) => {
    const freshCard = freshCards.get(localCard.id)
    if (!freshCard || freshCard.game_id !== local.game.id) return localCard
    const revealed =
      freshCard.revealed ||
      ctx.confirmedRevealed.has(localCard.id) ||
      ctx.pendingReveals.has(localCard.id)
    if (localCard.revealed && !revealed) rolledBackCardIds.push(localCard.id)
    const merged = { ...localCard, ...freshCard, revealed }
    return shallowEqual(merged, localCard) ? localCard : merged
  })
  // Keep references stable when nothing changed, so a no-op resync (the
  // common case, e.g. on page load) causes no re-render.
  const cards = mergedCards.every((c, i) => c === local.cards[i]) ? local.cards : mergedCards

  // See deriveFinishFromCards: the DB row may say `active` for a game whose
  // winning card is saved. Only touches a game that is not finished locally.
  const finish = deriveFinishFromCards(game, cards)
  if (Object.keys(finish).length > 0) {
    // If this client already shows the game as over (and the cards still say
    // so), keep exactly what it shows rather than re-deriving a winner.
    const { status, winner, red_remaining, blue_remaining } = local.game
    game = local.game.status === 'finished'
      ? { ...game, status, winner, red_remaining, blue_remaining }
      : { ...game, ...finish }
  }
  if (game !== local.game && shallowEqual(game, local.game)) game = local.game

  const knownClueIds = new Set(local.clues.map((c) => c.id))
  const newClues = snapshot.clues.filter((c) => c.game_id === local.game.id && !knownClueIds.has(c.id))
  const newClueIds = new Set(newClues.map((c) => c.id))
  const clues = newClues.length > 0 ? sortClues([...local.clues, ...newClues]) : local.clues

  const team = game.current_team
  // A clue from the other team that we never saw means at least one turn
  // passed while we were away, even if the current team looks unchanged.
  const turnChanged =
    gameApplied &&
    (fresh.current_team !== local.game.current_team || newClues.some((c) => c.team !== team))

  let activeClue: Clue | null
  if (turnChanged) {
    // Only a clue given in the *current* turn is active: it must be the newest
    // clue overall, belong to the current team, and be one we missed.
    const last = clues[clues.length - 1]
    activeClue = last && last.team === team && newClueIds.has(last.id) ? last : null
  } else {
    const newestOwn = [...newClues].reverse().find((c) => c.team === team)
    activeClue = newestOwn ?? local.activeClue
  }

  return { game, cards, clues, activeClue, appliedVersion, gameApplied, turnChanged, rolledBackCardIds }
}

/**
 * Game-over state implied by the revealed cards, for a game row that still
 * says `active`.
 *
 * Why this exists: with RLS from migration 008 (`UPDATE USING (status <>
 * 'finished')` and no WITH CHECK), Postgres also applies USING to the *new*
 * row, so a client UPDATE that sets `status = 'finished'` is rejected (42501,
 * verified locally). The winning card IS saved; only the games row stays
 * `active`. Before A1 nobody noticed, because every client derives the win
 * locally from the card (clicker optimistically, others from the Realtime card
 * event). A resync must derive it the same way, or it would "un-finish" games
 * on screen. Rule order mirrors `deriveGameUpdates` (assassin first).
 */
export function deriveFinishFromCards(game: Game, cards: Card[]): Partial<Game> {
  if (game.status !== 'active') return {}
  if (cards.some((c) => c.type === 'assassin' && c.revealed)) {
    return { status: 'finished', winner: game.current_team === 'red' ? 'blue' : 'red' }
  }
  const allRevealed = (type: 'red' | 'blue') => {
    const ofType = cards.filter((c) => c.type === type)
    return ofType.length > 0 && ofType.every((c) => c.revealed)
  }
  if (allRevealed('red')) return { status: 'finished', winner: 'red', red_remaining: 0 }
  if (allRevealed('blue')) return { status: 'finished', winner: 'blue', blue_remaining: 0 }
  return {}
}

// ─── Snapshot fetch ─────────────────────────────────────────────────────────

/** Reads the same rows the game page reads on SSR. Throws on any failure so a
 * partial snapshot is never applied. */
export async function fetchGameSnapshot(supabase: SupabaseClient, gameId: string): Promise<ResyncSnapshot> {
  const [gameResult, cardsResult, cluesResult] = await Promise.all([
    supabase.from('games').select('*').eq('id', gameId).single(),
    supabase.from('cards').select('*').eq('game_id', gameId).order('position'),
    supabase.from('clues').select('*').eq('game_id', gameId).order('created_at', { ascending: true }),
  ])

  if (gameResult.error || !gameResult.data) {
    throw new Error(`resync: failed to load game (${gameResult.error?.message ?? 'no data'})`)
  }
  if (cardsResult.error || !cardsResult.data || cardsResult.data.length === 0) {
    throw new Error(`resync: failed to load cards (${cardsResult.error?.message ?? 'no data'})`)
  }
  if (cluesResult.error || !cluesResult.data) {
    throw new Error(`resync: failed to load clues (${cluesResult.error?.message ?? 'no data'})`)
  }

  return {
    game: gameResult.data as Game,
    cards: cardsResult.data as Card[],
    clues: cluesResult.data as Clue[],
  }
}

// ─── Scheduler ──────────────────────────────────────────────────────────────

export interface ResyncSchedulerOptions<T> {
  fetchSnapshot: () => Promise<T>
  apply: (snapshot: T, meta: { realtimeSeqAtStart: number }) => void
  /** True while a user action (reveal, end turn) is in flight. */
  isBusy: () => boolean
  /** Incremented whenever a user action starts. */
  getActionEpoch: () => number
  /** Incremented whenever a Realtime event is applied. */
  getRealtimeSeq: () => number
  /**
   * True once local state reflects every Realtime event received so far.
   * GameBoard's handlers queue React updates that commit a frame later, and
   * `apply` reads committed state — applying before that commit would
   * overwrite those queued updates. The scheduler polls this briefly before
   * applying. Defaults to always settled.
   */
  isSettled?: () => boolean
  onFetchError?: (error: unknown, info: { attempt: number; willRetry: boolean }) => void
  debounceMs?: number
  retryDelaysMs?: readonly number[]
  settleCheckMs?: number
  maxSettleChecks?: number
}

export interface ResyncScheduler {
  /** Ask for a resync. Bursts of requests collapse into a single fetch. */
  request: (reason: string) => void
  /** Call after a user action settles, so a deferred resync can run. */
  notifyIdle: () => void
  dispose: () => void
}

export const DEFAULT_RESYNC_DEBOUNCE_MS = 300
export const DEFAULT_RESYNC_RETRY_DELAYS_MS = [1_000, 3_000, 8_000] as const
export const DEFAULT_SETTLE_CHECK_MS = 50
export const DEFAULT_MAX_SETTLE_CHECKS = 20

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function createResyncScheduler<T>(opts: ResyncSchedulerOptions<T>): ResyncScheduler {
  const debounceMs = opts.debounceMs ?? DEFAULT_RESYNC_DEBOUNCE_MS
  const retryDelays = opts.retryDelaysMs ?? DEFAULT_RESYNC_RETRY_DELAYS_MS
  const isSettled = opts.isSettled ?? (() => true)
  const settleCheckMs = opts.settleCheckMs ?? DEFAULT_SETTLE_CHECK_MS
  const maxSettleChecks = opts.maxSettleChecks ?? DEFAULT_MAX_SETTLE_CHECKS

  let timer: ReturnType<typeof setTimeout> | null = null
  let timerKind: 'debounce' | 'retry' | null = null
  let inFlight = false
  let queued = false // a request arrived while a fetch was in flight
  let deferred = false // a request arrived while a user action was in flight
  let failures = 0
  let disposed = false

  function schedule(delay: number, kind: 'debounce' | 'retry') {
    if (timer) clearTimeout(timer)
    timerKind = kind
    timer = setTimeout(() => {
      timer = null
      timerKind = null
      void run()
    }, delay)
  }

  function request() {
    if (disposed) return
    if (inFlight) {
      queued = true
      return
    }
    if (opts.isBusy()) {
      deferred = true
      return
    }
    // A pending debounce already covers this request. A pending retry is
    // replaced so a fresh trigger (e.g. `online`) runs promptly.
    if (timer && timerKind === 'debounce') return
    schedule(debounceMs, 'debounce')
  }

  async function run() {
    if (disposed || inFlight) return
    if (opts.isBusy()) {
      deferred = true
      return
    }

    inFlight = true
    queued = false
    const epochAtStart = opts.getActionEpoch()
    const realtimeSeqAtStart = opts.getRealtimeSeq()

    let snapshot: T
    try {
      snapshot = await opts.fetchSnapshot()
    } catch (error) {
      inFlight = false
      if (disposed) return
      const willRetry = failures < retryDelays.length
      opts.onFetchError?.(error, { attempt: failures + 1, willRetry })
      if (willRetry) {
        schedule(retryDelays[failures], 'retry')
        failures += 1
      } else {
        // Give up until the next external trigger — never loop on our own.
        failures = 0
      }
      return
    }

    // Wait (still "in flight", so new requests coalesce) until queued Realtime
    // updates have committed. Usually already true, or true within a frame.
    let settleChecks = 0
    while (!disposed && !isSettled() && settleChecks < maxSettleChecks) {
      await sleep(settleCheckMs)
      settleChecks += 1
    }

    inFlight = false
    if (disposed) return

    // A user action started while we were fetching: the snapshot may predate
    // it, so don't apply. Re-run once the action settles.
    if (opts.getActionEpoch() !== epochAtStart || opts.isBusy()) {
      if (opts.isBusy()) deferred = true
      else schedule(debounceMs, 'debounce')
      return
    }

    if (!isSettled()) {
      // Never observed in practice; don't risk overwriting uncommitted state.
      // Drop this snapshot and wait for the next external trigger.
      console.warn('[resync] local state did not settle; snapshot dropped')
      queued = false
      return
    }

    failures = 0
    try {
      opts.apply(snapshot, { realtimeSeqAtStart })
    } catch (error) {
      console.error('[resync] failed to apply snapshot', error)
    }

    if (queued) {
      queued = false
      schedule(debounceMs, 'debounce')
    }
  }

  return {
    request: () => request(),
    notifyIdle() {
      if (disposed || !deferred || opts.isBusy()) return
      deferred = false
      request()
    },
    dispose() {
      disposed = true
      if (timer) clearTimeout(timer)
      timer = null
    },
  }
}
