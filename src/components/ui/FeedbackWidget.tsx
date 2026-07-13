'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'

const MAX_LENGTH = 1000

type Status = 'idle' | 'sending' | 'sent' | 'error'

export default function FeedbackWidget() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [status, setStatus] = useState<Status>('idle')

  const gameCode = pathname.match(/^\/game\/([A-Za-z0-9]+)/)?.[1]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = message.trim()
    if (!trimmed || status === 'sending') return

    setStatus('sending')
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          honeypot,
          pageUrl: pathname,
          gameCode,
        }),
      })
      if (!res.ok) throw new Error('request failed')

      setStatus('sent')
      setMessage('')
      setTimeout(() => {
        setOpen(false)
        setStatus('idle')
      }, 1800)
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="fixed bottom-4 left-4 z-50">
      {open ? (
        <form
          onSubmit={handleSubmit}
          className="w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-gray-200 bg-white p-4 shadow-lg flex flex-col gap-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-800">💡 יש לכם רעיון?</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-600 leading-none"
              aria-label="סגור"
            >
              ✕
            </button>
          </div>

          {/* Honeypot — hidden from real users; bots that auto-fill every field trip it. */}
          <input
            type="text"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            className="hidden"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
          />

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MAX_LENGTH))}
            placeholder="רעיון לפיצ'ר, דיווח על באג, או כל דבר אחר..."
            maxLength={MAX_LENGTH}
            rows={4}
            disabled={status === 'sending' || status === 'sent'}
            className="resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-60"
          />

          {status === 'sent' && (
            <p className="text-center text-sm text-green-600">תודה על המשוב! 🙏</p>
          )}
          {status === 'error' && (
            <p className="text-center text-xs text-red-500">משהו השתבש. נסו שוב.</p>
          )}

          <button
            type="submit"
            disabled={!message.trim() || status === 'sending' || status === 'sent'}
            className="rounded-xl bg-gray-900 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-40 transition-colors"
          >
            {status === 'sending' ? 'שולח...' : 'שליחה'}
          </button>
        </form>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="w-12 h-12 rounded-full bg-gray-900 text-xl shadow-lg hover:bg-gray-800 transition-colors flex items-center justify-center"
          aria-label="שליחת משוב"
          title="יש לכם רעיון?"
        >
          💡
        </button>
      )}
    </div>
  )
}
