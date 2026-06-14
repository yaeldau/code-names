'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import GameCard from './GameCard'
import CluePanel from './CluePanel'
import SharePanel from './SharePanel'
import type { Card, Clue, Game, Team } from '@/types/game'

interface GameBoardProps {
  initialGame: Game
  initialCards: Card[]
  initialClues: Clue[]
  isSpymaster: boolean
}

const TEAM_LABEL: Record<string, string> = { red: 'אדום', blue: 'כחול' }
const STATUS_ORDER: Record<string, number> = { waiting: 0, active: 1, finished: 2 }

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

export default function GameBoard({ initialGame, initialCards, initialClues, isSpymaster }: GameBoardProps) {
  const [game, setGame] = useState<Game>(initialGame)
  const [cards, setCards] = useState<Card[]>(initialCards)
  const [clues, setClues] = useState<Clue[]>(initialClues)
  const [activeClue, setActiveClue] = useState<Clue | null>(
    [...initialClues].reverse().find((c) => c.team === initialGame.current_team) ?? null
  )
  const [hasGuessedThisTurn, setHasGuessedThisTurn] = useState(false)
  const [endTurnPending, setEndTurnPending] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  // Refs to avoid stale closures in realtime handlers
  const stateRef = useRef({ game, cards })
  useEffect(() => { stateRef.current = { game, cards } }, [game, cards])

  // Highest game version we've actually applied — drops out-of-order events
  const appliedVersion = useRef(initialGame.version)

  // Counts card clicks that are in-flight (optimistic but not yet server-confirmed).
  // While pending > 0, we skip intermediate realtime game events and only apply
  // the final one. This prevents the turn indicator from hopping during rapid clicks.
  const pendingClicks = useRef(0)

  // Clear the active clue and guess tracker whenever the turn changes
  const prevTeam = useRef(initialGame.current_team)
  useEffect(() => {
    if (prevTeam.current !== game.current_team) {
      prevTeam.current = game.current_team
      setActiveClue(null)
      setHasGuessedThisTurn(false)
    }
  }, [game.current_team])

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

          // For other players (non-clicker): derive game state from the card event
          // so their board updates atomically with the card flip.
          // Skip if we applied this optimistically already, or if game is over.
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
          const { game: g } = stateRef.current

          // Never revert game status backward (finished → active would undo a game-over
          // that we applied optimistically before stale queued events arrived).
          if ((STATUS_ORDER[newGame.status] ?? 0) < (STATUS_ORDER[g.status] ?? 0)) return

          // Drop duplicate or out-of-order events.
          if (newGame.version <= appliedVersion.current) return
          appliedVersion.current = newGame.version

          // Skip intermediate events while we still have in-flight clicks.
          // This prevents the turn indicator from hopping through intermediate states
          // when several cards are clicked rapidly before any realtime event arrives.
          if (pendingClicks.current > 0) {
            pendingClicks.current -= 1
            if (pendingClicks.current > 0) return
            // pendingClicks just reached 0 — this is the last expected event; fall through.
          }

          setGame((prev) => ({ ...prev, ...newGame }))
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'clues', filter: `game_id=eq.${game.id}` },
        (payload) => {
          const newClue = payload.new as Clue
          setActiveClue(newClue)
          setClues((prev) => [...prev, newClue])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [game.id, supabase])

  function handleReveal(cardId: string) {
    if (game.status !== 'active') return
    const card = cards.find((c) => c.id === cardId)
    if (!card || card.revealed) return

    setHasGuessedThisTurn(true)

    // Count this click so the realtime handler knows to skip intermediate events
    pendingClicks.current += 1

    // Optimistic: flip card and update game state instantly
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, revealed: true } : c)))
    const updates = deriveGameUpdates(game, card)
    if (Object.keys(updates).length > 0) {
      setGame((prev) => ({ ...prev, ...updates }))
    }

    // Persist: plain UPDATE calls (same as old server action — no FOR UPDATE lock needed)
    supabase.from('cards').update({ revealed: true }).eq('id', cardId)
    if (Object.keys(updates).length > 0) {
      supabase.from('games').update(updates).eq('id', game.id)
    }
  }

  async function handleEndTurn() {
    if (game.status !== 'active' || endTurnPending) return
    const nextTeam: Team = game.current_team === 'red' ? 'blue' : 'red'
    setGame((prev) => ({ ...prev, current_team: nextTeam }))
    setEndTurnPending(true)
    await supabase.from('games').update({ current_team: nextTeam }).eq('id', game.id)
    setEndTurnPending(false)
  }

  const sorted = [...cards].sort((a, b) => a.position - b.position)
  const isFinished = game.status === 'finished'

  return (
    <div className="flex flex-col gap-3">
      {/* Score bar */}
      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-3 shadow-sm">
        <span className="text-3xl font-bold text-red-600">{game.red_remaining}</span>

        <div className="text-center">
          <p className="text-xs text-gray-400 mb-0.5">תור</p>
          <p className={`font-bold text-sm ${game.current_team === 'red' ? 'text-red-600' : 'text-blue-600'}`}>
            {TEAM_LABEL[game.current_team]}
          </p>
        </div>

        <span className="text-3xl font-bold text-blue-600">{game.blue_remaining}</span>
      </div>

      {/* Winner banner / Clue panel */}
      {isFinished ? (
        <div className={`rounded-xl border-2 px-5 py-5 text-center ${
          game.winner === 'red'
            ? 'bg-red-50 border-red-300'
            : 'bg-blue-50 border-blue-300'
        }`}>
          <p className="text-4xl mb-2">{game.winner === 'red' ? '🔴' : '🔵'}</p>
          <p className={`text-2xl font-bold ${game.winner === 'red' ? 'text-red-700' : 'text-blue-700'}`}>
            קבוצת {TEAM_LABEL[game.winner!]} ניצחה!
          </p>
        </div>
      ) : (
        <CluePanel game={game} isSpymaster={isSpymaster} activeClue={activeClue} />
      )}

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
          disabled={endTurnPending || !hasGuessedThisTurn}
          className={[
            'w-full rounded-xl py-3 text-sm font-semibold transition-colors',
            endTurnPending || !hasGuessedThisTurn
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 active:bg-gray-100',
          ].join(' ')}
        >
          {endTurnPending ? 'מעביר תור...' : 'סיים תור'}
        </button>
      )}

      {clues.length > 0 && (
        <div className="flex gap-4 text-xs font-medium">
          <div className="flex-1 flex flex-col gap-0.5 text-right">
            {clues.filter((c) => c.team === 'red').map((clue) => (
              <span key={clue.id} className="text-red-600">
                {clue.word} {clue.count === 0 ? '∞' : clue.count}
              </span>
            ))}
          </div>
          <div className="flex-1 flex flex-col gap-0.5 text-left">
            {clues.filter((c) => c.team === 'blue').map((clue) => (
              <span key={clue.id} className="text-blue-600">
                {clue.word} {clue.count === 0 ? '∞' : clue.count}
              </span>
            ))}
          </div>
        </div>
      )}

      <SharePanel game={game} />
    </div>
  )
}
