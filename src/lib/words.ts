import type { CardType } from '@/types/game'

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function buildCardTypes(): CardType[] {
  return shuffle<CardType>([
    ...Array<CardType>(9).fill('red'),
    ...Array<CardType>(8).fill('blue'),
    ...Array<CardType>(7).fill('neutral'),
    'assassin',
  ])
}

export function sampleWords(wordBank: string[]): string[] {
  return shuffle(wordBank).slice(0, 25)
}
