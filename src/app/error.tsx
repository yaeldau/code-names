'use client'

import { useEffect } from 'react'
import Link from 'next/link'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-4 text-center">
      <h1 className="text-2xl font-bold text-gray-900">משהו השתבש</h1>
      <p className="text-gray-500">אירעה שגיאה בלתי צפויה.</p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
        >
          נסה שוב
        </button>
        <Link
          href="/"
          className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          דף הבית
        </Link>
      </div>
    </main>
  )
}
