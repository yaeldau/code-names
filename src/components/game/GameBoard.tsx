'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { startNewGame } from '@/app/actions'
import GameCard from './GameCard'
import CluePanel from './CluePanel'
import SharePanel from './SharePanel'
import { deriveGameUpdates } from '@/lib/game-logic'
import type { Card, Clue, Game, Team } from '@/types/game'

interface GameBoardProps {
  initialGame: Game
  initialCards: Card[]
  initialClues: Clue[]
  isSpymaster: boolean
}

const TEAM_LABEL: Record<string, string> = { red: 'אדום', blue: 'כחול' }
const STATUS_ORDER: Record<string, number> = { waiting: 0, active: 1, finished: 2 }

export default function GameBoard({ initialGame, initialCards, initialClues, isSpymaster }: GameBoardProps) {
  const [game, setGame] = useState<Game>(initialGame)
  const [cards, setCards] = useState<Card[]>(initialCards)
  const [clues, setClues] = useState<Clue[]>(initialClues)
  const [activeClue, setActiveClue] = useState<Clue | null>(
    [...initialClues].reverse().find((c) => c.team === initialGame.current_team) ?? null
  )
  const [hasGuessedThisTurn, setHasGuessedThisTurn] = useState(false)
  const [endTurnPending, setEndTurnPending] = useState(false)
  const [newGamePending, setNewGamePending] = useState(false)
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  // Refs to avoid stale closures in realtime handlers
  const stateRef = useRef({ game, cards })
  useEffect(() => { stateRef.current = { game, cards } }, [game, cards])

  // Highest game version we've actually applied — drops out-of-order events
  const appliedVersion = useRef(initialGame.version)

  // Counts card clicks that are in-flight (optimistic but not yet server-confirmed).
  const pendingClicks = useRef(0)

  // Supabase channel ref — needed to send broadcasts from outside the useEffect
  const channelRef = useRef<RealtimeChannel | null>(null)

  // Clear the active clue and guess tracker whenever the turn changes
  const prevTeam = useRef(initialGame.current_team)
  useEffect(() => {
    if (prevTeam.current !== game.current_team) {
      prevTeam.current = game.current_team
      setActiveClue(null)
      setHasGuessedThisTurn(false)
    }
  }, [game.current_team])

  // DB fallback: if migration 007 was run and next_game_code is set, navigate
  useEffect(() => {
    if (!game.next_game_code) return
    const path = isSpymaster && game.next_game_spymaster_token
      ? `/game/${game.next_game_code}?spymaster=${game.next_game_spymaster_token}`
      : `/game/${game.next_game_code}`
    router.push(path)
  }, [game.next_game_code, game.next_game_spymaster_token, isSpymaster, router])

  useEffect(() => {
    const channel = supabase
      .channel(`game:${game.id}`)
      // Primary mechanism: broadcast from the client that creates the new game
      .on('broadcast', { event: 'new_game' }, ({ payload }) => {
        const path = isSpymaster && payload.spymaster_token
          ? `/game/${payload.code}?spymaster=${payload.spymaster_token}`
          : `/game/${payload.code}`
        router.push(path)
      })
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

          if ((STATUS_ORDER[newGame.status] ?? 0) < (STATUS_ORDER[g.status] ?? 0)) return
          if (newGame.version <= appliedVersion.current) return
          appliedVersion.current = newGame.version

          if (pendingClicks.current > 0) {
            pendingClicks.current -= 1
            if (pendingClicks.current > 0) return
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

    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [game.id, supabase, isSpymaster, router])

  // Keep a stable ref to handleStartNewGame so the window listener always
  // calls the latest version (correct game.id, isSpymaster, etc.)
  const handleStartNewGameRef = useRef<() => void>(() => {})

  // Window listener: lets the header button (CreateGameButton) delegate here
  // so we can broadcast on the channel we own.
  useEffect(() => {
    function onHeaderNewGame() { handleStartNewGameRef.current() }
    window.addEventListener('codenames:start-new-game', onHeaderNewGame)
    return () => window.removeEventListener('codenames:start-new-game', onHeaderNewGame)
  }, [])

  async function handleStartNewGame() {
    if (newGamePending) return
    setNewGamePending(true)
    try {
      const { code, spymasterToken } = await startNewGame(game.id)

      // Broadcast to all other connected clients
      await channelRef.current?.send({
        type: 'broadcast',
        event: 'new_game',
        payload: { code, spymaster_token: spymasterToken },
      })

      // Navigate current client
      const path = isSpymaster
        ? `/game/${code}?spymaster=${spymasterToken}`
        : `/game/${code}`
      router.push(path)
    } finally {
      setNewGamePending(false)
    }
  }

  // Keep ref in sync after every render
  useEffect(() => { handleStartNewGameRef.current = handleStartNewGame })

  async function handleReveal(cardId: string) {
    if (game.status !== 'active') return
    const card = cards.find((c) => c.id === cardId)
    if (!card || card.revealed) return

    setHasGuessedThisTurn(true)

    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, revealed: true } : c)))
    const updates = deriveGameUpdates(game, card)
    const hasGameUpdates = Object.keys(updates).length > 0
    if (hasGameUpdates) {
      setGame((prev) => ({ ...prev, ...updates }))
      pendingClicks.current += 1
    }

    const ops: PromiseLike<unknown>[] = [
      supabase.from('cards').update({ revealed: true }).eq('id', cardId),
    ]
    if (hasGameUpdates) {
      ops.push(supabase.from('games').update(updates).eq('id', game.id))
    }
    await Promise.all(ops)
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
          <p className={`font-bold text-sm ${game.current_team === 'red' ? 'text-red-600' : 'text-blue-700'}`}>
            {TEAM_LABEL[game.current_team]}
          </p>
        </div>

        <span className="text-3xl font-bold text-blue-700">{game.blue_remaining}</span>
      </div>

      {/* Clue panel — always rendered so board position never changes */}
      <CluePanel game={game} isSpymaster={isSpymaster} activeClue={activeClue} />

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

      {/* Winner banner (below board) / End turn */}
      {isFinished ? (
        <div className={`rounded-xl border px-4 py-3 flex items-center justify-between ${
          game.winner === 'red'
            ? 'bg-red-600 border-red-700'
            : 'bg-blue-700 border-blue-800'
        }`}>
          <p className="text-base font-bold text-white">
            קבוצת {TEAM_LABEL[game.winner!]} ניצחה!
          </p>
          <button
            onClick={handleStartNewGame}
            disabled={newGamePending}
            className="rounded-lg bg-white/20 hover:bg-white/30 disabled:opacity-50 px-4 py-1.5 text-sm font-semibold text-white transition-colors"
          >
            {newGamePending ? 'יוצר משחק...' : 'משחק חדש'}
          </button>
        </div>
      ) : !isSpymaster && (
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
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 text-center mb-2 tracking-wide">היסטוריית רמזים</p>
          <div className="flex gap-3">
            {/* Red clues */}
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="flex items-center justify-end gap-1.5 mb-0.5">
                <span className="text-xs font-bold text-red-600">אדום</span>
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
              </div>
              {clues.filter((c) => c.team === 'red').map((clue) => (
                <div key={clue.id} className="flex items-baseline justify-end gap-1.5">
                  <span className="text-xs text-gray-500">{clue.count === 0 ? '∞' : clue.count}</span>
                  <span className="text-xs font-semibold text-red-700 bg-red-50 rounded-md px-2 py-0.5">
                    {clue.word}
                  </span>
                </div>
              ))}
            </div>

            <div className="w-px bg-gray-100" />

            {/* Blue clues */}
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
                <span className="text-xs font-bold text-blue-700">כחול</span>
              </div>
              {clues.filter((c) => c.team === 'blue').map((clue) => (
                <div key={clue.id} className="flex items-baseline gap-1.5">
                  <span className="text-xs font-semibold text-blue-800 bg-blue-50 rounded-md px-2 py-0.5">
                    {clue.word}
                  </span>
                  <span className="text-xs text-gray-500">{clue.count === 0 ? '∞' : clue.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <SharePanel game={game} />
    </div>
  )
}
