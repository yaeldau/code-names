'use client'

import { useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
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

interface CluePanelProps { game: Game; isSpymaster: boolean; activeClue: Clue | null }

export default function CluePanel({ game, isSpymaster, activeClue }: CluePanelProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const supabase = useMemo(() => createClient(), [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (game.status !== 'active') return
    const formData = new FormData(e.currentTarget)
    const word = (formData.get('word') as string)?.trim()
    const count = parseInt(formData.get('count') as string ?? '1')
    if (!word) return
    formRef.current?.reset()
    await supabase.from('clues').insert({
      game_id: game.id, team: game.current_team, word, count: isNaN(count) ? 1 : count,
    })
  }

  const formHidden = activeClue !== null || game.status === 'finished'

  return (
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
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors ${TEAM_BTN[game.current_team]}`}
          >
            שלח
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
  )
}
