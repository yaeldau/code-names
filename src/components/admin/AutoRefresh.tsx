'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { freshness } from '@/lib/admin/live'

/** Auto-refresh stops after this long without any interaction with the page. */
export const IDLE_PAUSE_MS = 15 * 60_000

/**
 * Re-renders the (server-rendered) live dashboard every `intervalMs` while the
 * tab is visible, and shows how old the data on screen is. If refreshes stop
 * succeeding, the age keeps growing and a "stale" warning appears — the numbers
 * are never silently presented as current. The only client component in the
 * admin area; it receives no analytics data, just the snapshot timestamp.
 *
 * Every refresh is a server render (a billed serverless invocation), so a
 * dashboard left open and untouched pauses itself after IDLE_PAUSE_MS; any
 * click, key press or returning to the tab resumes it.
 */
export default function AutoRefresh({ generatedAt, intervalMs = 15_000 }: { generatedAt: string; intervalMs?: number }) {
  const router = useRouter()
  const [now, setNow] = useState(() => Date.now())
  const lastActivity = useRef(Date.now())
  const idleRef = useRef(false)
  const [idle, setIdle] = useState(false)

  useEffect(() => {
    const markIdle = (v: boolean) => { idleRef.current = v; setIdle(v) }
    const wake = () => {
      lastActivity.current = Date.now()
      if (idleRef.current) { markIdle(false); router.refresh() }
    }
    const tick = setInterval(() => setNow(Date.now()), 1_000)
    const refresh = setInterval(() => {
      if (document.visibilityState !== 'visible' || idleRef.current) return
      if (Date.now() - lastActivity.current > IDLE_PAUSE_MS) { markIdle(true); return }
      router.refresh()
    }, intervalMs)
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      lastActivity.current = Date.now()
      markIdle(false)
      router.refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pointerdown', wake)
    window.addEventListener('keydown', wake)
    return () => {
      clearInterval(tick)
      clearInterval(refresh)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pointerdown', wake)
      window.removeEventListener('keydown', wake)
    }
  }, [router, intervalMs])

  const { ageSeconds, stale } = freshness(generatedAt, now)
  if (idle) {
    return (
      <p className="text-xs text-ink-soft" role="status">
        הרענון האוטומטי הושהה אחרי 15 דקות ללא פעילות (כדי לחסוך בקשות לשרת). הנתונים עודכנו לפני {ageSeconds} שניות — לחצו בכל מקום כדי לחדש.
      </p>
    )
  }
  return (
    <p className={`text-xs ${stale ? 'text-game-red font-semibold' : 'text-ink-faint'}`} role="status">
      {stale
        ? `הנתונים אינם עדכניים — עודכנו לפני ${ageSeconds} שניות`
        : `עודכן לפני ${ageSeconds} שניות · מתרענן אוטומטית`}
    </p>
  )
}
