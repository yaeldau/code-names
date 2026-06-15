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
          if (newCard.game_id !== game.id) return // guard against cross-game events
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
          if (newGame.id !== game.id) return // guard against cross-game events
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
          if (newClue.game_id !== game.id) return // guard against cross-game events
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

      {/* ── Score bar ── */}
      <div className="flex items-center justify-between rounded-2xl border border-border bg-surface px-5 py-3.5 shadow-sm">
        <div className={`flex items-center gap-2.5 transition-opacity ${game.current_team !== 'red' ? 'opacity-35' : ''}`}>
          <div className="w-2.5 h-2.5 rounded-full bg-game-red flex-shrink-0" />
          <span className="text-3xl font-bold leading-none text-game-red">{game.red_remaining}</span>
        </div>

        <div className="text-center">
          <p className="text-[10px] uppercase tracking-widest text-ink-faint mb-1">תור</p>
          <p className={`text-sm font-bold ${game.current_team === 'red' ? 'text-game-red' : 'text-game-blue'}`}>
            {TEAM_LABEL[game.current_team]}
          </p>
        </div>

        <div className={`flex items-center gap-2.5 transition-opacity ${game.current_team !== 'blue' ? 'opacity-35' : ''}`}>
          <span className="text-3xl font-bold leading-none text-game-blue">{game.blue_remaining}</span>
          <div className="w-2.5 h-2.5 rounded-full bg-game-blue flex-shrink-0" />
        </div>
      </div>

      {/* ── Clue panel ── */}
      <CluePanel game={game} isSpymaster={isSpymaster} activeClue={activeClue} />

      {/* ── Board ── */}
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

      {/* ── Winner banner / End turn ── */}
      {isFinished ? (
        <div className={`rounded-2xl border px-5 py-3.5 flex items-center justify-between ${
          game.winner === 'red'
            ? 'bg-game-red border-game-red-dark'
            : 'bg-game-blue border-game-blue-dark'
        }`}>
          <p className="text-base font-bold text-white">
            קבוצת {TEAM_LABEL[game.winner!]} ניצחה!
          </p>
          <button
            onClick={handleStartNewGame}
            disabled={newGamePending}
            className="rounded-xl bg-white/20 hover:bg-white/30 border border-white/20 disabled:opacity-50 px-4 py-1.5 text-sm font-semibold text-white transition-colors"
          >
            {newGamePending ? 'יוצר משחק...' : 'משחק חדש'}
          </button>
        </div>
      ) : !isSpymaster && (
        <button
          onClick={handleEndTurn}
          disabled={endTurnPending || !hasGuessedThisTurn}
          className={[
            'w-full rounded-2xl py-3 text-sm font-semibold transition-colors',
            endTurnPending || !hasGuessedThisTurn
              ? 'bg-border/50 text-ink-faint cursor-not-allowed'
              : 'border border-border bg-surface text-ink-soft hover:bg-bg',
          ].join(' ')}
        >
          {endTurnPending ? 'מעביר תור...' : 'סיים תור'}
        </button>
      )}

      {/* ── Clue history ── */}
      {clues.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-sm">
          <p className="text-[10px] font-semibold text-ink-faint text-center mb-3 tracking-widest uppercase">
            היסטוריית רמזים
          </p>
          <div className="flex gap-3">
            {/* Red clues */}
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="flex items-center justify-end gap-1.5 mb-1">
                <span className="text-xs font-bold text-game-red">אדום</span>
                <div className="w-2 h-2 rounded-full bg-game-red flex-shrink-0" />
              </div>
              {clues.filter((c) => c.team === 'red').map((clue) => (
                <div key={clue.id} className="flex items-baseline justify-end gap-1.5">
                  <span className={clue.count === 0 ? 'text-sm text-ink-faint' : 'text-xs text-ink-faint'}>
                    {clue.count === 0 ? '∞' : clue.count}
                  </span>
                  <span className="text-xs font-semibold text-game-red bg-game-red-tint rounded-lg px-2 py-0.5">
                    {clue.word}
                  </span>
                </div>
              ))}
            </div>

            <div className="w-px bg-border" />

            {/* Blue clues */}
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-2 h-2 rounded-full bg-game-blue flex-shrink-0" />
                <span className="text-xs font-bold text-game-blue">כחול</span>
              </div>
              {clues.filter((c) => c.team === 'blue').map((clue) => (
                <div key={clue.id} className="flex items-baseline gap-1.5">
                  <span className="text-xs font-semibold text-game-blue bg-game-blue-tint rounded-lg px-2 py-0.5">
                    {clue.word}
                  </span>
                  <span className={clue.count === 0 ? 'text-sm text-ink-faint' : 'text-xs text-ink-faint'}>
                    {clue.count === 0 ? '∞' : clue.count}
                  </span>
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
