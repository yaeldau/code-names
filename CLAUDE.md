# שם קוד — CLAUDE.md

Hebrew Codenames board game. No auth, no accounts — share a link and play.

**Exception:** `/admin` is a password-protected internal dashboard (owner-only game inspector) — see "Admin dashboard" below. It's the one deliberate carve-out from "no auth."

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

# /admin dashboard
ADMIN_PASSWORD=
ADMIN_SESSION_SECRET=
GAME_EVENTS_ENABLED_AT=   # set only once the game_events migration is deployed
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
    admin/
      login/page.tsx        # Password form, public
      actions.ts            # adminLogin, adminLogout (Server Actions)
      page.tsx              # Dashboard — /admin
      games/[code]/
        page.tsx             # Game detail — /admin/games/[code]
        not-found.tsx
  components/
    game/
      GameBoard.tsx         # Client component — Realtime subscription + all game state
      GameCard.tsx          # Single card tile
      CluePanel.tsx         # Spymaster input + clue display
      SharePanel.tsx        # Copy player/spymaster links
    ui/
      SubmitButton.tsx      # Form button with useFormStatus pending state
    admin/                  # Admin dashboard — all server components, no client JS
      AdminHeader.tsx, GameStatusBadge.tsx, GameSummaryCard.tsx,
      CardGrid.tsx, ClueList.tsx, EventTimeline.tsx
  lib/supabase/
    client.ts               # Browser Supabase client
    server.ts               # Server Supabase client + service-role client
  lib/admin/
    session.ts              # Sign/verify the admin session cookie
    queries.ts               # Admin data reads (service-role, explicit columns)
    aggregate.ts               # Pure chunked .in() count-merging (avoids the 1000-row/URL-length bug)
    pagination.ts               # Pure ?page= -> {page, totalPages, offset, limit} math
    format-event.ts               # Pure fn: game_events row → readable Hebrew line
    event-types.ts                 # Local GameEvent types (see game_events note below)
  types/
    game.ts                 # Game, Card, Clue, Team, CardType, GameStatus
    database.ts             # Supabase table schema types (keep in sync with migration)
  words/
    hebrew.json             # ~220 Hebrew words
middleware.ts               # Gates /admin/* — the only route protection in the app
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

### Admin dashboard (`/admin`)
Read-only internal game inspector — full game history plus a detail view (cards, clues, and recorded `game_events`). Protected by `middleware.ts` (matches `/admin/:path*`, excludes `/admin/login`), which verifies a signed, stateless session cookie (`src/lib/admin/session.ts`, HMAC via Web Crypto — no session store). Login/logout are Server Actions in `src/app/admin/actions.ts`. All admin data reads (`src/lib/admin/queries.ts`) use the service-role client with explicit column lists, deliberately excluding `spymaster_token`/`next_game_spymaster_token`; the whole feature has zero client components, so no game data ever reaches browser JS state through this surface. Event-history depends on the `game_events` table (see the migration note below) and reads `GAME_EVENTS_ENABLED_AT` to distinguish "not enabled yet" from "no events for this game" from "predates tracking" — never guesses from a query-error shape.

**Summary counts are exact, independent DB queries** (`count: 'exact', head: true` for total / not-finished / finished, run concurrently), never derived from `.length` of a fetched list. This is a fixed bug, not a style choice: with more than 1,000 games in the table (real production count as of this writing: ~1,831), an unbounded `.select()` silently truncates at PostgREST's default 1,000-row cap — deriving totals or per-game counts from that truncated list was actively wrong. The game history list itself is paginated (`src/lib/admin/pagination.ts`, 50/game per page, `?page=N`, newest-first by `created_at`) and is explicitly independent of the summary counts above it.

**`active` means "not formally finished," not "currently being played."** Every game is created with `status = 'active'` (the `waiting` enum value exists in the schema but no code path ever sets it — 0 real games have it). A game only leaves `active` when a win condition fires. Empirically, the large majority of `active` games in production have zero revealed cards and zero clues — they were opened and abandoned, never played. Don't build UI copy or logic that assumes `active` implies live activity; there is currently no `last_activity_at` or similar signal for that (a real "is this being played right now" feature would need one).

### Game state derivation from card events
For non-clickers, game state changes (turn switch, win condition) are derived directly from the `cards` realtime event inside `deriveGameUpdates()`. This keeps the card flip and turn indicator atomic. The `games` realtime event is a fallback/authoritative sync.

## Database

Three tables: `games`, `cards`, `clues`. All public RLS (no auth). Realtime enabled on `games` and `cards`.

Run migrations in order via Supabase SQL editor when setting up a new project.

A fourth table, `game_events` (append-only reveal/turn/game-end history), is drafted in `supabase/migrations/20260903112807_atomic_reveal_events.sql` but **not yet applied to production** — deploying it (plus the matching `reveal_card` RPC rewrite) is a separate, deliberate step. The admin dashboard is written against that schema but works correctly before it ships (see `GAME_EVENTS_ENABLED_AT` above).

### Retention — game history is intentionally kept
There is **no automatic deletion**. `src/app/api/cron/cleanup/route.ts` exists (deletes finished games after 1h, waiting/active after 24h) but is **deliberately not scheduled** — its entry was removed from `vercel.json`. This was a real short-retention assumption from an earlier phase of the project; it's now obsolete, since game history is a deliberate product feature (and something worth demonstrating). Do not re-add a cron schedule, run that route, or otherwise delete old games without a fresh, explicit decision — if a retention/archival policy is designed later, it should be a new, purpose-built decision, not a resurrection of the old one-size-fits-all age cutoff.

## Deployment

Vercel + Supabase free tier. Add the env vars (Supabase + admin) in the Vercel dashboard. No special build config needed. `vercel.json` has no `crons` entry — the cleanup route is intentionally unscheduled (see Retention above).
