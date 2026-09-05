# שם קוד — Hebrew Codenames

A free, real-time Hebrew version of the board game [Codenames](https://en.wikipedia.org/wiki/Codenames_(board_game)), playable in any browser with no account required.

**[▶ Play now](https://shemkod.com)** · Built with Next.js 15 + Supabase

---

## How It Works

- Anyone can create a game and share a link — no login, no install
- Two teams (red and blue) take turns guessing Hebrew words on a 5×5 board
- Each team has a **spymaster** who can see all card colors and gives one-word clues
- Operatives tap cards to reveal them — instant update for everyone in the room
- First team to reveal all their cards wins; touching the assassin card loses immediately

## Features

- 🇮🇱 Full Hebrew RTL interface with the Heebo font
- ⚡ Real-time sync for card reveals, clues, and game state via Supabase Realtime (no polling)
- 🎯 Optimistic card reveals — the clicker's own UI updates instantly, before the server round-trip completes
- 🔒 Out-of-order/stale update protection via a DB-incremented `games.version` column
- 🔗 Separate shareable links — a player link and a secret spymaster link (via a `spymaster` token in the URL)
- 🎭 Spymaster view shows all card colors; player view hides them
- 💬 Live clue display plus a full clue history for both teams
- 🔁 Synchronized rematches — starting a new game broadcasts to every connected client so the whole room jumps to the new board together
- 🚫 No authentication, no accounts
- 🔍 SEO-ready: page metadata, JSON-LD structured data, sitemap, robots.txt, and dynamic Open Graph images
- 🧹 Scheduled cleanup of stale/abandoned games via a Vercel cron job
- ✅ Unit tested with Vitest

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | [Next.js 15](https://nextjs.org) (App Router, Server Actions, Turbopack in dev) |
| Language | TypeScript (strict mode) |
| UI | [React 19](https://react.dev) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) |
| Database | [Supabase](https://supabase.com) (Postgres) |
| Real-time | Supabase Realtime — `postgres_changes` for game/card/clue sync, broadcast for new-game signaling |
| Testing | [Vitest](https://vitest.dev) |
| Font | [Heebo](https://fonts.google.com/specimen/Heebo) (Hebrew subset) |
| Hosting | [Vercel](https://vercel.com) + Supabase free tier, with Vercel Cron for cleanup |

---

## Local Development

### 1. Clone and install

```bash
git clone https://github.com/yaeldau/code-names.git
cd code-names
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free project
2. In **Settings → API**, copy your **Project URL** and **anon key**

### 3. Set up environment variables

```bash
cp .env.local.example .env.local
```

Fill in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 4. Run the database migrations

Open the [Supabase SQL editor](https://supabase.com/dashboard) for your project and run each file in `supabase/migrations/` in order (001 → 008):

| Migration | Purpose |
|---|---|
| `001_initial.sql` | Base schema — `games`, `cards`, `clues` tables, RLS, Realtime |
| `002_add_version.sql` | `games.version` column + trigger, auto-incremented on every update (drives stale-event protection) |
| `003_realtime_clues.sql` | Enables Realtime on the `clues` table |
| `004_create_game_rpc.sql` | `create_game` RPC — creates a game + 25 cards atomically in one call |
| `005_direct_mutations.sql` | `reveal_card` RPC — atomic card reveal + score/turn/win-state update in one transaction |
| `006_replica_identity_full.sql` | `REPLICA IDENTITY FULL` on all three tables, required for Realtime to work correctly with RLS |
| `007_next_game.sql` | `next_game_code` / `next_game_spymaster_token` columns — DB fallback for the rematch broadcast |
| `008_tighten_rls.sql` | Tightens RLS to block writes to finished games and cross-game mutations |

### 5. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 6. Run tests

```bash
npm test
```

---

## Project Structure

```
src/
├── app/
│   ├── actions.ts                  # Server Actions: createGame, createNewGame, startNewGame
│   ├── api/
│   │   ├── cron/cleanup/route.ts   # Vercel Cron — deletes stale/finished games
│   │   ├── og-b/route.tsx          # Dynamic Open Graph image variant
│   │   └── og-c/route.tsx          # Dynamic Open Graph image variant
│   ├── page.tsx                    # Homepage — create a game
│   ├── layout.tsx                  # Root layout — fonts, metadata, JSON-LD
│   ├── icon.tsx                    # App icon
│   ├── opengraph-image.tsx         # Default Open Graph image
│   ├── sitemap.ts                  # Dynamic sitemap.xml
│   ├── robots.ts                   # robots.txt (disallows indexing ephemeral game rooms)
│   ├── error.tsx / not-found.tsx   # Global error/404 boundaries
│   ├── game/[code]/
│   │   ├── page.tsx                # Game page (SSR, spymaster token check)
│   │   └── not-found.tsx           # Invalid game code
│   └── how-to-play/page.tsx        # Rules page (SEO-indexed)
├── components/
│   ├── game/
│   │   ├── GameBoard.tsx           # Client component — Realtime subscription + all game state
│   │   ├── GameCard.tsx            # Single card tile
│   │   ├── CluePanel.tsx           # Spymaster clue input + live clue display
│   │   └── SharePanel.tsx          # Copy player/spymaster links
│   └── ui/
│       ├── CreateGameButton.tsx    # Homepage/header "new game" button
│       └── BackButton.tsx
├── lib/
│   ├── game-logic.ts               # deriveGameUpdates() — turn/score/win-state logic shared by client + realtime
│   ├── words.ts                    # Word sampling + card type shuffling
│   ├── og.ts                       # Shared Open Graph image helpers
│   ├── __tests__/                  # Vitest unit tests
│   └── supabase/
│       ├── client.ts               # Browser Supabase client
│       └── server.ts               # Server Supabase client + service-role client
├── types/
│   ├── game.ts                     # Game, Card, Clue, Team, CardType, GameStatus
│   └── database.ts                 # Supabase table schema types
└── words/
    └── hebrew.json                 # ~220 Hebrew words for card generation
supabase/
└── migrations/
    └── 001–008_*.sql                # Full schema history, in order
```

---

## Database Schema

```sql
games   — id, code, status, current_team, red_remaining, blue_remaining,
          winner, spymaster_token, version, next_game_code,
          next_game_spymaster_token, created_at

cards   — id, game_id, word, type (red|blue|neutral|assassin),
          position (0–24), revealed

clues   — id, game_id, team, word, count, created_at
```

All tables use Row Level Security with public read/write (no auth), tightened in migration 008 to block writes to finished games. Realtime is enabled on `games`, `cards`, and `clues` for live sync across all connected clients.

---

## Real-time Architecture

- **`postgres_changes`** subscriptions on `games`, `cards`, and `clues` keep every connected client in sync — a card flip, clue, or turn change from one player appears instantly for everyone else.
- **Optimistic updates**: the player who clicks a card sees it flip immediately, before the server confirms. A `pendingClicks` counter on the client prevents the same reveal from being double-applied when its own Realtime event echoes back.
- **`games.version`**, auto-incremented by a DB trigger on every update, lets clients discard duplicate or out-of-order Realtime events (`if (newGame.version <= appliedVersion.current) return`).
- **Broadcast for rematches**: starting a new game sends a Supabase broadcast event to every client in the room so they all navigate to the new board together, with a DB-column fallback (`next_game_code`) for anyone who missed the broadcast.

---

## Game Rules (Codenames)

1. Players split into two teams: red and blue
2. Each team picks a **spymaster** — they open the spymaster link and can see all card colors
3. The board shows a 5×5 grid of Hebrew words
   - 9 cards belong to the **first team** (red)
   - 8 cards belong to the **second team** (blue)
   - 7 cards are **neutral**
   - 1 card is the **assassin**
4. Spymasters alternate giving a one-word clue + a number (e.g. "בעל חיים 3")
5. Operatives tap cards they think match the clue
   - Own team card → score a point, keep guessing
   - Neutral or opponent card → turn ends
   - Assassin card → **immediate loss**
6. First team to reveal all their cards wins

---

## Deployment

Live at **[shemkod.com](https://shemkod.com)**, running on Vercel + Supabase free tier.

**Vercel:**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yaeldau/code-names)

- Add the three Supabase environment variables during setup
- `NEXT_PUBLIC_SITE_URL` controls the canonical domain used for metadata, sitemap, and OG images (defaults to `https://shemkod.com`)
- `CRON_SECRET` protects the `/api/cron/cleanup` endpoint, called daily by Vercel Cron (configured in `vercel.json`) to delete finished games older than 1 hour and abandoned games older than 24 hours

**Supabase free tier limits** (sufficient for a party game):
- 500 MB database storage
- 200 concurrent Realtime connections
- Database pauses after 7 days of inactivity (one-click restore)

---

## AI-Assisted Development

This project was built iteratively with the help of AI coding tools — used for implementation, code review, debugging, performance investigation, and refinement throughout development. All AI-generated suggestions were reviewed and verified before being shipped.

---

## License

MIT
