import type { Card } from '@/types/game'
import type { EventsResult } from '@/lib/admin/queries'
import { formatGameEvent } from '@/lib/admin/format-event'

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'medium' })
}

// See the admin dashboard plan, §11 — each state has a distinct, honest
// message rather than a single blank "no events" for every reason.
export default function EventTimeline({
  result,
  cards,
}: {
  result: EventsResult
  cards: Pick<Card, 'id' | 'word'>[]
}) {
  if (result.state === 'disabled') {
    return <p className="text-sm text-ink-faint">מעקב אירועי משחק עדיין לא הופעל באתר.</p>
  }
  if (result.state === 'error') {
    return <p className="text-sm text-game-red">שגיאה בטעינת היסטוריית האירועים.</p>
  }
  if (result.state === 'empty-before-tracking') {
    return <p className="text-sm text-ink-faint">מעקב אירועים הופעל אחרי שהמשחק הזה נוצר.</p>
  }
  if (result.state === 'empty-no-events') {
    return <p className="text-sm text-ink-faint">לא נרשמו אירועים למשחק זה.</p>
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {result.events.map((event) => {
        const formatted = formatGameEvent(event, cards)
        return (
          <li
            key={formatted.id}
            className="flex items-start justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          >
            <div className="flex items-start gap-2">
              <span aria-hidden="true">{formatted.icon}</span>
              <div>
                <div className="font-semibold text-ink">{formatted.title}</div>
                {formatted.detail && <div className="text-xs text-ink-soft">{formatted.detail}</div>}
              </div>
            </div>
            <span className="text-xs text-ink-faint whitespace-nowrap">{formatTime(formatted.created_at)}</span>
          </li>
        )
      })}
    </ul>
  )
}
