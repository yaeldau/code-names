'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { createPresenceController, type PresenceController } from '@/lib/presence/client'
import { newClueId } from '@/lib/clue-submit'
import type { PresencePayload } from '@/lib/presence/shared'

/**
 * Anonymous presence heartbeat (D1/E1). Rendered once in the root layout only
 * when NEXT_PUBLIC_PRESENCE_ENABLED=true. Renders nothing.
 *
 * One controller per page load, held at module level: React Strict Mode's
 * double effects and re-renders can never create a second timer or tab id.
 * Never sends URLs or query strings (so never a spymaster token) — only the
 * page category and game code derived in classifyPath.
 */

let controller: PresenceController | null = null

async function send(payload: PresencePayload): Promise<number> {
  try {
    const res = await fetch('/api/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'omit', // presence never uses cookies
      keepalive: true,
    })
    return res.status
  } catch {
    return 0
  }
}

function beacon(payload: PresencePayload) {
  try {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
    if (!navigator.sendBeacon?.('/api/presence', blob)) void send(payload)
  } catch {
    // best effort only
  }
}

function getController(): PresenceController {
  if (!controller) {
    controller = createPresenceController({
      tabId: newClueId(), // random per page load (works outside secure contexts too)
      transport: { send, beacon },
      initiallyVisible: document.visibilityState !== 'hidden',
    })
  }
  return controller
}

export default function PresenceBeacon() {
  const pathname = usePathname()

  useEffect(() => {
    getController().setPath(pathname ?? '/')
  }, [pathname])

  useEffect(() => {
    const c = getController()
    const onVisibility = () => c.setVisible(document.visibilityState !== 'hidden')
    const onOnline = () => c.online()
    const onPageHide = () => c.pageHide()
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) c.setVisible(true) }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [])

  return null
}
