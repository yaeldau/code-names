import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import AdminHeader from '@/components/admin/AdminHeader'
import GameStatusBadge from '@/components/admin/GameStatusBadge'
import CardGrid from '@/components/admin/CardGrid'
import ClueList from '@/components/admin/ClueList'
import EventTimeline from '@/components/admin/EventTimeline'
import { getAdminGameDetail } from '@/lib/admin/queries'

interface AdminGamePageProps {
  params: Promise<{ code: string }>
}

const TEAM_LABEL: Record<string, string> = { red: 'אדום', blue: 'כחול' }

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'medium' })
}

export async function generateMetadata({ params }: AdminGamePageProps): Promise<Metadata> {
  const { code } = await params
  return { title: `משחק ${code.toUpperCase()}`, robots: { index: false, follow: false } }
}

export default async function AdminGamePage({ params }: AdminGamePageProps) {
  const { code } = await params
  const game = await getAdminGameDetail(code)

  if (!game) notFound()

  const revealedCount = game.cardsUnavailable ? null : game.cards.filter((card) => card.revealed).length

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <AdminHeader title={`משחק ${game.code}`} backHref="/admin" />

        <section className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <GameStatusBadge status={game.status} />
            <span className="text-xs text-ink-faint">נוצר: {formatDateTime(game.created_at)}</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
            {game.status === 'finished' ? (
              <span>מנצח: {game.winner ? TEAM_LABEL[game.winner] : '—'}</span>
            ) : (
              <span>תור נוכחי: {TEAM_LABEL[game.current_team]}</span>
            )}
            <span>אדום נותרו: {game.red_remaining}</span>
            <span>כחול נותרו: {game.blue_remaining}</span>
            <span title={game.cardsUnavailable ? 'לא ניתן היה לטעון את הקלפים' : undefined}>
              קלפים שנחשפו: {revealedCount ?? '—'} / {game.cardsUnavailable ? '—' : game.cards.length}
            </span>
            <span title={game.cluesUnavailable ? 'לא ניתן היה לטעון את הרמזים' : undefined}>
              רמזים: {game.cluesUnavailable ? '—' : game.clues.length}
            </span>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-ink-soft">לוח הקלפים</h2>
          <CardGrid cards={game.cards} unavailable={game.cardsUnavailable} />
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-ink-soft">היסטוריית רמזים</h2>
          <ClueList clues={game.clues} unavailable={game.cluesUnavailable} />
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-ink-soft">אירועים שנרשמו</h2>
          <EventTimeline result={game.events} cards={game.cards} />
        </section>
      </div>
    </main>
  )
}
