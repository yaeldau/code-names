'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import words from '@/words/hebrew.json'
import type { CardType } from '@/types/game'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

interface CreateGameButtonProps {
  label: string
  className: string
  /** When set, delegates new game creation to GameBoard (which broadcasts to all clients). */
  currentGameId?: string
}

export default function CreateGameButton({ label, className, currentGameId }: CreateGameButtonProps) {
  const [pending, setPending] = useState(false)
  const router = useRouter()

  async function handleClick() {
    if (pending) return
    setPending(true)

    if (currentGameId) {
      // GameBoard owns the Supabase channel — delegate so it can broadcast to all clients.
      // Page will navigate away; no need to reset pending.
      window.dispatchEvent(new CustomEvent('codenames:start-new-game'))
      return
    }

    // Homepage / standalone: create a fresh game for this user only
    const supabase = createClient()
    const selectedWords = shuffle(words as string[]).slice(0, 25)
    const types = shuffle<CardType>([
      ...Array<CardType>(9).fill('red'),
      ...Array<CardType>(8).fill('blue'),
      ...Array<CardType>(7).fill('neutral'),
      'assassin',
    ])

    const { data, error } = await supabase.rpc('create_game', {
      p_words: selectedWords,
      p_types: types,
    })

    if (error || !data?.code) {
      setPending(false) // only reset on failure — on success the page navigates away
      return
    }
    router.push(`/game/${data.code}`)
    // Leave pending=true; spinner stays until the new page mounts and this component unmounts
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
