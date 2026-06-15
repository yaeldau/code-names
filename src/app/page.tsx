import type { Metadata } from 'next'
import Link from 'next/link'
import CreateGameButton from '@/components/ui/CreateGameButton'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://shemkod.com'

export const metadata: Metadata = {
  title: 'שם קוד | משחק Codenames בעברית אונליין — חינמי וללא הרשמה',
  description:
    'שחקו שם קוד בעברית אונליין עם חברים. משחק Codenames מרגלים בעברית — ללא הרשמה, ללא התקנה. צרו משחק תוך שנייה ושתפו קישור.',
  alternates: { canonical: siteUrl },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'שם קוד',
  url: siteUrl,
  description: 'משחק Codenames בעברית אונליין — ללא הרשמה, ללא תשלום',
  applicationCategory: 'Game',
  operatingSystem: 'Web',
  inLanguage: 'he',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'ILS' },
}

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-10">
        <div className="text-center">
          <h1 className="text-6xl font-bold text-gray-900 mb-3">שם קוד</h1>
          <p className="text-lg text-gray-400">משחק Codenames בעברית — שחקו עם חברים בזמן אמת</p>
        </div>

        <div className="w-full max-w-xs flex flex-col gap-3">
          <CreateGameButton
            label="צור משחק חדש"
            className="w-full rounded-2xl bg-gray-900 py-4 text-lg font-semibold text-white hover:bg-gray-800 active:bg-gray-950 disabled:opacity-50 transition-colors"
          />

          <Link
            href="/how-to-play"
            className="text-center text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2"
          >
            איך משחקים?
          </Link>
        </div>

        {/* SEO content — visible to Google, readable by users */}
        <section className="w-full max-w-xl text-center flex flex-col gap-6 pt-4 border-t border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-700 mb-1">מה זה שם קוד?</h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              שם קוד הוא משחק קלפים חברתי פופולרי ל-4 עד 8 שחקנים.
              שתי קבוצות מתחרות — כל קבוצה מנסה לגלות את כל הסוכנים שלה
              לפי רמזים חד-מילוליים שנותן המרגל שלה.
              גרסה מקוונת בעברית, ללא הרשמה וללא תשלום.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="flex flex-col gap-1">
              <span className="text-2xl">🔗</span>
              <span className="font-medium text-gray-700">שתפו קישור</span>
              <span className="text-gray-400 text-xs">אין צורך בהתקנה</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-2xl">⚡</span>
              <span className="font-medium text-gray-700">זמן אמת</span>
              <span className="text-gray-400 text-xs">כל מהלך מתעדכן מיד</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-2xl">🆓</span>
              <span className="font-medium text-gray-700">חינמי לגמרי</span>
              <span className="text-gray-400 text-xs">ללא הרשמה</span>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}
