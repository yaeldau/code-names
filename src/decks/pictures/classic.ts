import data from './classic.json'
import type { Deck } from '../types'

export const picturesClassic: Deck = {
  mode: 'pictures',
  theme: 'classic',
  labelHe: 'קלאסי',
  cards: data.map(({ id, label }) => ({ label, imageKey: id })),
}
