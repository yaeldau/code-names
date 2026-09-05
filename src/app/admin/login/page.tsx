import type { Metadata } from 'next'
import { adminLogin } from '../actions'

export const metadata: Metadata = {
  title: 'כניסת מנהל',
  robots: { index: false, follow: false },
}

interface AdminLoginPageProps {
  searchParams: Promise<{ error?: string }>
}

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  const { error } = await searchParams

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-bg">
      <form
        action={adminLogin}
        className="w-full max-w-xs flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-sm"
      >
        <h1 className="text-lg font-bold text-ink text-center">כניסת מנהל</h1>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm text-ink-soft">
            סיסמה
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoFocus
            className="rounded-xl border border-border bg-bg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20"
          />
        </div>

        {error && <p className="text-sm text-game-red text-center">סיסמה שגויה.</p>}

        <button
          type="submit"
          className="rounded-xl bg-navy py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
        >
          כניסה
        </button>
      </form>
    </main>
  )
}