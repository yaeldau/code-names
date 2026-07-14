import type { CardType, GameMode, GameStatus, Team } from './game'

export type Database = {
  public: {
    Tables: {
      games: {
        Row: {
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
        Insert: {
          code: string
          status?: GameStatus
          current_team?: Team
          red_remaining?: number
          blue_remaining?: number
          winner?: Team | null
          spymaster_token?: string
          mode?: GameMode
          theme?: string
        }
        Update: Partial<{
          status: GameStatus
          current_team: Team
          red_remaining: number
          blue_remaining: number
          winner: Team | null
          next_game_code: string
          next_game_spymaster_token: string
        }>
      }
      cards: {
        Row: {
          id: string
          game_id: string
          word: string
          image_key: string | null
          type: CardType
          position: number
          revealed: boolean
        }
        Insert: {
          game_id: string
          word: string
          image_key?: string | null
          type: CardType
          position: number
          revealed?: boolean
        }
        Update: {
          revealed?: boolean
        }
      }
      clues: {
        Row: {
          id: string
          game_id: string
          team: Team
          word: string
          count: number
          created_at: string
        }
        Insert: {
          game_id: string
          team: Team
          word: string
          count: number
        }
        Update: never
      }
    }
  }
}
