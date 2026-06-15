import { describe, it, expect } from 'vitest'
import { deriveGameUpdates } from '../game-logic'
import type { Card, Game } from '@/types/game'

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    code: 'ABCDEF',
    status: 'active',
    current_team: 'red',
    red_remaining: 9,
    blue_remaining: 8,
    winner: null,
    spymaster_token: 'token',
    version: 1,
    created_at: '2024-01-01T00:00:00Z',
    next_game_code: null,
    next_game_spymaster_token: null,
    ...overrides,
  }
}

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    game_id: 'game-1',
    word: 'מים',
    type: 'red',
    position: 0,
    revealed: false,
    ...overrides,
  }
}

// ─── Assassin ────────────────────────────────────────────────────────────────

describe('assassin card', () => {
  it('ends the game immediately', () => {
    const updates = deriveGameUpdates(makeGame(), makeCard({ type: 'assassin' }))
    expect(updates.status).toBe('finished')
  })

  it('gives the win to the opponent', () => {
    const updates = deriveGameUpdates(
      makeGame({ current_team: 'red' }),
      makeCard({ type: 'assassin' })
    )
    expect(updates.winner).toBe('blue')
  })

  it('opponent is red when blue team hits assassin', () => {
    const updates = deriveGameUpdates(
      makeGame({ current_team: 'blue' }),
      makeCard({ type: 'assassin' })
    )
    expect(updates.winner).toBe('red')
  })
})

// ─── Own-team card ────────────────────────────────────────────────────────────

describe('revealing your own team card', () => {
  it('decrements red_remaining when red reveals a red card', () => {
    const game = makeGame({ current_team: 'red', red_remaining: 5 })
    const updates = deriveGameUpdates(game, makeCard({ type: 'red' }))
    expect(updates.red_remaining).toBe(4)
  })

  it('decrements blue_remaining when blue reveals a blue card', () => {
    const game = makeGame({ current_team: 'blue', blue_remaining: 4 })
    const updates = deriveGameUpdates(game, makeCard({ type: 'blue' }))
    expect(updates.blue_remaining).toBe(3)
  })

  it('does not switch the turn (team continues guessing)', () => {
    const game = makeGame({ current_team: 'red', red_remaining: 5 })
    const updates = deriveGameUpdates(game, makeCard({ type: 'red' }))
    expect(updates.current_team).toBeUndefined()
  })

  it('does not change the opponent count', () => {
    const game = makeGame({ current_team: 'red', red_remaining: 5, blue_remaining: 8 })
    const updates = deriveGameUpdates(game, makeCard({ type: 'red' }))
    expect(updates.blue_remaining).toBeUndefined()
  })
})

// ─── Opponent card ────────────────────────────────────────────────────────────

describe('revealing the opponent team card', () => {
  it('switches the turn to the opponent', () => {
    const game = makeGame({ current_team: 'red' })
    const updates = deriveGameUpdates(game, makeCard({ type: 'blue' }))
    expect(updates.current_team).toBe('blue')
  })

  it('switches the turn from blue to red', () => {
    const game = makeGame({ current_team: 'blue' })
    const updates = deriveGameUpdates(game, makeCard({ type: 'red' }))
    expect(updates.current_team).toBe('red')
  })

  it('decrements the opponent count', () => {
    const game = makeGame({ current_team: 'red', blue_remaining: 8 })
    const updates = deriveGameUpdates(game, makeCard({ type: 'blue' }))
    expect(updates.blue_remaining).toBe(7)
  })
})

// ─── Neutral card ─────────────────────────────────────────────────────────────

describe('revealing a neutral card', () => {
  it('switches the turn to the opponent', () => {
    const game = makeGame({ current_team: 'red' })
    const updates = deriveGameUpdates(game, makeCard({ type: 'neutral' }))
    expect(updates.current_team).toBe('blue')
  })

  it('does not change any remaining count', () => {
    const game = makeGame({ current_team: 'red', red_remaining: 5, blue_remaining: 8 })
    const updates = deriveGameUpdates(game, makeCard({ type: 'neutral' }))
    expect(updates.red_remaining).toBeUndefined()
    expect(updates.blue_remaining).toBeUndefined()
  })

  it('does not end the game', () => {
    const updates = deriveGameUpdates(makeGame(), makeCard({ type: 'neutral' }))
    expect(updates.status).toBeUndefined()
    expect(updates.winner).toBeUndefined()
  })
})

// ─── Win conditions ───────────────────────────────────────────────────────────

describe('win condition', () => {
  it('red wins when last red card is revealed', () => {
    const game = makeGame({ current_team: 'red', red_remaining: 1 })
    const updates = deriveGameUpdates(game, makeCard({ type: 'red' }))
    expect(updates.status).toBe('finished')
    expect(updates.winner).toBe('red')
    expect(updates.red_remaining).toBe(0)
  })

  it('blue wins when last blue card is revealed', () => {
    const game = makeGame({ current_team: 'blue', blue_remaining: 1 })
    const updates = deriveGameUpdates(game, makeCard({ type: 'blue' }))
    expect(updates.status).toBe('finished')
    expect(updates.winner).toBe('blue')
    expect(updates.blue_remaining).toBe(0)
  })

  it('blue wins even if red reveals the last blue card', () => {
    const game = makeGame({ current_team: 'red', blue_remaining: 1 })
    const updates = deriveGameUpdates(game, makeCard({ type: 'blue' }))
    expect(updates.status).toBe('finished')
    expect(updates.winner).toBe('blue')
  })

  it('does not end game when there are still cards left', () => {
    const game = makeGame({ red_remaining: 2 })
    const updates = deriveGameUpdates(game, makeCard({ type: 'red' }))
    expect(updates.status).toBeUndefined()
    expect(updates.winner).toBeUndefined()
  })
})
