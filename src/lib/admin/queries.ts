import { createServiceClient } from '@/lib/supabase/server'
import type { Card, Clue, GameStatus, Team } from '@/types/game'
import type { GameEvent } from './event-types'
import { chunkArray, mergeCountsByGame, lookupCount, GAME_ID_CHUNK_SIZE, type ChunkFetchResult } from './aggregate'
import { resolvePagination, GAMES_PAGE_SIZE } from './pagination'

// Service-role reads, same trusted-server-only pattern already used by
// src/app/api/cron/cleanup/route.ts. Every query below lists columns
// explicitly — never `select('*')` — specifically to keep
// spymaster_token/next_game_spymaster_token out of anything this feature
// touches.

export interface AdminGameSummary {
  code: string
  status: GameStatus
  current_team: Team
  winner: Team | null
  red_remaining: number
  blue_remaining: number
  created_at: string
  /** null means this specific count could not be loaded — never render it as 0. */
  revealedCount: number | null
  clueCount: number | null
}

export interface AdminOverview {
  /** Exact DB counts — independent of the current page, never derived from
   * the fetched list (see the investigation note below). */
  totalCount: number
  notFinishedCount: number
  finishedCount: number
  games: AdminGameSummary[]
  page: number
  totalPages: number
  pageSize: number
}

const GAME_SUMMARY_COLUMNS =
  'id, code, status, current_team, winner, red_remaining, blue_remaining, created_at'

/**
 * Dashboard summary counts + one page of game history.
 *
 * Summary counts are three independent `count: 'exact', head: true` queries
 * against the whole table, run concurrently — never derived from `.length`
 * of a fetched list. This fixes a real production bug: the previous version
 * fetched games with no `.range()`/`.limit()`, which silently hit
 * PostgREST's default 1000-row cap, so both the totals and the per-game
 * lists were wrong once more than 1000 games existed (which they now do:
 * ~1,831 at last count).
 *
 * "Not finished" is queried as `status != 'finished'` rather than
 * `status = 'active'` so it stays correct if the currently-unused `waiting`
 * status is ever reintroduced — see CLAUDE.md's note on status semantics.
 *
 * The game list itself is explicitly paginated via `.range()`, and per-game
 * clue/revealed-card counts are aggregated only for this page's games (at
 * most GAMES_PAGE_SIZE), not the whole retained history — reusing the same
 * chunked aggregation helpers as before, just fed a much smaller id list.
 */
export async function getAdminGamesOverview(rawPage?: string): Promise<AdminOverview> {
  const supabase = await createServiceClient()

  const [totalResult, notFinishedResult, finishedResult] = await Promise.all([
    supabase.from('games').select('id', { count: 'exact', head: true }),
    supabase.from('games').select('id', { count: 'exact', head: true }).neq('status', 'finished'),
    supabase.from('games').select('id', { count: 'exact', head: true }).eq('status', 'finished'),
  ])

  if (totalResult.error) console.error('[admin] failed to load total games count', totalResult.error)
  if (notFinishedResult.error) console.error('[admin] failed to load not-finished games count', notFinishedResult.error)
  if (finishedResult.error) console.error('[admin] failed to load finished games count', finishedResult.error)

  const totalCount = totalResult.count ?? 0
  const notFinishedCount = notFinishedResult.count ?? 0
  const finishedCount = finishedResult.count ?? 0

  // Computed from this request's own fresh totalCount, so page/totalPages
  // stay internally consistent even if the real count changes between
  // separate requests — a stale/invalid ?page= value clamps rather than
  // producing a negative offset or an out-of-range .range() call.
  const { page, totalPages, offset, limit } = resolvePagination(rawPage, totalCount, GAMES_PAGE_SIZE)

  const { data: games, error: gamesError } = await supabase
    .from('games')
    .select(GAME_SUMMARY_COLUMNS)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (gamesError) console.error('[admin] failed to load games page', gamesError)

  const rows: {
    id: string
    code: string
    status: GameStatus
    current_team: Team
    winner: Team | null
    red_remaining: number
    blue_remaining: number
    created_at: string
  }[] = games ?? []

  if (rows.length === 0) {
    return { totalCount, notFinishedCount, finishedCount, games: [], page, totalPages, pageSize: limit }
  }

  const gameIds = rows.map((game) => game.id)
  const idChunks = chunkArray(gameIds, GAME_ID_CHUNK_SIZE)

  const [cardChunkResults, clueChunkResults] = await Promise.all([
    Promise.all(
      idChunks.map(async (chunk): Promise<ChunkFetchResult> => {
        const { data, error } = await supabase.from('cards').select('game_id, revealed').in('game_id', chunk)
        if (error) console.error('[admin] cards bulk count query failed for a chunk', error)
        const rows = error || !data ? null : data.filter((row) => row.revealed).map((row) => ({ game_id: row.game_id }))
        return { gameIds: chunk, rows }
      })
    ),
    Promise.all(
      idChunks.map(async (chunk): Promise<ChunkFetchResult> => {
        const { data, error } = await supabase.from('clues').select('game_id').in('game_id', chunk)
        if (error) console.error('[admin] clues bulk count query failed for a chunk', error)
        return { gameIds: chunk, rows: error || !data ? null : data }
      })
    ),
  ])

  const revealedCounts = mergeCountsByGame(cardChunkResults)
  const clueCounts = mergeCountsByGame(clueChunkResults)

  const summaries: AdminGameSummary[] = rows.map((game) => ({
    code: game.code,
    status: game.status,
    current_team: game.current_team,
    winner: game.winner,
    red_remaining: game.red_remaining,
    blue_remaining: game.blue_remaining,
    created_at: game.created_at,
    revealedCount: lookupCount(game.id, revealedCounts),
    clueCount: lookupCount(game.id, clueCounts),
  }))

  return { totalCount, notFinishedCount, finishedCount, games: summaries, page, totalPages, pageSize: limit }
}

/**
 * Distinguishes *why* a game has no events, rather than a single blank
 * state — see the admin dashboard plan, §11:
 * - `disabled`: GAME_EVENTS_ENABLED_AT isn't set — the feature isn't live
 *   anywhere yet, so game_events is never even queried.
 * - `error`: the feature is declared live but the query itself failed —
 *   shown as a real error, never silently reinterpreted as "not enabled".
 * - `empty-before-tracking`: this game predates the cutover, so the absence
 *   of events is expected (no backfill).
 * - `empty-no-events`: this game was created after the cutover but nothing
 *   eventful has happened yet.
 * - `events`: real rows to render.
 */
export type EventsResult =
  | { state: 'disabled' }
  | { state: 'error' }
  | { state: 'empty-before-tracking' }
  | { state: 'empty-no-events' }
  | { state: 'events'; events: GameEvent[] }

async function getGameEvents(gameId: string, gameCreatedAt: string): Promise<EventsResult> {
  const enabledAt = process.env.GAME_EVENTS_ENABLED_AT
  if (!enabledAt) return { state: 'disabled' }

  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('game_events')
    .select('id, game_id, event_type, payload, created_at')
    .eq('game_id', gameId)
    .order('id')

  if (error) {
    console.error('[admin] failed to load game_events', error)
    return { state: 'error' }
  }

  const events = (data ?? []) as GameEvent[]
  if (events.length > 0) return { state: 'events', events }

  return new Date(gameCreatedAt) < new Date(enabledAt)
    ? { state: 'empty-before-tracking' }
    : { state: 'empty-no-events' }
}

export interface AdminGameDetail {
  code: string
  status: GameStatus
  current_team: Team
  winner: Team | null
  red_remaining: number
  blue_remaining: number
  created_at: string
  cards: Card[]
  /** true if the cards query itself failed — an empty `cards` array in that
   * case means "couldn't load", not "no cards", and must never be shown as 0. */
  cardsUnavailable: boolean
  clues: Clue[]
  cluesUnavailable: boolean
  events: EventsResult
}

const CARD_COLUMNS = 'id, game_id, word, type, position, revealed'
const CLUE_COLUMNS = 'id, game_id, team, word, count, created_at'

export async function getAdminGameDetail(code: string): Promise<AdminGameDetail | null> {
  const supabase = await createServiceClient()

  const { data: game } = await supabase
    .from('games')
    .select('id, code, status, current_team, winner, red_remaining, blue_remaining, created_at')
    .eq('code', code.toUpperCase())
    .single()

  if (!game) return null

  const [cardsResult, cluesResult, events] = await Promise.all([
    supabase.from('cards').select(CARD_COLUMNS).eq('game_id', game.id).order('position'),
    supabase.from('clues').select(CLUE_COLUMNS).eq('game_id', game.id).order('created_at'),
    getGameEvents(game.id, game.created_at),
  ])

  if (cardsResult.error) console.error('[admin] failed to load cards for game detail', cardsResult.error)
  if (cluesResult.error) console.error('[admin] failed to load clues for game detail', cluesResult.error)

  return {
    code: game.code,
    status: game.status,
    current_team: game.current_team,
    winner: game.winner,
    red_remaining: game.red_remaining,
    blue_remaining: game.blue_remaining,
    created_at: game.created_at,
    cards: (cardsResult.data ?? []) as Card[],
    cardsUnavailable: Boolean(cardsResult.error),
    clues: (cluesResult.data ?? []) as Clue[],
    cluesUnavailable: Boolean(cluesResult.error),
    events,
  }
}
