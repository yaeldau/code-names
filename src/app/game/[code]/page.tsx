import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import GameBoard from '@/components/game/GameBoard'
import CreateGameButton from '@/components/ui/CreateGameButton'

interface GamePageProps {
  params: Promise<{ code: string }>
  searchParams: Promise<{ spymaster?: string }>
}

export async function generateMetadata({ params }: GamePageProps): Promise<Metadata> {
  const { code } = await params
  return {
    title: `משחק ${code.toUpperCase()}`,
    robots: { index: false },
  }
}

export default async function GamePage({ params, searchParams }: GamePageProps) {
  const { code } = await params
  const { spymaster: token } = await searchParams

  const supabase = await createClient()

  const { data: game } = await supabase
    .from('games')
    .select('*')
    .eq('code', code.toUpperCase())
    .single()

  if (!game) notFound()

  const { data: cards } = await supabase
    .from('cards')
    .select('*')
    .eq('game_id', game.id)
    .order('position')

  if (!cards?.length) notFound()

  const { data: initialClues } = await supabase
    .from('clues')
    .select('*')
    .eq('game_id', game.id)
    .order('created_at', { ascending: true })

  const isSpymaster = Boolean(token && token === game.spymaster_token)

  return (
    <main className="min-h-screen p-3 sm:p-4">
      <div className="max-w-xl mx-auto flex flex-col gap-3">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Link href="/" className="font-bold text-navy hover:opacity-70 transition-opacity text-lg">
              שם קוד
            </Link>
            <CreateGameButton
              label="משחק חדש"
              className="rounded-xl bg-navy px-3 py-1.5 text-sm font-semibold text-white hover:opacity-80 disabled:opacity-40 transition-opacity"
              currentGameId={game.id}
            />
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/how-to-play"
              className="text-sm text-ink-faint hover:text-ink-soft transition-colors"
              title="איך משחקים?"
            >
              <span className="hidden sm:inline">איך משחקים?</span>
              <span className="sm:hidden">?</span>
            </Link>
            {isSpymaster && (
              <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-navy text-white">
                מרגל
              </span>
            )}
            <span className="font-mono text-xs font-bold text-ink-faint tracking-widest bg-surface border border-border rounded-lg px-2 py-1">
              {game.code}
            </span>
          </div>
        </header>

        <GameBoard
          initialGame={game}
          initialCards={cards}
          initialClues={initialClues ?? []}
          isSpymaster={isSpymaster}
        />
      </div>
    </main>
  )
}
