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
import { setGameFeedbackContext } from '@/lib/game-feedback-context'
import {
  createResyncScheduler,
  fetchGameSnapshot,
  reconcileResync,
  type ResyncScheduler,
} from '@/lib/game-resync'
import { saveEndTurn, saveReveal, type EndTurnOutcome, type RevealOutcome } from '@/lib/game-writes'
import type { Card, Clue, Game, Team } from '@/types/game'

interface GameBoardProps {
  initialGame: Game
  initialCards: Card[]
  initialClues: Clue[]
  isSpymaster: boolean
}

const TEAM_LABEL: Record<string, string> = { red: 'אדום', blue: 'כחול' }
const STATUS_ORDER: Record<string, number> = { waiting: 0, active: 1, finished: 2 }

// Resync is on unless NEXT_PUBLIC_RESYNC_ENABLED is 'false'. NEXT_PUBLIC_*
// values are inlined at build time: changing it requires a rebuild/redeploy —
// it is NOT a runtime kill switch (Vercel's instant rollback is the fast path).
const RESYNC_ENABLED = process.env.NEXT_PUBLIC_RESYNC_ENABLED !== 'false'
// Hidden for less than this (a quick app switch) — the socket almost certainly
// stayed up, and a rejoin would trigger its own resync anyway.
const HIDDEN_RESYNC_THRESHOLD_MS = 3_000
const NOTICE_DURATION_MS = 6_000
const ACTION_FAILED_NOTICE = 'הפעולה לא נשמרה. הלוח עודכן לפי המצב העדכני.'
const RESYNC_FAILED_NOTICE = 'בעיית חיבור — אם הלוח לא מתעדכן, רעננו את הדף.'

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
  const [syncNotice, setSyncNotice] = useState<string | null>(null)
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  // Bumped on every Realtime event — lets resync detect events that raced its
  // fetch, and (via committedRealtimeSeq) whether their updates have committed.
  const realtimeSeq = useRef(0)
  const committedRealtimeSeq = useRef(0)
  // Each Realtime handler that queues state updates also queues this marker
  // in the same batch (same handler → same update lane), so React commits the
  // marker exactly when it commits that event's updates — never earlier.
  const [renderedRealtimeSeq, setRenderedRealtimeSeq] = useState(0)

  // Refs to avoid stale closures in realtime handlers (and in resync)
  const stateRef = useRef({ game, cards, clues, activeClue })
  useEffect(() => {
    stateRef.current = { game, cards, clues, activeClue }
    committedRealtimeSeq.current = renderedRealtimeSeq
  }, [game, cards, clues, activeClue, renderedRealtimeSeq])

  // Highest game version we've actually applied — drops out-of-order events
  const appliedVersion = useRef(initialGame.version)

  // Counts card clicks that are in-flight (optimistic but not yet server-confirmed).
  const pendingClicks = useRef(0)

  // ── Resync bookkeeping (see src/lib/game-resync.ts) ──
  // Cards the server has confirmed as revealed (SSR, Realtime, snapshots).
  const confirmedRevealed = useRef(new Set(initialCards.filter((c) => c.revealed).map((c) => c.id)))
  // Cards whose optimistic reveal request has not settled yet.
  const pendingReveals = useRef(new Set<string>())
  // User actions (reveal / end turn) whose request has not settled yet.
  const pendingActions = useRef(0)
  // Bumped when a user action starts — lets resync discard snapshots that predate it.
  const actionEpoch = useRef(0)
  const schedulerRef = useRef<ResyncScheduler | null>(null)

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

  // Publish a snapshot for the globally-mounted FeedbackWidget (see
  // src/lib/game-feedback-context.ts) — lets a bug report include what the
  // submitter was actually looking at, without any extra fetch.
  useEffect(() => {
    setGameFeedbackContext({
      gameCode: game.code,
      status: game.status,
      role: isSpymaster ? 'spymaster' : 'guesser',
      currentTeam: game.current_team,
      redRemaining: game.red_remaining,
      blueRemaining: game.blue_remaining,
      clueWord: activeClue?.word ?? null,
      clueCount: activeClue?.count ?? null,
    })
  }, [game.code, game.status, game.current_team, game.red_remaining, game.blue_remaining, isSpymaster, activeClue])

  // Clear it on unmount so feedback from elsewhere in the app (or a
  // different game) never carries a stale snapshot.
  useEffect(() => () => setGameFeedbackContext(null), [])

  // DB fallback: if migration 007 was run and next_game_code is set, navigate
  useEffect(() => {
    if (!game.next_game_code) return
    const path = isSpymaster && game.next_game_spymaster_token
      ? `/game/${game.next_game_code}?spymaster=${game.next_game_spymaster_token}`
      : `/game/${game.next_game_code}`
    router.push(path)
  }, [game.next_game_code, game.next_game_spymaster_token, isSpymaster, router])

  // Auto-dismiss the sync notice
  useEffect(() => {
    if (!syncNotice) return
    const t = setTimeout(() => setSyncNotice(null), NOTICE_DURATION_MS)
    return () => clearTimeout(t)
  }, [syncNotice])

  // Resync: re-read authoritative state after a Realtime gap and reconcile it
  // with local state. Postgres-changes events are not replayed after a
  // reconnect, so without this a client that was away keeps a stale board.
  useEffect(() => {
    if (!RESYNC_ENABLED) return

    const gameId = game.id
    const scheduler = createResyncScheduler({
      fetchSnapshot: () => fetchGameSnapshot(supabase, gameId),
      isBusy: () => pendingActions.current > 0,
      getActionEpoch: () => actionEpoch.current,
      getRealtimeSeq: () => realtimeSeq.current,
      isSettled: () => committedRealtimeSeq.current === realtimeSeq.current,
      onFetchError: (error, { attempt, willRetry }) => {
        console.warn(`[game] resync failed (attempt ${attempt}${willRetry ? ', will retry' : ''})`, error)
        if (!willRetry) setSyncNotice(RESYNC_FAILED_NOTICE)
      },
      apply: (snapshot, { realtimeSeqAtStart }) => {
        const local = stateRef.current
        const result = reconcileResync(
          { ...local, appliedVersion: appliedVersion.current },
          snapshot,
          {
            confirmedRevealed: confirmedRevealed.current,
            pendingReveals: pendingReveals.current,
            realtimeEventsDuringFetch: realtimeSeq.current !== realtimeSeqAtStart,
          }
        )
        if (!result) return

        for (const card of snapshot.cards) {
          if (card.revealed) confirmedRevealed.current.add(card.id)
        }
        if (result.gameApplied) {
          appliedVersion.current = result.appliedVersion
          // The scheduler only applies when no user action is in flight, and
          // the snapshot already includes every settled write — so any
          // Realtime echo still on its way is dropped by the version check.
          pendingClicks.current = 0
        }
        if (result.rolledBackCardIds.length > 0) {
          console.warn('[game] resync rolled back unconfirmed reveals', result.rolledBackCardIds)
        }

        // Handle the turn change here (not in the current_team effect above),
        // so a clue given in the turn we missed isn't cleared right after.
        prevTeam.current = result.game.current_team
        stateRef.current = { game: result.game, cards: result.cards, clues: result.clues, activeClue: result.activeClue }
        // Unchanged parts keep their references, so React skips those updates.
        if (result.game !== local.game) setGame(result.game)
        setCards(result.cards)
        setClues(result.clues)
        setActiveClue(result.activeClue)
        if (result.turnChanged) setHasGuessedThisTurn(false)
      },
    })
    schedulerRef.current = scheduler

    let hiddenAt: number | null = document.visibilityState === 'hidden' ? Date.now() : null
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }
      if (hiddenAt !== null && Date.now() - hiddenAt >= HIDDEN_RESYNC_THRESHOLD_MS) {
        scheduler.request('visible')
      }
      hiddenAt = null
    }
    function onOnline() { scheduler.request('online') }
    function onPageShow(e: PageTransitionEvent) { if (e.persisted) scheduler.request('pageshow') }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', onOnline)
    window.addEventListener('pageshow', onPageShow)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('pageshow', onPageShow)
      scheduler.dispose()
      if (schedulerRef.current === scheduler) schedulerRef.current = null
    }
  }, [game.id, supabase])

  useEffect(() => {
    let joinedOnce = false
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
          realtimeSeq.current += 1
          setRenderedRealtimeSeq(realtimeSeq.current)
          if (newCard.revealed) confirmedRevealed.current.add(newCard.id)
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

          // Counted only when a state update is actually queued (see realtimeSeq):
          // dropped events cause no render, so they must not block resync.
          realtimeSeq.current += 1
          setRenderedRealtimeSeq(realtimeSeq.current)
          setGame((prev) => ({ ...prev, ...newGame }))
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'clues', filter: `game_id=eq.${game.id}` },
        (payload) => {
          const newClue = payload.new as Clue
          if (newClue.game_id !== game.id) return // guard against cross-game events
          realtimeSeq.current += 1
          setRenderedRealtimeSeq(realtimeSeq.current)
          setActiveClue(newClue)
          // A resync may already have added this clue — never show it twice.
          setClues((prev) => (prev.some((c) => c.id === newClue.id) ? prev : [...prev, newClue]))
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          // realtime-js re-fires SUBSCRIBED on every automatic rejoin. Events
          // sent while we were disconnected are not replayed, so resync. The
          // first join also resyncs once: it closes the gap between the SSR
          // read and the moment this subscription became live.
          schedulerRef.current?.request(joinedOnce ? 'realtime-rejoin' : 'initial-subscribe')
          joinedOnce = true
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[game] realtime channel ${status}`, err)
        }
      })

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

    pendingReveals.current.add(cardId)
    pendingActions.current += 1
    actionEpoch.current += 1

    // Detects writes that RLS silently filtered out (e.g. the game was just
    // finished by another player) as well as errors — see lib/game-writes.ts.
    let outcome: RevealOutcome = { saved: false, cardSaved: false, gameWriteFailed: hasGameUpdates, details: [] }
    try {
      outcome = await saveReveal(supabase, game.id, cardId, updates)
    } finally {
      pendingReveals.current.delete(cardId)
      pendingActions.current -= 1
    }

    // No Realtime echo will come for a games write that didn't land, so it
    // must not keep suppressing the next genuine games event.
    if (outcome.gameWriteFailed) pendingClicks.current = Math.max(0, pendingClicks.current - 1)

    if (!outcome.cardSaved) {
      // The reveal itself was lost: tell the player and roll the board back.
      console.error('[game] card reveal was not saved', outcome.details)
      afterAction({ resync: true, notify: true })
    } else if (outcome.gameWriteFailed) {
      // The card landed but the games row didn't. Today this happens on every
      // winning reveal (RLS 008 rejects status='finished'); resync quietly so
      // counters/turn match the server, with the win derived from the cards.
      console.warn('[game] card saved but game state was not', outcome.details)
      afterAction({ resync: true, notify: false })
    } else {
      afterAction({ resync: false, notify: false })
    }
  }

  async function handleEndTurn() {
    if (game.status !== 'active' || endTurnPending) return
    const nextTeam: Team = game.current_team === 'red' ? 'blue' : 'red'
    setGame((prev) => ({ ...prev, current_team: nextTeam }))
    setEndTurnPending(true)
    pendingActions.current += 1
    actionEpoch.current += 1

    let outcome: EndTurnOutcome = { saved: false, details: null }
    try {
      outcome = await saveEndTurn(supabase, game.id, nextTeam)
    } finally {
      pendingActions.current -= 1
      setEndTurnPending(false)
    }

    if (!outcome.saved) console.error('[game] end turn was not saved', outcome.details)
    afterAction({ resync: !outcome.saved, notify: !outcome.saved })
  }

  // A failed optimistic action is rolled back by re-reading server state;
  // otherwise just let any resync deferred by this action run now.
  function afterAction({ resync, notify }: { resync: boolean; notify: boolean }) {
    if (notify) setSyncNotice(ACTION_FAILED_NOTICE)
    if (resync) schedulerRef.current?.request('action-failed')
    schedulerRef.current?.notifyIdle()
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

      {syncNotice && (
        <p role="status" className="text-center text-xs font-medium text-game-red">
          {syncNotice}
        </p>
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
