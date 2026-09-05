import type { Card } from '@/types/game'
import type { GameEvent } from './event-types'

export interface FormattedEvent {
  id: number
  icon: string
  title: string
  detail: string | null
  created_at: string
}

const CARD_TYPE_LABEL: Record<string, string> = {
  red: 'אדום',
  blue: 'כחול',
  neutral: 'ניטרלי',
  assassin: 'מתנקש',
}

const TEAM_LABEL: Record<string, string> = { red: 'אדום', blue: 'כחול' }

const TURN_REASON_LABEL: Record<string, string> = {
  neutral: 'קלף ניטרלי',
  opponent_card: 'קלף של הקבוצה היריבה',
}

const GAME_END_REASON_LABEL: Record<string, string> = {
  assassin: 'נחשף המתנקש',
  all_cards_revealed: 'כל קלפי הקבוצה נחשפו',
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function resolveWord(cardId: unknown, cards: Pick<Card, 'id' | 'word'>[]): string | null {
  const id = str(cardId)
  if (!id) return null
  return cards.find((card) => card.id === id)?.word ?? null
}

function joinDetail(parts: (string | null | undefined)[]): string | null {
  const filtered = parts.filter((part): part is string => Boolean(part))
  return filtered.length > 0 ? filtered.join(' · ') : null
}

/**
 * Turns one game_events row into a readable Hebrew line. Every payload field
 * is read defensively (never assumed present/typed) — a malformed or future
 * payload shape degrades to a plainer message instead of throwing.
 */
export function formatGameEvent(event: GameEvent, cards: Pick<Card, 'id' | 'word'>[]): FormattedEvent {
  const payload = event.payload ?? {}
  const base = { id: event.id, created_at: event.created_at }

  switch (event.event_type) {
    case 'CARD_REVEALED': {
      const cardType = str(payload.card_type)
      const teamBefore = str(payload.team_before)
      const word = resolveWord(payload.card_id, cards)
      return {
        ...base,
        icon: '🔍',
        title: word ? `נחשף הקלף "${word}"` : 'נחשף קלף',
        detail: joinDetail([
          cardType ? `סוג: ${CARD_TYPE_LABEL[cardType] ?? cardType}` : null,
          teamBefore ? `תור: ${TEAM_LABEL[teamBefore] ?? teamBefore}` : null,
        ]),
      }
    }

    case 'TURN_ENDED': {
      const fromTeam = str(payload.from_team)
      const toTeam = str(payload.to_team)
      const reason = str(payload.reason)
      return {
        ...base,
        icon: '🔁',
        title:
          fromTeam && toTeam
            ? `התור עבר מ${TEAM_LABEL[fromTeam] ?? fromTeam} ל${TEAM_LABEL[toTeam] ?? toTeam}`
            : 'התור הועבר',
        detail: reason ? (TURN_REASON_LABEL[reason] ?? reason) : null,
      }
    }

    case 'GAME_ENDED': {
      const winner = str(payload.winner)
      const reason = str(payload.reason)
      return {
        ...base,
        icon: '🏁',
        title: winner ? `המשחק הסתיים — ניצחון ל${TEAM_LABEL[winner] ?? winner}` : 'המשחק הסתיים',
        detail: reason ? (GAME_END_REASON_LABEL[reason] ?? reason) : null,
      }
    }

    default:
      // Defensive: a real DB row isn't guaranteed to match the TS union at
      // runtime (e.g. a future event type added to the DB before the code).
      return {
        ...base,
        icon: '❓',
        title: `אירוע לא מוכר (${event.event_type})`,
        detail: null,
      }
  }
}