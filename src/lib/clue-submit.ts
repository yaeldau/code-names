import type { SupabaseClient } from '@supabase/supabase-js'
import type { Clue, Team } from '@/types/game'

/**
 * Reliable clue submission (A2).
 *
 * Idempotency without a schema change: the client chooses the clue's primary
 * key (`clues.id` is a uuid with a default, so an explicit value is accepted).
 * Every retry of the same clue reuses that id, so the database itself refuses
 * a second copy (23505) — even when the first request's acknowledgment was
 * lost. Verified against PostgREST 14 + the repo's RLS (local Supabase):
 * - success                      → 201 + row
 * - same id again                → 409, code 23505 (row already exists)
 * - game not active (RLS)        → 401, code 42501
 * - bad value (too long / enum)  → 400, code 22001 / 22P02
 * - network failure / abort      → status 0, empty code (outcome unknown)
 */

export interface ClueDraft {
  id: string
  gameId: string
  team: Team
  word: string
  count: number
}

export type ClueSubmitOutcome =
  | { kind: 'saved'; clue: Clue }
  /** Definitely not saved. `not-allowed`: RLS (game no longer active). */
  | { kind: 'rejected'; reason: 'not-allowed' | 'invalid' }
  /** May or may not have been saved — must be reconciled before a new id is used. */
  | { kind: 'uncertain' }

export const CLUE_MAX_LENGTH = 100 // clues.word is varchar(100)
export const CLUE_REQUEST_TIMEOUT_MS = 10_000
export const CLUE_LOOKUP_TIMEOUT_MS = 5_000

type PgError = { code?: string; message?: string } | null
type PgResult<T> = { data: T | null; error: PgError; status: number }

function withTimeout<T>(run: (signal: AbortSignal) => PromiseLike<T>, ms: number): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return Promise.resolve(run(controller.signal)).finally(() => clearTimeout(timer))
}

/** RFC 4122 v4 id. `crypto.randomUUID` only exists in secure contexts, so fall back to getRandomValues. */
export function newClueId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/**
 * Looks a clue up by id. `null` = confirmed absent, `'unknown'` = couldn't tell.
 */
export async function findClue(
  supabase: SupabaseClient,
  id: string,
  timeoutMs = CLUE_LOOKUP_TIMEOUT_MS
): Promise<Clue | null | 'unknown'> {
  try {
    const r = (await withTimeout(
      (signal) => supabase.from('clues').select('*').eq('id', id).abortSignal(signal).maybeSingle(),
      timeoutMs
    )) as PgResult<Clue>
    if (r.error) return 'unknown'
    return r.data ?? null
  } catch {
    return 'unknown'
  }
}

/** One INSERT attempt, classified. Never throws. */
export async function insertClue(
  supabase: SupabaseClient,
  draft: ClueDraft,
  timeoutMs = CLUE_REQUEST_TIMEOUT_MS
): Promise<ClueSubmitOutcome> {
  let r: PgResult<Clue>
  try {
    r = (await withTimeout(
      (signal) =>
        supabase
          .from('clues')
          .insert({ id: draft.id, game_id: draft.gameId, team: draft.team, word: draft.word, count: draft.count })
          .select()
          .abortSignal(signal)
          .single(),
      timeoutMs
    )) as PgResult<Clue>
  } catch {
    return { kind: 'uncertain' }
  }

  if (!r.error && r.data) return { kind: 'saved', clue: r.data }

  const code = r.error?.code ?? ''
  if (code === '23505') {
    // Already inserted by an earlier attempt whose response was lost.
    const existing = await findClue(supabase, draft.id)
    return existing && existing !== 'unknown' ? { kind: 'saved', clue: existing } : { kind: 'uncertain' }
  }
  if (code === '42501') return { kind: 'rejected', reason: 'not-allowed' }
  // A Postgres/PostgREST error code on a 4xx means the request was processed
  // and refused — nothing was written.
  if (code && r.status >= 400 && r.status < 500) return { kind: 'rejected', reason: 'invalid' }
  // status 0 (network / timeout / abort), 5xx, or anything unexpected.
  return { kind: 'uncertain' }
}

/** Insert, and if the outcome is unknown, check the server once before giving up. */
export async function submitClue(supabase: SupabaseClient, draft: ClueDraft): Promise<ClueSubmitOutcome> {
  const outcome = await insertClue(supabase, draft)
  if (outcome.kind !== 'uncertain') return outcome
  const found = await findClue(supabase, draft.id)
  return found && found !== 'unknown' ? { kind: 'saved', clue: found } : { kind: 'uncertain' }
}

/**
 * Which clue should be active after `clue` was confirmed by its INSERT
 * response. The response can arrive late, so it must never override a newer
 * turn (the clue then only goes to history) or a newer clue of the same team.
 */
export function pickActiveClue(
  prev: Clue | null,
  clue: Clue,
  game: { status: string; current_team: Team }
): Clue | null {
  if (prev?.id === clue.id) return prev
  if (game.status !== 'active' || game.current_team !== clue.team) return prev
  if (prev && prev.team === clue.team && Date.parse(prev.created_at) > Date.parse(clue.created_at)) return prev
  return clue
}

// ─── Submitter: per-form state machine ──────────────────────────────────────

export type ClueMessage =
  | 'empty'
  | 'not-allowed'
  | 'invalid'
  | 'uncertain'

export const CLUE_MESSAGES: Record<ClueMessage, string> = {
  empty: 'כתבו מילת רמז.',
  'not-allowed': 'לא ניתן לשלוח רמז עכשיו — ייתכן שהמשחק הסתיים או שהתור התחלף.',
  invalid: 'הרמז לא נשלח. נסו מילה אחרת.',
  uncertain: 'לא הצלחנו לוודא שהרמז נשלח. בדקו את החיבור ולחצו "שלח" שוב — הרמז לא יישלח פעמיים.',
}

export interface SubmitterState {
  sending: boolean
  message: ClueMessage | null
}

export interface ClueSubmitterDeps {
  submit: (draft: ClueDraft) => Promise<ClueSubmitOutcome>
  lookup: (id: string) => Promise<Clue | null | 'unknown'>
  newId: () => string
  onState: (state: SubmitterState) => void
  /** Confirmed saved — show it and clear the form. */
  onSaved: (clue: Clue) => void
  /** Ask the board to re-read server state (A1 resync). */
  onSyncNeeded: () => void
}

interface Attempt extends ClueDraft {
  /** An earlier try may have reached the server. */
  uncertain: boolean
}

export interface ClueSubmitter {
  submit: (input: { gameId: string; team: Team; word: string; count: number }) => Promise<void>
  /**
   * A clue became visible through another path (Realtime / resync). If it is
   * our pending or uncertain attempt, it is confirmed: forget the attempt and
   * return true so the caller can clear the form.
   */
  markConfirmed: (clueId: string) => boolean
  dispose: () => void
}

/**
 * - One request at a time per form (a ref-style guard, not just a disabled button).
 * - The same clue keeps the same id across retries → a retry can't duplicate.
 * - Before switching to a new id after an uncertain outcome, it checks whether
 *   the previous attempt actually landed.
 * - After dispose (unmount), outcomes are ignored but in-flight requests are
 *   not aborted: aborting would only create a new uncertain outcome.
 */
export function createClueSubmitter(deps: ClueSubmitterDeps): ClueSubmitter {
  let inFlight = false
  let disposed = false
  let attempt: Attempt | null = null

  const setState = (s: SubmitterState) => { if (!disposed) deps.onState(s) }

  function saved(clue: Clue) {
    attempt = null
    if (disposed) return
    deps.onSaved(clue)
    setState({ sending: false, message: null })
  }

  async function submit(input: { gameId: string; team: Team; word: string; count: number }) {
    if (inFlight || disposed) return
    const word = input.word.trim()
    if (!word) {
      setState({ sending: false, message: 'empty' })
      return
    }
    inFlight = true
    setState({ sending: true, message: null })

    try {
      const sameClue =
        attempt &&
        attempt.gameId === input.gameId &&
        attempt.team === input.team &&
        attempt.word === word &&
        attempt.count === input.count

      if (attempt && !sameClue && attempt.uncertain) {
        // The user changed the clue after an unknown outcome: make sure the
        // previous one didn't land before sending a different one.
        const previous = await deps.lookup(attempt.id)
        if (previous === 'unknown') {
          setState({ sending: false, message: 'uncertain' })
          return
        }
        if (previous && previous.team === input.team && previous.game_id === input.gameId) {
          // It did land, in this same turn: that clue is the one in play.
          saved(previous)
          return
        }
        // Absent, or it belonged to an earlier turn: safe to send the new one.
        attempt = null
      }
      if (!sameClue) attempt = { id: deps.newId(), ...input, word, uncertain: false }
      const current = attempt!

      const outcome = await deps.submit(current)
      if (attempt !== current) {
        // Confirmed meanwhile through Realtime / resync (markConfirmed).
        setState({ sending: false, message: null })
        return
      }
      switch (outcome.kind) {
        case 'saved':
          saved(outcome.clue)
          return
        case 'rejected':
          attempt = null // definitely not written; a retry may use a new id
          setState({ sending: false, message: outcome.reason })
          if (!disposed) deps.onSyncNeeded()
          return
        case 'uncertain':
          current.uncertain = true
          setState({ sending: false, message: 'uncertain' })
          if (!disposed) deps.onSyncNeeded()
          return
      }
    } finally {
      inFlight = false
    }
  }

  return {
    submit,
    markConfirmed(clueId) {
      if (!attempt || attempt.id !== clueId) return false
      attempt = null
      // If a request is still in flight, its own outcome (saved / 23505 →
      // saved) will settle the state; otherwise clear the stale message now.
      if (!inFlight) setState({ sending: false, message: null })
      return true
    },
    dispose() { disposed = true },
  }
}
