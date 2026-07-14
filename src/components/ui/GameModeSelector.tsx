'use client'

import { useState } from 'react'
import CreateGameButton from './CreateGameButton'
import type { GameMode } from '@/types/game'

const MODES: { value: GameMode; label: string; icon: string }[] = [
  { value: 'words', label: 'מילים', icon: '🔤' },
  { value: 'pictures', label: 'תמונות', icon: '🖼️' },
]

/** Lets the player pick a content mode before creating a game. Add a new mode
 * by adding it to this list plus a deck in src/decks/registry.ts. */
export default function GameModeSelector() {
  const [mode, setMode] = useState<GameMode>('words')

  return (
    <div className="w-full max-w-xs flex flex-col gap-3">
      <div className="flex rounded-2xl border border-gray-200 bg-white p-1 gap-1">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMode(m.value)}
            aria-pressed={mode === m.value}
            className={[
              'flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition-colors',
              mode === m.value ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            <span aria-hidden="true">{m.icon}</span>
            {m.label}
          </button>
        ))}
      </div>

      <CreateGameButton
        label="צור משחק חדש"
        mode={mode}
        className="w-full rounded-2xl bg-gray-900 py-4 text-lg font-semibold text-white hover:bg-gray-800 active:bg-gray-950 disabled:opacity-50 transition-colors"
      />
    </div>
  )
}
