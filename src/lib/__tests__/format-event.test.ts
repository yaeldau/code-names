import { describe, it, expect } from 'vitest'
import { formatGameEvent } from '../admin/format-event'
import type { GameEvent } from '../admin/event-types'

const CARDS = [
  { id: 'card-1', word: 'תפוח' },
  { id: 'card-2', word: 'נהר' },
]

function makeEvent(overrides: Partial<GameEvent>): GameEvent {
  return {
    id: 1,
    game_id: 'game-1',
    event_type: 'CARD_REVEALED',
    payload: {},
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('formatGameEvent', () => {
  describe('CARD_REVEALED', () => {
    it('resolves the card word from the provided cards list', () => {
      const event = makeEvent({
        payload: { card_id: 'card-1', card_type: 'red', team_before: 'red' },
      })
      const result = formatGameEvent(event, CARDS)
      expect(result.title).toBe('נחשף הקלף "תפוח"')
      expect(result.detail).toBe('סוג: אדום · תור: אדום')
    })

    it('falls back to a generic title when the card cannot be resolved', () => {
      const event = makeEvent({ payload: { card_id: 'unknown-card', card_type: 'blue' } })
      const result = formatGameEvent(event, CARDS)
      expect(result.title).toBe('נחשף קלף')
      expect(result.detail).toBe('סוג: כחול')
    })

    it('handles a payload with no fields at all', () => {
      const event = makeEvent({ payload: {} })
      const result = formatGameEvent(event, CARDS)
      expect(result.title).toBe('נחשף קלף')
      expect(result.detail).toBeNull()
    })
  })

  describe('TURN_ENDED', () => {
    it('describes the team change and reason', () => {
      const event = makeEvent({
        event_type: 'TURN_ENDED',
        payload: { from_team: 'red', to_team: 'blue', reason: 'opponent_card', card_id: 'card-1' },
      })
      const result = formatGameEvent(event, CARDS)
      expect(result.title).toBe('התור עבר מאדום לכחול')
      expect(result.detail).toBe('קלף של הקבוצה היריבה')
    })

    it('falls back to a generic title when teams are missing', () => {
      const event = makeEvent({ event_type: 'TURN_ENDED', payload: {} })
      const result = formatGameEvent(event, CARDS)
      expect(result.title).toBe('התור הועבר')
      expect(result.detail).toBeNull()
    })

    it('shows an unrecognized reason verbatim rather than dropping it', () => {
      const event = makeEvent({
        event_type: 'TURN_ENDED',
        payload: { from_team: 'red', to_team: 'blue', reason: 'some_future_reason' },
      })
      expect(formatGameEvent(event, CARDS).detail).toBe('some_future_reason')
    })
  })

  describe('GAME_ENDED', () => {
    it('describes the winner and reason', () => {
      const event = makeEvent({
        event_type: 'GAME_ENDED',
        payload: { winner: 'blue', reason: 'assassin', card_id: 'card-1' },
      })
      const result = formatGameEvent(event, CARDS)
      expect(result.title).toBe('המשחק הסתיים — ניצחון לכחול')
      expect(result.detail).toBe('נחשף המתנקש')
    })

    it('falls back to a generic title when the winner is missing', () => {
      const event = makeEvent({ event_type: 'GAME_ENDED', payload: {} })
      expect(formatGameEvent(event, CARDS).title).toBe('המשחק הסתיים')
    })
  })

  it('never throws on an unrecognized event_type and labels it clearly', () => {
    const event = makeEvent({ event_type: 'SOMETHING_NEW' as GameEvent['event_type'], payload: {} })
    const result = formatGameEvent(event, CARDS)
    expect(result.title).toContain('אירוע לא מוכר')
    expect(result.title).toContain('SOMETHING_NEW')
    expect(result.detail).toBeNull()
  })

  it('preserves the event id and timestamp', () => {
    const event = makeEvent({ id: 42, created_at: '2026-05-05T12:00:00.000Z' })
    const result = formatGameEvent(event, CARDS)
    expect(result.id).toBe(42)
    expect(result.created_at).toBe('2026-05-05T12:00:00.000Z')
  })
})