import words from '@/words/hebrew.json'
import type { Deck } from '../types'

export const wordsClassic: Deck = {
  mode: 'words',
  theme: 'classic',
  labelHe: 'קלאסי',
  cards: (words as string[]).map((label) => ({ label })),
}
