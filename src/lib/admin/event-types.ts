/**
 * Local types for `game_events`, mirroring the schema defined in the
 * not-yet-deployed migration `supabase/migrations/20260903112807_atomic_reveal_events.sql`
 * (Phase 0 — see the admin dashboard plan). Deliberately defined here rather
 * than in `src/types/game.ts`/`database.ts` so this feature stays fully
 * additive and doesn't collide with that migration's own type changes when
 * it eventually lands — at that point these can be replaced with the real
 * shared types.
 */

export type GameEventType = 'CARD_REVEALED' | 'TURN_ENDED' | 'GAME_ENDED'

export interface GameEvent {
  id: number
  game_id: string
  event_type: GameEventType
  payload: Record<string, unknown>
  created_at: string
}