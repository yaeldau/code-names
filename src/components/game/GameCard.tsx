'use client'

import { imagePathFor } from '@/decks/registry'
import type { Card, GameMode, GameStatus } from '@/types/game'

interface GameCardProps {
  card: Card
  isSpymaster: boolean
  gameStatus: GameStatus
  mode: GameMode
  theme: string
  onReveal: (id: string) => void
}

function cardVariant(card: Card, isSpymaster: boolean, gameStatus: GameStatus): string {
  // ── Revealed ──────────────────────────────────────────────────────────────
  if (card.revealed) {
    if (isSpymaster) {
      // Solid colour tile (like placing an agent card on top) — word hidden
      return {
        red:      'bg-game-red/50  border-game-red/25  text-transparent',
        blue:     'bg-game-blue/50 border-game-blue/25 text-transparent',
        neutral:  'bg-stone-400/50 border-stone-400/25 text-transparent',
        assassin: 'bg-assassin/50  border-assassin/25  text-transparent',
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
      neutral:  'bg-stone-400/70  border-stone-300/50   text-white/90 font-normal',
      assassin: 'bg-assassin      border-assassin       text-white font-bold',
    }[card.type]
  }

  // ── Player unrevealed — clean white card ──────────────────────────────────
  return 'bg-surface border-border text-ink shadow-sm hover:shadow-md hover:border-gray-300 active:scale-[0.97] cursor-pointer'
}

export default function GameCard({ card, isSpymaster, gameStatus, mode, theme, onReveal }: GameCardProps) {
  const clickable = !card.revealed && gameStatus === 'active' && !isSpymaster

  // Pictures mode swaps the word text for an image on the plain, clickable
  // player-facing tile. Every other state (spymaster, revealed, game-over
  // reveal-all) keeps showing the label exactly as Words mode does today.
  const showImage = mode === 'pictures' && !!card.image_key && clickable

  return (
    <button
      onClick={() => clickable && onReveal(card.id)}
      disabled={!clickable}
      className={[
        'aspect-[3/2] rounded-xl border overflow-hidden',
        'flex items-center justify-center',
        'text-xs sm:text-sm font-semibold text-center leading-tight',
        showImage ? '' : 'px-1.5',
        'transition-all duration-150 select-none',
        cardVariant(card, isSpymaster, gameStatus),
        !clickable ? 'cursor-default' : '',
      ].join(' ')}
    >
      {showImage ? (
        // Local, trusted SVG icons — tiny vector files with no size variants
        // to generate, so next/image's optimization pipeline has nothing to add here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imagePathFor(theme, card.image_key!)}
          alt={card.word}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
        />
      ) : (
        card.word
      )}
    </button>
  )
}
