'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { revealCard, endTurn } from '@/app/actions'
import GameCard from './GameCard'
import SharePanel from './SharePanel'
import type { Card, Game } from '@/types/game'

interface GameBoardProps {
  initialGame: Game
  initialCards: Card[]
  isSpymaster: boolean
}

const TEAM_LABEL: Record<string, string> = { red: 'אדום', blue: 'כחול' }

export default function GameBoard({ initialGame, initialCards, isSpymaster }: GameBoardProps) {
  const [game, setGame] = useState<Game>(initialGame)
  const [cards, setCards] = useState<Card[]>(initialCards)
  const [, startTransition] = useTransition()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const channel = supabase
      .channel(`game:${game.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'cards', filter: `game_id=eq.${game.id}` },
        (payload) => {
          setCards((prev) =>
            prev.map((c) =>
              c.id === (payload.new as Card).id ? { ...c, ...(payload.new as Card) } : c
            )
          )
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${game.id}` },
        (payload) => {
          setGame((prev) => ({ ...prev, ...(payload.new as Game) }))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [game.id, supabase])

  function handleReveal(cardId: string) {
    if (game.status !== 'active') return
    // Optimistic update — flip the card immediately, server confirms in background
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, revealed: true } : c)))
    startTransition(() => revealCard(cardId, game.id))
  }

  function handleEndTurn() {
    if (game.status !== 'active') return
    startTransition(() => endTurn(game.id))
  }

  const sorted = [...cards].sort((a, b) => a.position - b.position)
  const isFinished = game.status === 'finished'

  return (
    <div className="flex flex-col gap-3">
      {/* Score bar */}
      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-3 shadow-sm">
        <span className="text-3xl font-bold text-red-600">{game.red_remaining}</span>

        <div className="text-center">
          {isFinished ? (
            <p className="font-bold text-base text-gray-900">
              {game.winner === 'red' ? '🔴' : '🔵'}{' '}
              קבוצת {TEAM_LABEL[game.winner!]} ניצחה!
            </p>
          ) : (
            <>
              <p className="text-xs text-gray-400 mb-0.5">תור</p>
              <p className={`font-bold text-sm ${game.current_team === 'red' ? 'text-red-600' : 'text-blue-600'}`}>
                {TEAM_LABEL[game.current_team]}
              </p>
            </>
          )}
        </div>

        <span className="text-3xl font-bold text-blue-600">{game.blue_remaining}</span>
      </div>

      {/* Board */}
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {sorted.map((card) => (
          <GameCard
            key={card.id}
            card={card}
            isSpymaster={isSpymaster}
            gameStatus={game.status}
            onReveal={handleReveal}
          />
        ))}
      </div>

      {/* End turn — only for operatives during active game */}
      {!isFinished && !isSpymaster && (
        <button
          onClick={handleEndTurn}
          className="w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          סיים תור
        </button>
      )}

      {isFinished && (
        <a
          href="/"
          className="block text-center w-full rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white hover:bg-gray-800 transition-colors"
        >
          משחק חדש
        </a>
      )}

      <SharePanel game={game} />
    </div>
  )
}
