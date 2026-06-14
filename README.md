# שם קוד — Hebrew Codenames

A free, real-time Hebrew version of the board game [Codenames](https://en.wikipedia.org/wiki/Codenames_(board_game)), playable in any browser with no account required.

**[▶ Play now](https://codenames-il.vercel.app)** · Built with Next.js 15 + Supabase

---

## How It Works

- Anyone can create a game and share a link — no login, no install
- Two teams (red and blue) take turns guessing Hebrew words on a 5×5 board
- Each team has a **spymaster** who can see all card colors and gives one-word clues
- Operatives tap cards to reveal them — instant update for everyone in the room
- First team to reveal all their cards wins; touching the assassin card loses immediately

## Features

- 🇮🇱 Full Hebrew RTL interface with Heebo font
- ⚡ Real-time card reveals via Supabase Realtime (no polling)
- 📱 Mobile-first responsive layout
- 🔗 Shareable links — one for players, one for spymasters
- 🎭 Spymaster view shows all card colors; player view hides them
- 🚫 No authentication, no accounts

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | [Next.js 15](https://nextjs.org) (App Router, Server Actions) |
| Language | TypeScript |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) |
| Database | [Supabase](https://supabase.com) (Postgres) |
| Real-time | Supabase Realtime (Postgres change events) |
| Font | [Heebo](https://fonts.google.com/specimen/Heebo) (Hebrew subset) |
| Hosting | [Vercel](https://vercel.com) + Supabase free tier |

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

### 4. Run the database migration

Open the [Supabase SQL editor](https://supabase.com/dashboard) for your project, paste the contents of [`supabase/migrations/001_initial.sql`](supabase/migrations/001_initial.sql), and click **Run**.

This creates the `games`, `cards`, and `clues` tables with Row Level Security and Realtime enabled.

### 5. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
src/
├── app/
│   ├── actions.ts              # Server Actions: createGame, revealCard, endTurn
│   ├── page.tsx                # Homepage — create a game
│   ├── game/[code]/
│   │   ├── page.tsx            # Game page (SSR, spymaster token check)
│   │   └── not-found.tsx       # Invalid game code
│   └── how-to-play/page.tsx   # Rules page (SEO-indexed)
├── components/
│   ├── game/
│   │   ├── GameBoard.tsx       # Client component — Realtime subscription, state
│   │   ├── GameCard.tsx        # Single card tile
│   │   └── SharePanel.tsx      # Copy player/spymaster links
│   └── ui/
│       └── SubmitButton.tsx    # Form button with pending state
├── lib/supabase/
│   ├── client.ts               # Browser Supabase client
│   └── server.ts               # Server Supabase client (Server Components + Actions)
├── types/
│   ├── game.ts                 # Game, Card, Team, CardType types
│   └── database.ts             # Supabase table schema types
└── words/
    └── hebrew.json             # ~220 Hebrew words for card generation
supabase/
└── migrations/
    └── 001_initial.sql         # Full schema: tables, RLS, indexes, Realtime
```

---

## Database Schema

```sql
games   — id, code, status, current_team, red_remaining, blue_remaining,
          winner, spymaster_token, created_at

cards   — id, game_id, word, type (red|blue|neutral|assassin),
          position (0–24), revealed

clues   — id, game_id, team, word, count, created_at
```

All tables use Row Level Security with public read/write — no auth needed. Realtime is enabled on `games` and `cards` for live updates.

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

This project is designed to deploy for free on Vercel + Supabase.

**Vercel:**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yaeldau/code-names)

Add the three environment variables from your Supabase project during setup.

**Supabase free tier limits** (sufficient for a party game):
- 500 MB database storage
- 200 concurrent Realtime connections
- Database pauses after 7 days of inactivity (one-click restore)

---

## License

MIT
