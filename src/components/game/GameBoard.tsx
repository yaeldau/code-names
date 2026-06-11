'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { revealCard, endTurn } from '@/app/actions'
import GameCard from './GameCard'
import SharePanel from './SharePanel'
import type { Card, Game, Team } from '@/types/game'

interface GameBoardProps {
  initialGame: Game
  initialCards: Card[]
  isSpymaster: boolean
}

const TEAM_LABEL: Record<string, string> = { red: 'אדום', blue: 'כחול' }

function deriveGameUpdates(game: Game, card: Card): Partial<Game> {
  const opponent: Team = game.current_team === 'red' ? 'blue' : 'red'
  const updates: Partial<Game> = {}

  if (card.type === 'assassin') {
    updates.status = 'finished'
    updates.winner = opponent
  } else {
    if (card.type === 'red') updates.red_remaining = game.red_remaining - 1
    if (card.type === 'blue') updates.blue_remaining = game.blue_remaining - 1

    const redLeft = updates.red_remaining ?? game.red_remaining
    const blueLeft = updates.blue_remaining ?? game.blue_remaining

    if (redLeft === 0) {
      updates.status = 'finished'
      updates.winner = 'red'
    } else if (blueLeft === 0) {
      updates.status = 'finished'
      updates.winner = 'blue'
    } else if (card.type !== game.current_team) {
      updates.current_team = opponent
    }
  }

  return updates
}

export default function GameBoard({ initialGame, initialCards, isSpymaster }: GameBoardProps) {
  const [game, setGame] = useState<Game>(initialGame)
  const [cards, setCards] = useState<Card[]>(initialCards)
  const [, startTransition] = useTransition()
  const supabase = useMemo(() => createClient(), [])

  // Keep a ref to latest state so realtime handlers avoid stale closures
  const stateRef = useRef({ game, cards })
  useEffect(() => { stateRef.current = { game, cards } }, [game, cards])

  // Track the highest game version we've applied so stale realtime events
  // (from earlier clicks that arrive late) are silently dropped.
  const appliedVersion = useRef(initialGame.version)

  useEffect(() => {
    const channel = supabase
      .channel(`game:${game.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'cards', filter: `game_id=eq.${game.id}` },
        (payload) => {
          const newCard = payload.new as Card
          const { game: g, cards: cs } = stateRef.current
          const wasAlreadyRevealed = cs.find((c) => c.id === newCard.id)?.revealed ?? false

          setCards((prev) =>
            prev.map((c) => (c.id === newCard.id ? { ...c, ...newCard } : c))
          )

          // Derive game state from the card event for other players (non-clickers).
          // Skip if we already applied this optimistically (wasAlreadyRevealed = true).
          // Skip if game is already finished — no further state changes allowed.
          if (newCard.revealed && !wasAlreadyRevealed && g.status !== 'finished') {
            const updates = deriveGameUpdates(g, newCard)
            if (Object.keys(updates).length > 0) {
              setGame((prev) => ({ ...prev, ...updates }))
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${game.id}` },
        (payload) => {
          const newGame = payload.new as Game
          // Drop stale events — version must be strictly newer than what we last applied.
          // This prevents queued-up realtime events from earlier clicks from overwriting
          // the game-over state after the assassin is revealed.
          if (newGame.version <= appliedVersion.current) return
          appliedVersion.current = newGame.version
          setGame((prev) => ({ ...prev, ...newGame }))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [game.id, supabase])

  function handleReveal(cardId: string) {
    if (game.status !== 'active') return
    const card = cards.find((c) => c.id === cardId)
    if (!card || card.revealed) return

    // Optimistic: flip card and update game state instantly
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, revealed: true } : c)))
    const updates = deriveGameUpdates(game, card)
    if (Object.keys(updates).length > 0) {
      setGame((prev) => ({ ...prev, ...updates }))
    }

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

      {/* End turn */}
      {!isFinished && !isSpymaster && (
        <button
          onClick={handleEndTurn}
          className="w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          סיים תור
        </button>
      )}

      <SharePanel game={game} />
    </div>
  )
}
