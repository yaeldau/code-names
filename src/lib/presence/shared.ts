/**
 * Presence protocol shared by the browser beacon and /api/presence (D1/E1).
 * Only what the dashboard needs is ever sent: a per-tab random id, a page
 * category, the game code (never a URL, query string or spymaster token), and
 * whether the tab is visible. Timestamps are always set by the database.
 */

export type PresencePage = 'home' | 'game' | 'how_to_play' | 'other'

export interface PresencePayload {
  tabId: string
  page: PresencePage
  gameCode: string | null
  visible: boolean
  /** Best-effort "tab is closing" — removes the tab's row early. */
  leave?: boolean
}

export const PRESENCE_PAGES: readonly PresencePage[] = ['home', 'game', 'how_to_play', 'other']
/**
 * A tab counts as online if its last heartbeat is newer than this.
 * 120 s with a 45 s interval tolerates one lost or late beat (gap ≈ 90 s +
 * network/server latency) without the tab flickering offline. Tabs closed
 * normally leave immediately (leave beacon); only crashed / killed tabs linger,
 * for at most this long.
 */
export const ONLINE_THRESHOLD_SECONDS = 120
/** Heartbeat period while the tab is visible (≈80 requests / tab / hour). */
export const HEARTBEAT_INTERVAL_MS = 45_000

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const GAME_CODE_RE = /^[A-Z0-9]{4,8}$/

/**
 * Maps a pathname to what is reported. Returns null for pages that must not
 * report at all (the admin area).
 */
export function classifyPath(pathname: string): { page: PresencePage; gameCode: string | null } | null {
  const path = pathname.split(/[?#]/)[0]
  if (path === '/admin' || path.startsWith('/admin/')) return null
  if (path === '/' || path === '') return { page: 'home', gameCode: null }
  if (path === '/how-to-play' || path.startsWith('/how-to-play/')) return { page: 'how_to_play', gameCode: null }
  const m = /^\/game\/([^/]+)\/?$/.exec(path)
  if (m) {
    const code = decodeURIComponent(m[1]).toUpperCase()
    return GAME_CODE_RE.test(code) ? { page: 'game', gameCode: code } : { page: 'other', gameCode: null }
  }
  return { page: 'other', gameCode: null }
}

/** Strict validation of an incoming heartbeat body. */
export function parsePresencePayload(input: unknown): PresencePayload | null {
  if (typeof input !== 'object' || input === null) return null
  const b = input as Record<string, unknown>
  if (typeof b.tabId !== 'string' || !UUID_RE.test(b.tabId)) return null
  if (typeof b.page !== 'string' || !PRESENCE_PAGES.includes(b.page as PresencePage)) return null
  const page = b.page as PresencePage
  let gameCode: string | null = null
  if (page === 'game') {
    if (typeof b.gameCode !== 'string' || !GAME_CODE_RE.test(b.gameCode)) return null
    gameCode = b.gameCode
  } else if (b.gameCode != null) {
    return null
  }
  if (typeof b.visible !== 'boolean') return null
  if (b.leave != null && typeof b.leave !== 'boolean') return null
  return { tabId: b.tabId, page, gameCode, visible: b.visible, leave: b.leave === true }
}
