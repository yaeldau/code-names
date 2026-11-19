import type { GameStatus, Team } from '@/types/game'

export const MAX_MESSAGE_LENGTH = 1000
const MAX_METADATA_LENGTH = 300
const MAX_NAME_LENGTH = 100
const MAX_CLUE_WORD_LENGTH = 50
const MAX_REMAINING = 25 // generous upper bound (board is 25 cards) — this is just email metadata, not a rules check
const MAX_CLUE_COUNT = 20

// True for ASCII control/non-printable characters (null bytes, escape sequences,
// etc). Keeps normal whitespace: space (32), tab (9), newline (10), CR (13).
function isControlCodePoint(code: number): boolean {
  if (code === 9 || code === 10 || code === 13) return false
  if (code <= 31) return true
  return code === 127
}

function stripControlChars(input: string): string {
  let result = ''
  for (const ch of input) {
    if (!isControlCodePoint(ch.codePointAt(0) ?? 0)) result += ch
  }
  return result
}

/** Validates and cleans the feedback message. Returns null if it's not usable. */
export function sanitizeMessage(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const cleaned = stripControlChars(input).trim()
  if (!cleaned || cleaned.length > MAX_MESSAGE_LENGTH) return null
  return cleaned
}

/** Cleans an optional single-line metadata string (page URL, user agent). Returns null if unusable. */
export function sanitizeMetadata(input: unknown, maxLength = MAX_METADATA_LENGTH): string | null {
  if (typeof input !== 'string') return null
  // Metadata fields are single-line by definition — collapse newlines too,
  // not just control characters, so they can't inject extra "lines" into the email.
  const cleaned = stripControlChars(input).replace(/[\r\n]+/g, ' ').trim().slice(0, maxLength)
  return cleaned || null
}

// Matches the 6-character code alphabet from create_game (supabase/migrations/004),
// but kept slightly loose since this is informational metadata, not a lookup key.
export function isValidGameCode(code: unknown): code is string {
  return typeof code === 'string' && /^[A-Z0-9]{4,8}$/i.test(code)
}

// ─── Feedback type ──────────────────────────────────────────────────────────

export type FeedbackType = 'bug' | 'unclear' | 'idea' | 'other'

/** Single source of truth for the type selector — used by the client to render
 * the picker and by the server to label the type in the email. */
export const FEEDBACK_TYPES: { value: FeedbackType; icon: string; shortLabel: string; fullLabel: string }[] = [
  { value: 'bug', icon: '🐛', shortLabel: 'לא עובד', fullLabel: 'משהו לא עובד' },
  { value: 'unclear', icon: '🤔', shortLabel: 'לא ברור', fullLabel: 'משהו לא ברור' },
  { value: 'idea', icon: '💡', shortLabel: 'רעיון', fullLabel: 'יש לי רעיון' },
  { value: 'other', icon: '💬', shortLabel: 'אחר', fullLabel: 'אחר' },
]

const FEEDBACK_TYPE_VALUES = new Set(FEEDBACK_TYPES.map((t) => t.value))

export function isValidFeedbackType(input: unknown): input is FeedbackType {
  return typeof input === 'string' && FEEDBACK_TYPE_VALUES.has(input as FeedbackType)
}

function feedbackTypeEmailLabel(type: FeedbackType): string {
  const entry = FEEDBACK_TYPES.find((t) => t.value === type)
  return entry ? `${entry.icon} ${entry.fullLabel}` : type
}

// ─── Optional contact details ───────────────────────────────────────────────

// Deliberately simple — good enough to catch typos and obvious junk, not full RFC 5322 validation.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(input: unknown): input is string {
  return typeof input === 'string' && input.trim().length <= 200 && EMAIL_PATTERN.test(input.trim())
}

export interface ContactInfo {
  name: string
  email: string
}

/** Returns null both for a missing/malformed object and for one whose name is
 * missing or whose email doesn't validate — callers that need to distinguish "no contact info sent"
 * from "invalid contact info sent" check for the raw field's presence themselves. */
export function sanitizeContact(input: unknown): ContactInfo | null {
  if (typeof input !== 'object' || input === null) return null
  const c = input as Record<string, unknown>
  const name = sanitizeMetadata(c.name, MAX_NAME_LENGTH)
  if (!name || !isValidEmail(c.email)) return null
  return { name, email: c.email.trim() }
}

// ─── Game context ───────────────────────────────────────────────────────────

export type PlayerRole = 'spymaster' | 'guesser'

/** Snapshot of what the submitter was looking at, captured client-side from
 * state already in memory (see src/lib/game-feedback-context.ts) — never a
 * fresh DB read. Only gameCode is guaranteed; everything else is filled in
 * opportunistically and may be absent. */
export interface GameFeedbackContext {
  gameCode: string
  status?: GameStatus
  role?: PlayerRole
  currentTeam?: Team
  redRemaining?: number
  blueRemaining?: number
  clueWord?: string | null
  clueCount?: number | null
}

const GAME_STATUSES = new Set<GameStatus>(['waiting', 'active', 'finished'])
const TEAMS = new Set<Team>(['red', 'blue'])

function isSafeRemaining(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_REMAINING
}

/** Validates each field independently and drops whatever doesn't check out,
 * rather than rejecting the whole object — a stray/invalid optional field
 * should never lose the rest of the context (or the game code). */
export function sanitizeGameContext(input: unknown): GameFeedbackContext | null {
  if (typeof input !== 'object' || input === null) return null
  const c = input as Record<string, unknown>
  if (!isValidGameCode(c.gameCode)) return null

  const ctx: GameFeedbackContext = { gameCode: c.gameCode.toUpperCase() }

  if (typeof c.status === 'string' && GAME_STATUSES.has(c.status as GameStatus)) {
    ctx.status = c.status as GameStatus
  }
  if (c.role === 'spymaster' || c.role === 'guesser') {
    ctx.role = c.role
  }
  if (typeof c.currentTeam === 'string' && TEAMS.has(c.currentTeam as Team)) {
    ctx.currentTeam = c.currentTeam as Team
  }
  if (isSafeRemaining(c.redRemaining)) ctx.redRemaining = c.redRemaining
  if (isSafeRemaining(c.blueRemaining)) ctx.blueRemaining = c.blueRemaining

  const clueWord = sanitizeMetadata(c.clueWord, MAX_CLUE_WORD_LENGTH)
  if (clueWord) {
    ctx.clueWord = clueWord
    if (typeof c.clueCount === 'number' && Number.isInteger(c.clueCount) && c.clueCount >= 0 && c.clueCount <= MAX_CLUE_COUNT) {
      ctx.clueCount = c.clueCount
    }
  }

  return ctx
}

// ─── Device context ─────────────────────────────────────────────────────────

export interface DeviceContext {
  viewportWidth: number
  viewportHeight: number
  isMobile: boolean
  // Browser-reported only (navigator.language / Intl resolvedOptions) — never
  // derived from IP or any other lookup. No geolocation, no fingerprinting.
  locale?: string
  timeZone?: string
}

const MAX_VIEWPORT_DIMENSION = 20_000
const MAX_LOCALE_LENGTH = 35 // e.g. "en-US"
const MAX_TIMEZONE_LENGTH = 50 // e.g. "America/Argentina/Buenos_Aires"

function isSafeDimension(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= MAX_VIEWPORT_DIMENSION
}

export function sanitizeDevice(input: unknown): DeviceContext | null {
  if (typeof input !== 'object' || input === null) return null
  const d = input as Record<string, unknown>
  if (!isSafeDimension(d.viewportWidth) || !isSafeDimension(d.viewportHeight)) return null

  const device: DeviceContext = {
    viewportWidth: Math.round(d.viewportWidth),
    viewportHeight: Math.round(d.viewportHeight),
    isMobile: d.isMobile === true,
  }

  const locale = sanitizeMetadata(d.locale, MAX_LOCALE_LENGTH)
  if (locale) device.locale = locale
  const timeZone = sanitizeMetadata(d.timeZone, MAX_TIMEZONE_LENGTH)
  if (timeZone) device.timeZone = timeZone

  return device
}

// ─── Email body ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<GameStatus, string> = { waiting: 'ממתין', active: 'פעיל', finished: 'הסתיים' }
const ROLE_LABEL: Record<PlayerRole, string> = { spymaster: 'מרגל', guesser: 'מנחש' }
const TEAM_LABEL: Record<Team, string> = { red: 'אדום', blue: 'כחול' }

interface FeedbackEmailParams {
  type: FeedbackType
  message: string
  contact: ContactInfo | null
  gameContext: GameFeedbackContext | null
  device: DeviceContext | null
  pageUrl: string | null
  userAgent: string | null
  timestamp: string
}

/** Builds the plain-text email body. No HTML — sent as `text`, so nothing here is ever rendered.
 * Sections mirror what's actually available: optional fields (contact, game context, device)
 * are only printed when present. */
export function buildFeedbackEmail({
  type,
  message,
  contact,
  gameContext,
  device,
  pageUrl,
  userAgent,
  timestamp,
}: FeedbackEmailParams): string {
  const lines: string[] = ['משוב', `סוג: ${feedbackTypeEmailLabel(type)}`, '', 'הודעה:', message]

  if (contact) {
    lines.push('', 'איש קשר')
    if (contact.name) lines.push(`שם: ${contact.name}`)
    lines.push(`אימייל: ${contact.email}`)
  }

  if (gameContext) {
    lines.push('', 'הקשר משחק', `משחק: ${gameContext.gameCode}`)
    if (gameContext.role) lines.push(`תפקיד: ${ROLE_LABEL[gameContext.role]}`)
    if (gameContext.status) lines.push(`סטטוס: ${STATUS_LABEL[gameContext.status]}`)
    if (gameContext.currentTeam) lines.push(`תור נוכחי: ${TEAM_LABEL[gameContext.currentTeam]}`)
    if (gameContext.redRemaining != null) lines.push(`נותרו לאדום: ${gameContext.redRemaining}`)
    if (gameContext.blueRemaining != null) lines.push(`נותרו לכחול: ${gameContext.blueRemaining}`)
    if (gameContext.clueWord) {
      const countLabel = gameContext.clueCount != null ? ` (${gameContext.clueCount === 0 ? '∞' : gameContext.clueCount})` : ''
      lines.push(`רמז נוכחי: ${gameContext.clueWord}${countLabel}`)
    }
  }

  lines.push('', 'מידע טכני', `זמן: ${timestamp}`, `עמוד: ${pageUrl ?? '—'}`)
  if (device) {
    lines.push(`מכשיר: ${device.isMobile ? 'נייד' : 'מחשב'}`, `רזולוציית תצוגה: ${device.viewportWidth}x${device.viewportHeight}`)
    if (device.locale) lines.push(`שפה: ${device.locale}`)
    if (device.timeZone) lines.push(`אזור זמן: ${device.timeZone}`)
  }
  lines.push(`דפדפן: ${userAgent ?? '—'}`)

  return lines.join('\n')
}
