'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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

export async function createGame(): Promise<void> {
  const supabase = await createClient()

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

  if (error || !data?.code) throw new Error('Failed to create game')

  redirect(`/game/${data.code}`)
}
