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
    const styles: Record<string, string> = {
      red:      'bg-red-500  text-white',
      blue:     'bg-blue-500 text-white',
      neutral:  'bg-gray-400 text-white',
      assassin: 'bg-gray-900 text-gray-100',
    }
    return styles[card.type]
  }

  if (gameStatus === 'finished') {
    const styles: Record<string, string> = {
      red:      'bg-red-100  text-red-400',
      blue:     'bg-blue-100 text-blue-400',
      neutral:  'bg-white    text-gray-300',
      assassin: 'bg-gray-500 text-white',
    }
    return styles[card.type]
  }

  if (isSpymaster) {
    const styles: Record<string, string> = {
      red:      'bg-red-100  text-red-800  font-semibold',
      blue:     'bg-blue-100 text-blue-800 font-semibold',
      neutral:  'bg-white    text-gray-400',
      assassin: 'bg-gray-500 text-white    font-semibold',
    }
    return styles[card.type]
  }

  return 'bg-white text-gray-800 shadow-sm hover:shadow-md active:scale-95 cursor-pointer'
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
