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

// Pictures mode never shows the word — the image itself is the card's
// content (like the word is always visible in Words mode). Team colour is
// communicated as a border + translucent wash layered on top of the image
// instead of an opaque fill, so the picture stays visible in every state.
function pictureOverlay(card: Card, isSpymaster: boolean, gameStatus: GameStatus): string | null {
  if (card.revealed) {
    if (isSpymaster) {
      return {
        red:      'border-game-red/40  bg-game-red/25',
        blue:     'border-game-blue/40 bg-game-blue/25',
        neutral:  'border-stone-300/40 bg-stone-400/25',
        assassin: 'border-assassin/40  bg-assassin/25',
      }[card.type]
    }
    return {
      red:      'border-game-red-dark  bg-game-red/55',
      blue:     'border-game-blue-dark bg-game-blue/55',
      neutral:  'border-revealed       bg-stone-400/40',
      assassin: 'border-assassin       bg-assassin/55',
    }[card.type]
  }

  if (gameStatus === 'finished') {
    return {
      red:      'border-game-red/25   bg-game-red/15',
      blue:     'border-game-blue/25  bg-game-blue/15',
      neutral:  'border-border        bg-neutral-card/25',
      assassin: 'border-assassin/20   bg-assassin/12',
    }[card.type]
  }

  if (isSpymaster) {
    return {
      red:      'border-game-red      bg-game-red/35',
      blue:     'border-game-blue     bg-game-blue/35',
      neutral:  'border-stone-300     bg-stone-400/35',
      assassin: 'border-assassin      bg-assassin/35',
    }[card.type]
  }

  return null
}

export default function GameCard({ card, isSpymaster, gameStatus, mode, theme, onReveal }: GameCardProps) {
  const clickable = !card.revealed && gameStatus === 'active' && !isSpymaster
  const isPicture = mode === 'pictures' && !!card.image_key

  if (isPicture) {
    const overlay = pictureOverlay(card, isSpymaster, gameStatus)
    return (
      <button
        onClick={() => clickable && onReveal(card.id)}
        disabled={!clickable}
        className={[
          'relative aspect-[3/2] rounded-xl border overflow-hidden',
          'transition-all duration-150 select-none',
          overlay ?? 'border-border shadow-sm',
          clickable ? 'hover:shadow-md hover:border-gray-300 active:scale-[0.97] cursor-pointer' : 'cursor-default',
        ].join(' ')}
      >
        {/* Local, trusted SVG icons — tiny vector files with no size variants
            to generate, so next/image's optimization pipeline has nothing to add here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imagePathFor(theme, card.image_key!)}
          alt={card.word}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {overlay && <div className={`absolute inset-0 ${overlay}`} />}
      </button>
    )
  }

  return (
    <button
      onClick={() => clickable && onReveal(card.id)}
      disabled={!clickable}
      className={[
        'aspect-[3/2] rounded-xl border overflow-hidden',
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
