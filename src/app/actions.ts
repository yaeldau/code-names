'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { buildCardTypes } from '@/lib/words'
import { getDeck, sampleDeck } from '@/decks/registry'
import type { GameMode } from '@/types/game'

function newGamePayload(mode: GameMode, theme?: string) {
  const deck = getDeck(mode, theme)
  const sampled = sampleDeck(deck, 25)
  return {
    words: sampled.map((c) => c.label),
    imageKeys: sampled.some((c) => c.imageKey) ? sampled.map((c) => c.imageKey ?? null) : null,
    types: buildCardTypes(),
    mode: deck.mode,
    theme: deck.theme,
  }
}

export async function createGame(mode: GameMode = 'words', theme?: string): Promise<void> {
  const supabase = await createClient()
  const { words, imageKeys, types, mode: resolvedMode, theme: resolvedTheme } = newGamePayload(mode, theme)

  const { data, error } = await supabase.rpc('create_game', {
    p_words: words,
    p_types: types,
    p_image_keys: imageKeys,
    p_mode: resolvedMode,
    p_theme: resolvedTheme,
  })

  if (error || !data?.code) throw new Error('Failed to create game')

  redirect(`/game/${data.code}`)
}

/** Creates a new game and returns its code (used by the homepage button for pre-warming). */
export async function createNewGame(mode: GameMode = 'words', theme?: string): Promise<string> {
  const supabase = await createClient()
  const { words, imageKeys, types, mode: resolvedMode, theme: resolvedTheme } = newGamePayload(mode, theme)

  const { data, error } = await supabase.rpc('create_game', {
    p_words: words,
    p_types: types,
    p_image_keys: imageKeys,
    p_mode: resolvedMode,
    p_theme: resolvedTheme,
  })

  if (error || !data?.code) throw new Error('Failed to create game')
  return data.code as string
}

/** Creates a new game (same mode/theme as the current one) and returns its code + spymaster token for broadcasting. */
export async function startNewGame(
  currentGameId: string,
  mode: GameMode = 'words',
  theme?: string
): Promise<{ code: string; spymasterToken: string }> {
  const supabase = await createClient()
  const { words, imageKeys, types, mode: resolvedMode, theme: resolvedTheme } = newGamePayload(mode, theme)

  const { data, error } = await supabase.rpc('create_game', {
    p_words: words,
    p_types: types,
    p_image_keys: imageKeys,
    p_mode: resolvedMode,
    p_theme: resolvedTheme,
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
