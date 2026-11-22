import { classifyPath, HEARTBEAT_INTERVAL_MS, type PresencePayload } from './shared'

/**
 * Browser-side heartbeat scheduler (D1/E1). Framework-free and time-injectable
 * so the scheduling rules are unit-testable. The tab id is held in memory only —
 * never in a cookie or any browser storage. Rules:
 *
 * - One beat on start, then every HEARTBEAT_INTERVAL_MS while the tab is visible.
 * - Route change → one beat right away (coalesced), timer restarted.
 * - Tab hidden → one final beat marked invisible, then the timer stops (the row
 *   expires after the online threshold; no background traffic).
 * - Tab visible again / back online → immediate beat, timer restarted.
 * - pagehide → best-effort `leave` (sendBeacon); expiry is the real mechanism.
 * - The server answering 400/404/413/429 (bad request, feature off, not
 *   migrated, rate limited, daily budget reached / switched off)
 *   stops all beats for this page load; 5xx / network errors back off
 *   exponentially (45 s, 45 s, 90 s, 180 s … capped at 10 min) — never a fast retry
 *   loop, and an outage can't multiply requests.
 * - Admin pages never report.
 */

export interface PresenceTransport {
  /** Returns the HTTP status, or 0 on a network failure. Must not throw. */
  send: (payload: PresencePayload) => Promise<number>
  /** Fire-and-forget during unload. */
  beacon: (payload: PresencePayload) => void
}

export interface PresenceClock {
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (id: unknown) => void
}

export interface PresenceController {
  setPath: (pathname: string) => void
  setVisible: (visible: boolean) => void
  online: () => void
  pageHide: () => void
  readonly disabled: boolean
}

const COALESCE_MS = 250
// Permanent answers stop this page load's beacon; anything else that isn't a
// success (5xx, network error) is transient and backs off exponentially.
const STOP_STATUSES = new Set([400, 401, 403, 404, 410, 413, 429])
export const MAX_BACKOFF_MS = 10 * 60_000

export function createPresenceController(opts: {
  tabId: string
  transport: PresenceTransport
  clock?: PresenceClock
  intervalMs?: number
  initiallyVisible: boolean
}): PresenceController {
  const clock: PresenceClock = opts.clock ?? {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  }
  const intervalMs = opts.intervalMs ?? HEARTBEAT_INTERVAL_MS

  let path: string | null = null
  let visible = opts.initiallyVisible
  let timer: unknown = null
  let disabled = false
  let inFlight = false
  let pendingAfterFlight = false
  let failures = 0

  function payload(extra: Partial<PresencePayload> = {}): PresencePayload | null {
    if (path === null) return null
    const c = classifyPath(path)
    if (!c) return null
    return { tabId: opts.tabId, page: c.page, gameCode: c.gameCode, visible, ...extra }
  }

  function clear() {
    if (timer !== null) clock.clearTimeout(timer)
    timer = null
  }

  function schedule(ms: number) {
    clear()
    if (disabled) return
    timer = clock.setTimeout(() => { timer = null; void beat() }, ms)
  }

  async function beat() {
    if (disabled) return
    const p = payload()
    if (!p) { clear(); return }
    if (inFlight) { pendingAfterFlight = true; return }
    inFlight = true
    const status = await opts.transport.send(p)
    inFlight = false
    if (STOP_STATUSES.has(status)) {
      disabled = true
      clear()
      return
    }
    failures = status >= 200 && status < 300 ? 0 : failures + 1
    if (pendingAfterFlight && failures === 0) {
      pendingAfterFlight = false
      schedule(0)
      return
    }
    pendingAfterFlight = false
    // Success: regular cadence. Transient failure: back off (no immediate retry).
    // The first retry stays at the normal interval, so one lost beat never takes
    // the tab offline (45 + 45 s < 120 s threshold); repeated failures double it.
    if (visible) schedule(Math.min(intervalMs * 2 ** Math.max(0, failures - 1), MAX_BACKOFF_MS))
  }

  return {
    setPath(pathname) {
      if (pathname === path) return
      path = pathname
      if (!classifyPath(pathname)) { clear(); return }
      schedule(COALESCE_MS)
    },
    setVisible(v) {
      if (v === visible) return
      visible = v
      if (!v) {
        clear()
        void beat() // one beat marked invisible; no timer while hidden
      } else {
        schedule(0)
      }
    },
    online() {
      if (visible) schedule(0)
    },
    pageHide() {
      clear()
      const p = payload({ leave: true })
      if (p && !disabled) opts.transport.beacon(p)
    },
    get disabled() { return disabled },
  }
}
