'use client'

import type { Card, GameStatus } from '@/types/game'

interface GameCardProps {
  card: Card
  isSpymaster: boolean
  gameStatus: GameStatus
  onReveal: (id: string) => void
}

function cardClassName(card: Card, isSpymaster: boolean): string {
  if (card.revealed) {
    const styles: Record<string, string> = {
      red: 'bg-red-600 text-white border-red-700',
      blue: 'bg-blue-600 text-white border-blue-700',
      neutral: 'bg-amber-200 text-amber-900 border-amber-300',
      assassin: 'bg-gray-900 text-gray-100 border-gray-800',
    }
    return styles[card.type] + ' opacity-80'
  }

  if (isSpymaster) {
    const styles: Record<string, string> = {
      red: 'bg-red-100 text-red-900 border-red-400 font-bold',
      blue: 'bg-blue-100 text-blue-900 border-blue-400 font-bold',
      neutral: 'bg-amber-50 text-amber-800 border-amber-300',
      assassin: 'bg-gray-300 text-gray-900 border-gray-500 font-bold',
    }
    return styles[card.type]
  }

  return 'bg-white text-gray-800 border-gray-200 shadow-sm hover:bg-gray-50 active:scale-95 cursor-pointer'
}

export default function GameCard({ card, isSpymaster, gameStatus, onReveal }: GameCardProps) {
  const clickable = !card.revealed && gameStatus === 'active' && !isSpymaster

  return (
    <button
      onClick={() => clickable && onReveal(card.id)}
      disabled={!clickable}
      className={[
        'aspect-[3/2] rounded-lg border-2 flex items-center justify-center',
        'text-xs sm:text-sm font-medium text-center leading-tight px-1',
        'transition-all duration-150 select-none',
        cardClassName(card, isSpymaster),
        !clickable ? 'cursor-default' : '',
      ].join(' ')}
    >
      {card.word}
    </button>
  )
}
