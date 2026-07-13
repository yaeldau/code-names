export const MAX_MESSAGE_LENGTH = 1000
const MAX_METADATA_LENGTH = 300

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

interface FeedbackEmailParams {
  message: string
  pageUrl: string | null
  gameCode: string | null
  userAgent: string | null
  timestamp: string
}

/** Builds the plain-text email body. No HTML — sent as `text`, so nothing here is ever rendered. */
export function buildFeedbackEmail({
  message,
  pageUrl,
  gameCode,
  userAgent,
  timestamp,
}: FeedbackEmailParams): string {
  return [
    `זמן: ${timestamp}`,
    `עמוד: ${pageUrl ?? '—'}`,
    `קוד משחק: ${gameCode ?? '—'}`,
    `דפדפן: ${userAgent ?? '—'}`,
    '',
    'הודעה:',
    message,
  ].join('\n')
}
