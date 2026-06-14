import type { Metadata } from 'next'
import Link from 'next/link'
import CreateGameButton from '@/components/ui/CreateGameButton'

export const metadata: Metadata = {
  title: 'שם קוד | משחק Codenames בעברית',
}

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-10">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-900 mb-3">שם קוד</h1>
        <p className="text-lg text-gray-400">משחק Codenames בעברית — לשחק עם חברים בזמן אמת</p>
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
    </main>
  )
}
