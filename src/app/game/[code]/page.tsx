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
          <div className="flex items-center gap-2">
            <Link href="/" className="font-bold text-gray-900 hover:text-gray-600 transition-colors">
              שם קוד
            </Link>
            <CreateGameButton
              label="משחק חדש"
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
              currentGameId={game.id}
            />
          </div>

          <div className="flex items-center gap-3">
            <Link href="/how-to-play" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
              איך משחקים?
            </Link>
            {isSpymaster && (
              <span className="rounded-full px-3 py-1 text-xs font-semibold bg-purple-100 text-purple-700">
                מרגל
              </span>
            )}
            <span className="font-mono text-sm font-bold text-gray-400 tracking-widest">
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
