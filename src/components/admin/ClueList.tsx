import type { Clue } from '@/types/game'

const TEAM_LABEL: Record<string, string> = { red: 'אדום', blue: 'כחול' }

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'medium' })
}

export default function ClueList({ clues, unavailable }: { clues: Clue[]; unavailable?: boolean }) {
  if (unavailable) {
    return <p className="text-sm text-game-red">לא ניתן היה לטעון את היסטוריית הרמזים.</p>
  }
  if (clues.length === 0) {
    return <p className="text-sm text-ink-faint">לא ניתנו רמזים במשחק זה.</p>
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {clues.map((clue) => (
        <li
          key={clue.id}
          className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
        >
          <span className="font-semibold text-ink">
            {TEAM_LABEL[clue.team] ?? clue.team}: &quot;{clue.word}&quot; ({clue.count})
          </span>
          <span className="text-xs text-ink-faint whitespace-nowrap">{formatTime(clue.created_at)}</span>
        </li>
      ))}
    </ul>
  )
}
