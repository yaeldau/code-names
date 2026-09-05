import type { GameStatus } from '@/types/game'

const STATUS_LABEL: Record<GameStatus, string> = {
  waiting: 'ממתין',
  active: 'פעיל',
  finished: 'הסתיים',
}

const STATUS_CLASS: Record<GameStatus, string> = {
  waiting: 'bg-neutral-card text-ink-soft',
  active: 'bg-game-blue-tint text-game-blue',
  finished: 'bg-border text-ink-faint',
}

export default function GameStatusBadge({ status }: { status: GameStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}
