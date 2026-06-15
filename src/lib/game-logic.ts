import type { Card, Game, Team } from '@/types/game'

/**
 * Given the current game state and a card that was just revealed,
 * returns the subset of game fields that need updating.
 * Pure function — no side effects.
 */
export function deriveGameUpdates(game: Game, card: Card): Partial<Game> {
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
