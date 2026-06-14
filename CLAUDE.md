# שם קוד — CLAUDE.md

Hebrew Codenames board game. No auth, no accounts — share a link and play.

## Stack

- **Next.js 15** (App Router, Server Actions, Turbopack in dev)
- **TypeScript** with strict mode
- **Tailwind CSS v4**
- **Supabase** — Postgres + Realtime (no auth)
- **Vercel** hosting

## Dev Commands

```bash
npm run dev      # start dev server (http://localhost:3000)
npm run build    # production build
npm run lint     # ESLint
```

## Environment Variables

Copy `.env.local.example` → `.env.local` and fill in from Supabase project settings.

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## Project Structure

```
src/
  app/
    actions.ts              # Server Actions: createGame, revealCard, addClue, endTurn
    page.tsx                # Homepage (create game)
    error.tsx               # Global error boundary
    not-found.tsx           # Global 404
    game/[code]/
      page.tsx              # Game page — SSR + spymaster token check
      not-found.tsx         # Invalid game code 404
    how-to-play/page.tsx    # Rules page (placeholder)
  components/
    game/
      GameBoard.tsx         # Client component — Realtime subscription + all game state
      GameCard.tsx          # Single card tile
      CluePanel.tsx         # Spymaster input + clue display
      SharePanel.tsx        # Copy player/spymaster links
    ui/
      SubmitButton.tsx      # Form button with useFormStatus pending state
  lib/supabase/
    client.ts               # Browser Supabase client
    server.ts               # Server Supabase client + service-role client
  types/
    game.ts                 # Game, Card, Clue, Team, CardType, GameStatus
    database.ts             # Supabase table schema types (keep in sync with migration)
  words/
    hebrew.json             # ~220 Hebrew words
supabase/migrations/
  001_initial.sql           # Tables, RLS, indexes, Realtime
  002_add_version.sql       # game.version column + auto-increment trigger
```

## Key Architecture Decisions

### Server Actions for all mutations
`createGame`, `revealCard`, `addClue`, `endTurn` are all Server Actions in `app/actions.ts`. No API routes.

### Realtime via Supabase channel
`GameBoard` subscribes to `postgres_changes` for `games`, `cards`, and `clues`. The subscription is set up in a single `useEffect` on `game.id`.

### Optimistic updates + deduplication
Card reveals are applied optimistically in `handleReveal` before the server responds. To prevent double-application when the Realtime event arrives:
- The local clicker increments `pendingClicks.current` before the server call
- The `games` realtime handler decrements it and skips if still > 0
- `game.version` (auto-incremented by DB trigger on every UPDATE) is used to drop duplicate/out-of-order events: `if (newGame.version <= appliedVersion.current) return`

### Spymaster via URL token
No login. Spymaster opens `/game/CODE?spymaster=UUID` — the `spymaster_token` UUID from the DB is in the URL query string. Keep it secret or share it only with spymasters.

### Game state derivation from card events
For non-clickers, game state changes (turn switch, win condition) are derived directly from the `cards` realtime event inside `deriveGameUpdates()`. This keeps the card flip and turn indicator atomic. The `games` realtime event is a fallback/authoritative sync.

## Database

Three tables: `games`, `cards`, `clues`. All public RLS (no auth). Realtime enabled on `games` and `cards`.

Run migrations in order via Supabase SQL editor when setting up a new project.

## Deployment

Vercel + Supabase free tier. Add the three env vars in Vercel dashboard. No special build config needed.
