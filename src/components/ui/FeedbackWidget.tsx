'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { FEEDBACK_TYPES, isValidEmail, type FeedbackType } from '@/lib/feedback'
import { getGameFeedbackContext } from '@/lib/game-feedback-context'

const MAX_LENGTH = 1000
const MAX_NAME_LENGTH = 100
const MOBILE_BREAKPOINT = 640 // matches the project's Tailwind `sm:` breakpoint

type Status = 'idle' | 'sending' | 'sent' | 'error'

/** Browser-reported device info only — no geolocation, IP lookup, or fingerprinting. */
function readDeviceContext() {
  let timeZone: string | undefined
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    // Intl support is effectively universal, but never let this block submission.
  }
  return {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    isMobile: window.innerWidth < MOBILE_BREAKPOINT,
    locale: navigator.language || undefined,
    timeZone,
  }
}

export default function FeedbackWidget() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('other')
  const [contactEnabled, setContactEnabled] = useState(false)
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [honeypot, setHoneypot] = useState('')
  const [status, setStatus] = useState<Status>('idle')

  const pathGameCode = pathname.match(/^\/game\/([A-Za-z0-9]+)/)?.[1]
  const busy = status === 'sending' || status === 'sent'
  const emailValid = isValidEmail(contactEmail)
  const canSubmit = Boolean(message.trim()) && !busy && (!contactEnabled || emailValid)

  function resetForm() {
    setMessage('')
    setFeedbackType('other')
    setContactEnabled(false)
    setContactName('')
    setContactEmail('')
    setEmailTouched(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = message.trim()
    if (!trimmed || busy) return
    if (contactEnabled && !emailValid) {
      setEmailTouched(true)
      return
    }

    setStatus('sending')
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          type: feedbackType,
          honeypot,
          pageUrl: pathname,
          gameContext: getGameFeedbackContext() ?? (pathGameCode ? { gameCode: pathGameCode } : null),
          device: readDeviceContext(),
          contact: contactEnabled ? { name: contactName.trim() || undefined, email: contactEmail.trim() } : null,
        }),
      })
      if (!res.ok) throw new Error('request failed')

      setStatus('sent')
      resetForm()
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
          className="w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-gray-200 bg-white p-4 shadow-lg flex flex-col gap-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-800">מה תרצו לספר לנו?</span>
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

          <div className="grid grid-cols-2 gap-1.5">
            {FEEDBACK_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setFeedbackType(t.value)}
                aria-pressed={feedbackType === t.value}
                disabled={busy}
                className={[
                  'flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-colors disabled:opacity-60',
                  feedbackType === t.value ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100',
                ].join(' ')}
              >
                <span aria-hidden="true">{t.icon}</span>
                {t.shortLabel}
              </button>
            ))}
          </div>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MAX_LENGTH))}
            placeholder="ספרו לנו בקצרה..."
            maxLength={MAX_LENGTH}
            rows={4}
            disabled={busy}
            className="resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-60"
          />

          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={contactEnabled}
              onChange={(e) => setContactEnabled(e.target.checked)}
              disabled={busy}
              className="rounded border-gray-300"
            />
            אפשר לחזור אליי לגבי הפידבק
          </label>

          {contactEnabled && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="feedback-name" className="text-[11px] text-gray-500">
                  שם <span className="text-gray-400">(לא חובה)</span>
                </label>
                <input
                  id="feedback-name"
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value.slice(0, MAX_NAME_LENGTH))}
                  disabled={busy}
                  className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-60"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="feedback-email" className="text-[11px] text-gray-500">
                  אימייל
                </label>
                <input
                  id="feedback-email"
                  type="email"
                  dir="ltr"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  onBlur={() => setEmailTouched(true)}
                  disabled={busy}
                  required
                  className={[
                    'rounded-xl border bg-gray-50 px-3 py-2 text-sm text-gray-800 text-right focus:outline-none focus:ring-2 disabled:opacity-60',
                    emailTouched && !emailValid ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-gray-300',
                  ].join(' ')}
                />
                {emailTouched && !emailValid ? (
                  <p className="text-[11px] text-red-500">נא להזין אימייל תקין</p>
                ) : (
                  <p className="text-[11px] text-gray-400">נדרש כדי שנוכל לחזור אליך</p>
                )}
              </div>
            </div>
          )}

          {status === 'sent' && (
            <p className="text-center text-sm text-green-600">תודה על המשוב! 🙏</p>
          )}
          {status === 'error' && (
            <p className="text-center text-xs text-red-500">משהו השתבש. נסו שוב.</p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
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
          title="משוב"
        >
          💬
        </button>
      )}
    </div>
  )
}
