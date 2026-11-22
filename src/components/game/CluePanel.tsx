'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  CLUE_MAX_LENGTH,
  CLUE_MESSAGES,
  createClueSubmitter,
  findClue,
  newClueId,
  submitClue,
  type SubmitterState,
} from '@/lib/clue-submit'
import type { Clue, Game } from '@/types/game'

const TEAM_COLOR: Record<string, string> = {
  red:  'text-game-red',
  blue: 'text-game-blue',
}

const TEAM_BORDER: Record<string, string> = {
  red:  'border-game-red/25',
  blue: 'border-game-blue/25',
}

const TEAM_BTN: Record<string, string> = {
  red:  'bg-game-red hover:bg-game-red-dark',
  blue: 'bg-game-blue hover:bg-game-blue-dark',
}

interface CluePanelProps {
  game: Game
  isSpymaster: boolean
  activeClue: Clue | null
  /** A clue was confirmed saved by the server (may arrive before or after Realtime). */
  onClueSaved?: (clue: Clue) => void
  /** Submission failed or its outcome is unknown — re-read server state. */
  onSyncNeeded?: () => void
}

export default function CluePanel({ game, isSpymaster, activeClue, onClueSaved, onSyncNeeded }: CluePanelProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const supabase = useMemo(() => createClient(), [])
  const [state, setState] = useState<SubmitterState>({ sending: false, message: null })

  // Latest callbacks, so the submitter (created once) never calls stale ones.
  const callbacks = useRef({ onClueSaved, onSyncNeeded })
  useEffect(() => { callbacks.current = { onClueSaved, onSyncNeeded } })

  // One submitter per mounted form: it owns the in-flight guard and the
  // retry id, so double clicks / repeated Enter can never insert twice.
  const submitterRef = useRef<ReturnType<typeof createClueSubmitter> | null>(null)
  useEffect(() => {
    const submitter = createClueSubmitter({
      submit: (draft) => submitClue(supabase, draft),
      lookup: (id) => findClue(supabase, id),
      newId: newClueId,
      onState: setState,
      onSaved: (clue) => {
        // Clear only after the server confirmed the clue.
        formRef.current?.reset()
        callbacks.current.onClueSaved?.(clue)
      },
      onSyncNeeded: () => callbacks.current.onSyncNeeded?.(),
    })
    submitterRef.current = submitter
    return () => {
      submitter.dispose()
      if (submitterRef.current === submitter) submitterRef.current = null
    }
  }, [supabase])

  // Our clue may be confirmed by Realtime or an A1 resync instead of (or
  // before) its own response — e.g. after a lost acknowledgment.
  const activeClueId = activeClue?.id
  useEffect(() => {
    if (!activeClueId) return
    if (submitterRef.current?.markConfirmed(activeClueId)) formRef.current?.reset()
    // A clue is in play: an old error message no longer applies.
    setState((s) => (s.sending || !s.message ? s : { sending: false, message: null }))
  }, [activeClueId])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (game.status !== 'active') return
    const formData = new FormData(e.currentTarget)
    const count = parseInt((formData.get('count') as string) ?? '1')
    void submitterRef.current?.submit({
      gameId: game.id,
      team: game.current_team,
      word: (formData.get('word') as string) ?? '',
      count: isNaN(count) ? 1 : count,
    })
  }

  const formHidden = activeClue !== null || game.status === 'finished'

  return (
    <>
    <div className={`rounded-2xl border-2 bg-surface shadow-sm ${TEAM_BORDER[game.current_team]} relative h-16`}>

      {/* Spymaster form */}
      {isSpymaster && (
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className={`absolute inset-0 flex items-center px-3 gap-2 ${formHidden ? 'invisible pointer-events-none' : ''}`}
        >
          <input
            name="word"
            placeholder="מילת רמז"
            required
            maxLength={CLUE_MAX_LENGTH}
            autoComplete="off"
            dir="rtl"
            className="flex-1 min-w-0 rounded-xl border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy/15 focus:border-navy/30 placeholder:text-ink-faint text-ink"
          />
          <select
            name="count"
            defaultValue="2"
            className="rounded-xl border border-border bg-bg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy/15 text-ink"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <option key={n} value={n}>{n}</option>)}
            <option value="0">∞</option>
          </select>
          <button
            type="submit"
            disabled={state.sending}
            aria-busy={state.sending}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${TEAM_BTN[game.current_team]}`}
          >
            {state.sending ? 'שולח…' : 'שלח'}
          </button>
        </form>
      )}

      {/* Clue / waiting display */}
      {(activeClue || !isSpymaster) && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 leading-none pointer-events-none">
          {activeClue ? (
            <>
              <span className={`text-2xl font-bold ${TEAM_COLOR[activeClue.team]}`}>{activeClue.word}</span>
              <span className="text-border text-xl font-light select-none">·</span>
              <span className={`text-2xl font-bold ${TEAM_COLOR[activeClue.team]} opacity-50`}>
                {activeClue.count === 0 ? '∞' : activeClue.count}
              </span>
            </>
          ) : (
            <p className="text-sm text-ink-faint">ממתין לרמז מהמרגל...</p>
          )}
        </div>
      )}
    </div>

    {/* Submission problems — only for the spymaster, only while the form is in use */}
    {isSpymaster && state.message && !formHidden && (
      <p role="alert" className="text-center text-xs font-medium text-game-red">
        {CLUE_MESSAGES[state.message]}
      </p>
    )}
    </>
  )
}
