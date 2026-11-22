import type { SupabaseClient } from '@supabase/supabase-js'
import type { Game, Team } from '@/types/game'

/**
 * The two direct gameplay writes GameBoard makes, with explicit save
 * detection. Same requests as before plus `count: 'exact'`.
 *
 * Verified against supabase-js 2.108 + PostgREST 14 (local Supabase):
 * - success                         → { error: null, count: 1 }
 * - RLS-filtered (finished game)    → { error: null, count: 0 }  ← silent without count
 * - no matching row                 → { error: null, count: 0 }
 * - network failure                 → { error: {...}, count: null, status: 0 } (not thrown)
 * `count: null` alone means "unknown" and is not treated as a failure.
 */

type WriteResult = { error: unknown; count: number | null }

function notSaved(r: WriteResult): boolean {
  return Boolean(r.error) || r.count === 0
}

export interface RevealOutcome {
  /** Both writes landed. */
  saved: boolean
  /** The card write landed — the user's reveal itself was saved. */
  cardSaved: boolean
  /**
   * The games-row write was attempted and did not land (no Realtime echo will
   * come for it). Expected today for every *winning* reveal: RLS 008 rejects
   * `status = 'finished'` from clients (see deriveFinishFromCards).
   */
  gameWriteFailed: boolean
  details: unknown[]
}

export async function saveReveal(
  supabase: SupabaseClient,
  gameId: string,
  cardId: string,
  gameUpdates: Partial<Game>
): Promise<RevealOutcome> {
  const hasGameUpdates = Object.keys(gameUpdates).length > 0
  const ops: PromiseLike<WriteResult>[] = [
    supabase.from('cards').update({ revealed: true }, { count: 'exact' }).eq('id', cardId),
  ]
  if (hasGameUpdates) {
    ops.push(supabase.from('games').update(gameUpdates, { count: 'exact' }).eq('id', gameId))
  }

  try {
    const results = await Promise.all(ops)
    return {
      saved: !results.some(notSaved),
      cardSaved: !notSaved(results[0]),
      gameWriteFailed: hasGameUpdates && notSaved(results[1]),
      details: results.map((r) => r.error ?? { count: r.count }),
    }
  } catch (error) {
    // supabase-js returns network errors rather than throwing; this is a backstop.
    return { saved: false, cardSaved: false, gameWriteFailed: hasGameUpdates, details: [error] }
  }
}

export interface EndTurnOutcome {
  saved: boolean
  details: unknown
}

export async function saveEndTurn(
  supabase: SupabaseClient,
  gameId: string,
  nextTeam: Team
): Promise<EndTurnOutcome> {
  try {
    const result = await supabase
      .from('games')
      .update({ current_team: nextTeam }, { count: 'exact' })
      .eq('id', gameId)
    return { saved: !notSaved(result), details: result.error ?? { count: result.count } }
  } catch (error) {
    return { saved: false, details: error }
  }
}
