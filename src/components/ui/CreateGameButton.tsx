'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createNewGame } from '@/app/actions'
import type { GameMode } from '@/types/game'

interface CreateGameButtonProps {
  label: string
  className: string
  /** Content mode for a freshly created game. Ignored when currentGameId is set (rematch keeps the current game's mode). */
  mode?: GameMode
  /** When set, delegates new game creation to GameBoard (which broadcasts to all clients). */
  currentGameId?: string
}

export default function CreateGameButton({ label, className, mode = 'words', currentGameId }: CreateGameButtonProps) {
  const [pending, setPending] = useState(false)
  const router = useRouter()
  // Pre-warmed game promise — started on mount so the game is likely ready by click time.
  // Keyed by mode so a mode switch after mount doesn't serve a stale pre-created game.
  const preCreated = useRef<{ mode: GameMode; promise: Promise<string | null> } | null>(null)

  useEffect(() => {
    if (currentGameId) return
    preCreated.current = { mode, promise: createNewGame(mode).catch(() => null) }
  }, [currentGameId, mode])

  async function handleClick() {
    if (pending) return
    setPending(true)

    if (currentGameId) {
      // GameBoard owns the Supabase channel — delegate so it can broadcast to all clients.
      window.dispatchEvent(new CustomEvent('codenames:start-new-game'))
      return
    }

    const cached = preCreated.current?.mode === mode ? preCreated.current.promise : null
    const code = (await cached) ?? await createNewGame(mode).catch(() => null)
    if (code) {
      router.push(`/game/${code}`)
    } else {
      setPending(false)
    }
  }

  return (
    <button onClick={handleClick} disabled={pending} className={`${className} relative`}>
      <span className={pending ? 'invisible' : ''}>{label}</span>
      {pending && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        </span>
      )}
    </button>
  )
}
