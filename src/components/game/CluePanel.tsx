'use client'

import { useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Clue, Game } from '@/types/game'

const TEAM_COLOR: Record<string, string> = {
  red: 'text-red-600',
  blue: 'text-blue-600',
}

const TEAM_BORDER: Record<string, string> = {
  red: 'border-red-200',
  blue: 'border-blue-200',
}

interface CluePanelProps {
  game: Game
  isSpymaster: boolean
  activeClue: Clue | null
}

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
      game_id: game.id,
      team: game.current_team,
      word,
      count: isNaN(count) ? 1 : count,
    })
  }

  return (
    <div className={`rounded-xl border-2 px-4 py-3 shadow-sm bg-white ${TEAM_BORDER[game.current_team]}`}>

      {/* Active clue — shown to everyone */}
      {activeClue && (
        <div className="min-h-8 flex items-center justify-center gap-2 leading-none">
          <span className={`text-2xl font-bold ${TEAM_COLOR[activeClue.team]}`}>
            {activeClue.word}
          </span>
          <span className="text-gray-300 text-xl font-light select-none">·</span>
          <span className={`text-2xl font-bold ${TEAM_COLOR[activeClue.team]} opacity-50`}>
            {activeClue.count === 0 ? '∞' : activeClue.count}
          </span>
        </div>
      )}

      {/* No active clue — different message per role */}
      {!activeClue && (
        <div className="min-h-8 flex items-center justify-center">
          {isSpymaster ? (
            <p className="text-xs font-medium text-gray-400 tracking-wide">הזן רמז לקבוצה שלך</p>
          ) : (
            <p className="text-sm text-gray-400">ממתין לרמז מהמרגל...</p>
          )}
        </div>
      )}

      {/* Spymaster input — always rendered for layout stability; hidden when clue given or game over */}
      {isSpymaster && (
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className={`flex gap-2 mt-2 ${(activeClue || game.status === 'finished') ? 'invisible' : ''}`}
        >
          <input
            name="word"
            placeholder="מילת רמז"
            required
            autoComplete="off"
            dir="rtl"
            className="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
          <select
            name="count"
            defaultValue="2"
            className="rounded-lg border border-gray-200 px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
            <option value="0">∞</option>
          </select>
          <button
            type="submit"
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors ${
              game.current_team === 'red'
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            שלח
          </button>
        </form>
      )}
    </div>
  )
}
