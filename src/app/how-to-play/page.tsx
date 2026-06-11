import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'איך משחקים?',
  description: 'הוראות המשחק לשם קוד — Codenames בעברית. למדו כיצד לשחק במשחק הקלפים החברתי הפופולרי.',
}

export default function HowToPlayPage() {
  return (
    <main className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-sm text-gray-500 underline underline-offset-2 mb-6 inline-block">
          ← חזרה לדף הבית
        </Link>

        <h1 className="text-3xl font-bold text-gray-900 mb-8">איך משחקים?</h1>

        {/* Rules content will go here */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-gray-400">
          הוראות המשחק — בקרוב
        </div>
      </div>
    </main>
  )
}
