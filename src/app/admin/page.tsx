import type { Metadata } from 'next'
import Link from 'next/link'
import AdminHeader from '@/components/admin/AdminHeader'
import GameSummaryCard from '@/components/admin/GameSummaryCard'
import { getAdminGamesOverview } from '@/lib/admin/queries'

export const metadata: Metadata = {
  title: 'ניהול משחקים',
  robots: { index: false, follow: false },
}

interface AdminDashboardPageProps {
  searchParams: Promise<{ page?: string }>
}

export default async function AdminDashboardPage({ searchParams }: AdminDashboardPageProps) {
  const { page: rawPage } = await searchParams
  const overview = await getAdminGamesOverview(rawPage)

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <AdminHeader title="ניהול משחקים" />

        <Link
          href="/admin/live"
          className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-navy hover:bg-bg transition-colors"
        >
          פעילות חיה — מי באתר עכשיו ←
        </Link>

        {/* Exact DB counts, independent of the paginated list below — game
            history is retained intentionally, not a short-lived snapshot. */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="text-2xl font-bold text-navy">{overview.totalCount}</div>
            <div className="text-xs text-ink-soft">סה״כ משחקים</div>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="text-2xl font-bold text-navy">{overview.notFinishedCount}</div>
            <div className="text-xs text-ink-soft">משחקים שלא הסתיימו</div>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="text-2xl font-bold text-navy">{overview.finishedCount}</div>
            <div className="text-xs text-ink-soft">משחקים שהסתיימו</div>
          </div>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-ink-soft">היסטוריית משחקים</h2>

          {overview.games.length === 0 ? (
            <p className="text-sm text-ink-faint">אין משחקים להצגה.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {overview.games.map((game) => (
                <GameSummaryCard key={game.code} game={game} />
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-2 text-sm">
            {overview.page > 1 ? (
              <Link
                href={`/admin?page=${overview.page - 1}`}
                className="text-navy hover:opacity-70 transition-opacity"
              >
                → הקודם
              </Link>
            ) : (
              <span className="text-ink-faint">→ הקודם</span>
            )}

            <span className="text-xs text-ink-faint">
              עמוד {overview.page} מתוך {overview.totalPages}
            </span>

            {overview.page < overview.totalPages ? (
              <Link
                href={`/admin?page=${overview.page + 1}`}
                className="text-navy hover:opacity-70 transition-opacity"
              >
                הבא ←
              </Link>
            ) : (
              <span className="text-ink-faint">הבא ←</span>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
