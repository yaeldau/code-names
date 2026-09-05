import Link from 'next/link'
import GameStatusBadge from './GameStatusBadge'
import type { AdminGameSummary } from '@/lib/admin/queries'

const TEAM_LABEL: Record<string, string> = { red: 'אדום', blue: 'כחול' }

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
}

export default function GameSummaryCard({ game }: { game: AdminGameSummary }) {
  return (
    <Link
      href={`/admin/games/${game.code}`}
      className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 shadow-sm hover:border-gray-300 transition-colors"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm font-bold text-ink tracking-widest">{game.code}</span>
        <GameStatusBadge status={game.status} />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
        <span>נוצר: {formatDateTime(game.created_at)}</span>
        {game.status === 'finished' ? (
          <span>מנצח: {game.winner ? TEAM_LABEL[game.winner] : '—'}</span>
        ) : (
          <span>תור: {TEAM_LABEL[game.current_team]}</span>
        )}
        <span>אדום נותרו: {game.red_remaining}</span>
        <span>כחול נותרו: {game.blue_remaining}</span>
        <span title={game.revealedCount === null ? 'לא ניתן היה לטעון את הנתון' : undefined}>
          קלפים שנחשפו: {game.revealedCount ?? '—'}
        </span>
        <span title={game.clueCount === null ? 'לא ניתן היה לטעון את הנתון' : undefined}>
          רמזים: {game.clueCount ?? '—'}
        </span>
      </div>
    </Link>
  )
}
