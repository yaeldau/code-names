export type CardType = 'red' | 'blue' | 'neutral' | 'assassin'
export type Team = 'red' | 'blue'
export type GameStatus = 'waiting' | 'active' | 'finished'
/** Determines what content cards display. Add new modes here + in the DB enum + src/decks/registry.ts. */
export type GameMode = 'words' | 'pictures'

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
  next_game_code: string | null
  next_game_spymaster_token: string | null
  mode: GameMode
  theme: string
}

export interface Card {
  id: string
  game_id: string
  word: string
  /** Image asset key within the game's theme folder. Set only when mode is 'pictures'. */
  image_key: string | null
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
