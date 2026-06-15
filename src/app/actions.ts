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

function newGameWords() {
  const selectedWords = shuffle(words as string[]).slice(0, 25)
  const types = shuffle<CardType>([
    ...Array<CardType>(9).fill('red'),
    ...Array<CardType>(8).fill('blue'),
    ...Array<CardType>(7).fill('neutral'),
    'assassin',
  ])
  return { selectedWords, types }
}

export async function createGame(): Promise<void> {
  const supabase = await createClient()
  const { selectedWords, types } = newGameWords()

  const { data, error } = await supabase.rpc('create_game', {
    p_words: selectedWords,
    p_types: types,
  })

  if (error || !data?.code) throw new Error('Failed to create game')

  redirect(`/game/${data.code}`)
}

/** Creates a new game and returns its code + spymaster token for broadcasting. */
export async function startNewGame(
  currentGameId: string
): Promise<{ code: string; spymasterToken: string }> {
  const supabase = await createClient()
  const { selectedWords, types } = newGameWords()

  const { data, error } = await supabase.rpc('create_game', {
    p_words: selectedWords,
    p_types: types,
  })

  if (error || !data?.code) throw new Error('Failed to create game')

  const code = data.code as string

  // Always fetch spymaster_token from the games table — works regardless of
  // which version of the create_game RPC is installed.
  const { data: newGame } = await supabase
    .from('games')
    .select('spymaster_token')
    .eq('code', code)
    .single()

  const spymasterToken = newGame?.spymaster_token ?? ''

  // Optionally store in DB for late joiners (requires migration 007 columns).
  // Fails silently if the columns don't exist — broadcast is the primary mechanism.
  await supabase
    .from('games')
    .update({ next_game_code: code, next_game_spymaster_token: spymasterToken })
    .eq('id', currentGameId)
    .is('next_game_code', null)

  return { code, spymasterToken }
}
