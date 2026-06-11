export type CardType = 'red' | 'blue' | 'neutral' | 'assassin'
export type Team = 'red' | 'blue'
export type GameStatus = 'waiting' | 'active' | 'finished'

export interface Game {
  id: string
  code: string
  status: GameStatus
  current_team: Team
  red_remaining: number
  blue_remaining: number
  winner: Team | null
  spymaster_token: string
  version: number
  created_at: string
}

export interface Card {
  id: string
  game_id: string
  word: string
  type: CardType
  position: number
  revealed: boolean
}

export interface Clue {
  id: string
  game_id: string
  team: Team
  word: string
  count: number
  created_at: string
}
