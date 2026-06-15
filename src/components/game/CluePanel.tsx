'use client'

import { useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Clue, Game } from '@/types/game'

const TEAM_COLOR: Record<string, string> = {
  red: 'text-red-600',
  blue: 'text-blue-600',
}

interface CluePanelProps {
  game: Game
  isSpymaster: boolean
  activeClue: Clue | null
}

export default function CluePanel({ game, isSpymaster, activeClue }: CluePanelProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const supabase = useMemo(() => createClient(), [])

  if (game.status === 'finished') {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="min-h-8" />
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
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
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm space-y-2">
      {/* Clue display — visible to everyone */}
      <div className="min-h-8 flex items-center justify-center">
        {activeClue ? (
          <div className="flex items-baseline gap-2">
            <span className={`text-xl font-bold ${TEAM_COLOR[activeClue.team]}`}>
              {activeClue.word}
            </span>
            <span className="text-base text-gray-500">
              {activeClue.count === 0 ? '∞' : activeClue.count}
            </span>
          </div>
        ) : (
          <p className="text-sm text-gray-400">ממתין לרמז מהמרגל...</p>
        )}
      </div>

      {/* Spymaster input — always rendered to prevent layout jump; hidden after submit */}
      {isSpymaster && (
        <form ref={formRef} onSubmit={handleSubmit} className={`flex gap-2 ${activeClue ? 'invisible' : ''}`}>
          <input
            name="word"
            placeholder="מילת רמז"
            required
            autoComplete="off"
            dir="rtl"
            className="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <select
            name="count"
            defaultValue="2"
            className="rounded-lg border border-gray-200 px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
            <option value="0">∞</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-700 transition-colors"
          >
            שלח
          </button>
        </form>
      )}
    </div>
  )
}
