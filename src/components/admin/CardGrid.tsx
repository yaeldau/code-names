import type { Card, CardType } from '@/types/game'

const TYPE_CLASS: Record<CardType, string> = {
  red: 'bg-game-red text-white border-game-red-dark',
  blue: 'bg-game-blue text-white border-game-blue-dark',
  neutral: 'bg-neutral-card text-ink border-border',
  assassin: 'bg-assassin text-white border-assassin',
}

export default function CardGrid({ cards, unavailable }: { cards: Card[]; unavailable?: boolean }) {
  if (unavailable) {
    return <p className="text-sm text-game-red">לא ניתן היה לטעון את לוח הקלפים.</p>
  }

  const sorted = [...cards].sort((a, b) => a.position - b.position)

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-ink-faint">
        תצוגת מנהל — כל סוגי הקלפים גלויים, כולל קלפים שטרם נחשפו.
      </p>
      <div className="grid grid-cols-5 gap-1.5">
        {sorted.map((card) => (
          <div
            key={card.id}
            title={card.revealed ? 'נחשף' : 'טרם נחשף'}
            className={[
              'aspect-[3/2] rounded-lg border flex items-center justify-center text-center px-1',
              'text-[11px] sm:text-xs font-semibold leading-tight',
              TYPE_CLASS[card.type],
              card.revealed ? '' : 'opacity-60',
            ].join(' ')}
          >
            {card.word}
          </div>
        ))}
      </div>
    </div>
  )
}
