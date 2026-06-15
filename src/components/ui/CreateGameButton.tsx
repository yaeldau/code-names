'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import words from '@/words/hebrew.json'
import { sampleWords, buildCardTypes } from '@/lib/words'

interface CreateGameButtonProps {
  label: string
  className: string
  /** When set, delegates new game creation to GameBoard (which broadcasts to all clients). */
  currentGameId?: string
}

async function createGameCode(): Promise<string | null> {
  const supabase = createClient()
  const { data } = await supabase.rpc('create_game', {
    p_words: sampleWords(words as string[]),
    p_types: buildCardTypes(),
  })
  return data?.code ?? null
}

export default function CreateGameButton({ label, className, currentGameId }: CreateGameButtonProps) {
  const [pending, setPending] = useState(false)
  const router = useRouter()
  // Pre-warmed game promise — started on mount so the game is likely ready by click time
  const preCreated = useRef<Promise<string | null> | null>(null)

  useEffect(() => {
    if (currentGameId) return
    preCreated.current = createGameCode()
  }, [currentGameId])

  async function handleClick() {
    if (pending) return
    setPending(true)

    if (currentGameId) {
      // GameBoard owns the Supabase channel — delegate so it can broadcast to all clients.
      window.dispatchEvent(new CustomEvent('codenames:start-new-game'))
      return
    }

    const code = (await preCreated.current) ?? (await createGameCode())
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
