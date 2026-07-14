import type { GameMode } from '@/types/game'

/**
 * A single piece of content a card can display. `imageKey` is set only for
 * decks in Pictures mode — it resolves to a file via `imagePathFor()`.
 * `label` is always present: it's the word text in Words mode, and the
 * Hebrew alt-text / spymaster label in Pictures mode.
 */
export interface DeckCard {
  label: string
  imageKey?: string
}

/** A themed bank of content for one game mode (e.g. mode=pictures, theme=animals). */
export interface Deck {
  mode: GameMode
  theme: string
  labelHe: string
  cards: DeckCard[]
}
