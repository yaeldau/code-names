'use client'

import type { Card, GameStatus } from '@/types/game'

interface GameCardProps {
  card: Card
  isSpymaster: boolean
  gameStatus: GameStatus
  onReveal: (id: string) => void
}

function cardVariant(card: Card, isSpymaster: boolean, gameStatus: GameStatus): string {
  // ── Revealed ──────────────────────────────────────────────────────────────
  if (card.revealed) {
    if (isSpymaster) {
      return {
        red:      'bg-game-red/10      text-game-red/40      border-game-red/15      line-through',
        blue:     'bg-game-blue/10     text-game-blue/40     border-game-blue/15     line-through',
        neutral:  'bg-neutral-card/30  text-ink-faint/50     border-border/60        line-through',
        assassin: 'bg-assassin/10      text-ink-faint/40     border-assassin/15      line-through',
      }[card.type]
    }
    return {
      red:      'bg-game-red      border-game-red-dark  text-white',
      blue:     'bg-game-blue     border-game-blue-dark text-white',
      neutral:  'bg-revealed      border-revealed       text-ink-soft',
      assassin: 'bg-assassin      border-assassin       text-white',
    }[card.type]
  }

  // ── Game finished — show all types ────────────────────────────────────────
  if (gameStatus === 'finished') {
    return {
      red:      'bg-game-red-tint  border-game-red/20   text-game-red',
      blue:     'bg-game-blue-tint border-game-blue/20  text-game-blue',
      neutral:  'bg-neutral-card/40 border-border        text-ink-faint',
      assassin: 'bg-assassin/12    border-assassin/20   text-assassin',
    }[card.type]
  }

  // ── Spymaster unrevealed — sees colours ───────────────────────────────────
  if (isSpymaster) {
    return {
      red:      'bg-game-red      border-game-red-dark  text-white font-bold',
      blue:     'bg-game-blue     border-game-blue-dark text-white font-bold',
      neutral:  'bg-stone-500     border-stone-600      text-white',
      assassin: 'bg-assassin      border-assassin       text-white font-bold',
    }[card.type]
  }

  // ── Player unrevealed — clean white card ──────────────────────────────────
  return 'bg-surface border-border text-ink shadow-sm hover:shadow-md hover:border-gray-300 active:scale-[0.97] cursor-pointer'
}

export default function GameCard({ card, isSpymaster, gameStatus, onReveal }: GameCardProps) {
  const clickable = !card.revealed && gameStatus === 'active' && !isSpymaster

  return (
    <button
      onClick={() => clickable && onReveal(card.id)}
      disabled={!clickable}
      className={[
        'aspect-[3/2] rounded-xl border',
        'flex items-center justify-center',
        'text-xs sm:text-sm font-semibold text-center leading-tight px-1.5',
        'transition-all duration-150 select-none',
        cardVariant(card, isSpymaster, gameStatus),
        !clickable ? 'cursor-default' : '',
      ].join(' ')}
    >
      {card.word}
    </button>
  )
}
