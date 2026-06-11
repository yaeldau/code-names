'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import words from '@/words/hebrew.json'
import type { CardType, Team, GameStatus } from '@/types/game'

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('')
}

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

  // Find a unique code
  let code = generateCode()
  for (let i = 0; i < 5; i++) {
    const { data } = await supabase.from('games').select('id').eq('code', code).maybeSingle()
    if (!data) break
    code = generateCode()
  }

  const { data: game, error } = await supabase
    .from('games')
    .insert({ code, status: 'active' as GameStatus })
    .select()
    .single()

  if (error || !game) throw new Error('Failed to create game')

  const { error: cardsError } = await supabase.from('cards').insert(
    selectedWords.map((word, i) => ({
      game_id: game.id,
      word,
      type: types[i],
      position: i,
    }))
  )

  if (cardsError) throw new Error('Failed to create cards')

  redirect(`/game/${code}`)
}

export async function revealCard(cardId: string, gameId: string): Promise<void> {
  const supabase = await createClient()

  const [{ data: card }, { data: game }] = await Promise.all([
    supabase.from('cards').select('*').eq('id', cardId).single(),
    supabase.from('games').select('*').eq('id', gameId).single(),
  ])

  if (!card || !game || card.revealed || game.status !== 'active') return

  await supabase.from('cards').update({ revealed: true }).eq('id', cardId)

  const opponent: Team = game.current_team === 'red' ? 'blue' : 'red'
  const updates: {
    status?: GameStatus
    winner?: Team
    current_team?: Team
    red_remaining?: number
    blue_remaining?: number
  } = {}

  if (card.type === 'assassin') {
    updates.status = 'finished'
    updates.winner = opponent
  } else {
    if (card.type === 'red') updates.red_remaining = game.red_remaining - 1
    if (card.type === 'blue') updates.blue_remaining = game.blue_remaining - 1

    const redLeft = updates.red_remaining ?? game.red_remaining
    const blueLeft = updates.blue_remaining ?? game.blue_remaining

    if (redLeft === 0) {
      updates.status = 'finished'
      updates.winner = 'red'
    } else if (blueLeft === 0) {
      updates.status = 'finished'
      updates.winner = 'blue'
    } else if (card.type !== game.current_team) {
      // Neutral or opponent card: end turn
      updates.current_team = opponent
    }
    // Own card: turn continues
  }

  await supabase.from('games').update(updates).eq('id', gameId)
}

export async function addClue(gameId: string, formData: FormData): Promise<void> {
  const word = (formData.get('word') as string | null)?.trim()
  const countRaw = formData.get('count') as string | null
  const count = parseInt(countRaw ?? '1')

  if (!word) return

  const supabase = await createClient()
  const { data: game } = await supabase
    .from('games')
    .select('current_team, status')
    .eq('id', gameId)
    .single()

  if (!game || game.status !== 'active') return

  await supabase.from('clues').insert({
    game_id: gameId,
    team: game.current_team,
    word,
    count: isNaN(count) ? 1 : count,
  })
}

export async function endTurn(gameId: string): Promise<void> {
  const supabase = await createClient()

  const { data: game } = await supabase
    .from('games')
    .select('current_team, status')
    .eq('id', gameId)
    .single()

  if (!game || game.status !== 'active') return

  await supabase
    .from('games')
    .update({ current_team: game.current_team === 'red' ? 'blue' : 'red' })
    .eq('id', gameId)
}
