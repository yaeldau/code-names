import type { GameMode } from '@/types/game'
import { shuffle } from '@/lib/words'
import type { Deck, DeckCard } from './types'
import { wordsClassic } from './words/classic'
import { picturesClassic } from './pictures/classic'

/**
 * All decks, grouped by mode then theme slug. Add a new theme by dropping a
 * deck module here — no other code needs to change. Add a new mode by adding
 * a GameMode variant (types/game.ts) plus a DB enum value (migration) and a
 * top-level key here.
 */
const DECKS: Record<GameMode, Record<string, Deck>> = {
  words: { classic: wordsClassic },
  pictures: { classic: picturesClassic },
}

const DEFAULT_THEME: Record<GameMode, string> = { words: 'classic', pictures: 'classic' }

export function getDeck(mode: GameMode, theme?: string): Deck {
  const themes = DECKS[mode]
  return themes[theme ?? ''] ?? themes[DEFAULT_THEME[mode]]
}

export function listDecks(mode: GameMode): Deck[] {
  return Object.values(DECKS[mode])
}

/** Picks `count` unique cards at random from a deck's content bank. */
export function sampleDeck(deck: Deck, count = 25): DeckCard[] {
  return shuffle(deck.cards).slice(0, count)
}

/** Resolves a card's image key to its local static asset path. */
export function imagePathFor(theme: string, imageKey: string): string {
  return `/decks/pictures/${theme}/${imageKey}.svg`
}
