'use client'

import type { Card, GameStatus } from '@/types/game'

interface GameCardProps {
  card: Card
  isSpymaster: boolean
  gameStatus: GameStatus
  onReveal: (id: string) => void
}

function cardClassName(card: Card, isSpymaster: boolean, gameStatus: GameStatus): string {
  if (card.revealed) {
    if (isSpymaster) {
      const styles: Record<string, string> = {
        red:      'bg-red-300   text-red-500   line-through',
        blue:     'bg-blue-300  text-blue-500  line-through',
        neutral:  'bg-stone-300 text-stone-500 line-through',
        assassin: 'bg-neutral-500 text-neutral-300 line-through',
      }
      return styles[card.type]
    }
    const styles: Record<string, string> = {
      red:      'bg-red-600    text-white',
      blue:     'bg-blue-700   text-white',
      neutral:  'bg-stone-400  text-white',
      assassin: 'bg-neutral-950 text-neutral-200',
    }
    return styles[card.type]
  }

  if (gameStatus === 'finished') {
    const styles: Record<string, string> = {
      red:      'bg-red-100   text-red-400',
      blue:     'bg-blue-100  text-blue-400',
      neutral:  'bg-stone-100 text-stone-300',
      assassin: 'bg-neutral-600 text-white',
    }
    return styles[card.type]
  }

  if (isSpymaster) {
    const styles: Record<string, string> = {
      red:      'bg-red-100   text-red-700   font-semibold ring-1 ring-red-300',
      blue:     'bg-blue-100  text-blue-800  font-semibold ring-1 ring-blue-300',
      neutral:  'bg-stone-100 text-stone-500',
      assassin: 'bg-neutral-900 text-neutral-100 font-semibold',
    }
    return styles[card.type]
  }

  return 'bg-amber-50 text-stone-800 shadow-sm hover:bg-amber-100 hover:shadow-md active:scale-95 cursor-pointer'
}

export default function GameCard({ card, isSpymaster, gameStatus, onReveal }: GameCardProps) {
  const clickable = !card.revealed && gameStatus === 'active' && !isSpymaster

  return (
    <button
      onClick={() => clickable && onReveal(card.id)}
      disabled={!clickable}
      className={[
        'aspect-[3/2] rounded-lg border border-black/10 flex items-center justify-center',
        'text-xs sm:text-sm font-medium text-center leading-tight px-1',
        'transition-all duration-200 select-none',
        cardClassName(card, isSpymaster, gameStatus),
        !clickable ? 'cursor-default' : '',
      ].join(' ')}
    >
      {card.word}
    </button>
  )
}
