/**
 * Pure helpers for turning a bulk `.in('game_id', gameIds)` read into a
 * per-game count, chunked to stay well under the URL-length limits that a
 * large `.in()` list can hit (see the root-cause note in queries.ts).
 *
 * Split out from queries.ts specifically so this logic is testable without a
 * live Supabase client or a Next.js request scope (createServiceClient()
 * requires cookies() from an actual request).
 */

// Comfortably under typical gateway/proxy URL-length limits even for
// full-length UUIDs (36 chars + separator ≈ 5.5KB at this size).
export const GAME_ID_CHUNK_SIZE = 150

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

export interface ChunkFetchResult {
  gameIds: string[]
  /** Rows already filtered to whatever should count as "one" for this metric
   * (e.g. only revealed cards) — null means the fetch for this chunk failed. */
  rows: { game_id: string }[] | null
}

export interface CountsByGame {
  /** game_id -> count, present only for games whose chunk succeeded. */
  counts: Map<string, number>
  /** game_ids whose chunk failed — callers must treat these as unknown, never 0. */
  failedGameIds: Set<string>
}

/**
 * Merges per-chunk fetch results into a game_id -> count map. A game in a
 * chunk that failed gets no entry in `counts` and is listed in
 * `failedGameIds` instead — this is what lets the UI show "—" rather than a
 * misleading 0 for exactly the games affected, while every other game (whose
 * chunk succeeded) still gets a precise count, including a real 0.
 */
export function mergeCountsByGame(chunkResults: ChunkFetchResult[]): CountsByGame {
  const counts = new Map<string, number>()
  const failedGameIds = new Set<string>()

  for (const chunk of chunkResults) {
    if (chunk.rows === null) {
      for (const id of chunk.gameIds) failedGameIds.add(id)
      continue
    }
    for (const id of chunk.gameIds) counts.set(id, 0)
    for (const row of chunk.rows) {
      counts.set(row.game_id, (counts.get(row.game_id) ?? 0) + 1)
    }
  }

  return { counts, failedGameIds }
}

/** Looks up one game's count, returning null (unknown) if its chunk failed. */
export function lookupCount(gameId: string, result: CountsByGame): number | null {
  if (result.failedGameIds.has(gameId)) return null
  return result.counts.get(gameId) ?? 0
}
