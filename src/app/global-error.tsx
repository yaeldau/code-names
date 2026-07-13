'use client'

import { useEffect } from 'react'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      import('@sentry/nextjs').then(({ captureException }) => captureException(error))
    }
  }, [error])

  return (
    <html lang="he" dir="rtl">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#F7F8FA' }}>
        <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', gap: '1rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: 0 }}>משהו השתבש</h1>
          <p style={{ color: '#6B7280', margin: 0 }}>אירעה שגיאה בלתי צפויה.</p>
          <button
            onClick={reset}
            style={{ borderRadius: '0.75rem', background: '#111827', padding: '0.625rem 1.25rem', fontSize: '0.875rem', fontWeight: 600, color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            נסה שוב
          </button>
        </main>
      </body>
    </html>
  )
}
