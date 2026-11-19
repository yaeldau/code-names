import { describe, it, expect } from 'vitest'
import {
  sanitizeMessage,
  sanitizeMetadata,
  isValidGameCode,
  isValidFeedbackType,
  isValidEmail,
  sanitizeContact,
  sanitizeGameContext,
  sanitizeDevice,
  buildFeedbackEmail,
  MAX_MESSAGE_LENGTH,
} from '../feedback'

// ─── sanitizeMessage ────────────────────────────────────────────────────────

describe('sanitizeMessage', () => {
  it('trims whitespace', () => {
    expect(sanitizeMessage('  hello  ')).toBe('hello')
  })

  it('rejects non-string input', () => {
    expect(sanitizeMessage(42)).toBeNull()
    expect(sanitizeMessage(null)).toBeNull()
    expect(sanitizeMessage(undefined)).toBeNull()
    expect(sanitizeMessage({ message: 'hi' })).toBeNull()
  })

  it('rejects empty or whitespace-only messages', () => {
    expect(sanitizeMessage('')).toBeNull()
    expect(sanitizeMessage('   ')).toBeNull()
  })

  it('rejects messages over the max length', () => {
    expect(sanitizeMessage('a'.repeat(MAX_MESSAGE_LENGTH))).not.toBeNull()
    expect(sanitizeMessage('a'.repeat(MAX_MESSAGE_LENGTH + 1))).toBeNull()
  })

  it('strips control characters but keeps normal whitespace', () => {
    // Explicit escapes (not raw bytes) so the intent stays visible in source.
    const withControlChars = 'hello\x00\x07world\ntab\there'
    expect(sanitizeMessage(withControlChars)).toBe('helloworld\ntab\there')
  })

  it('keeps Hebrew text intact', () => {
    expect(sanitizeMessage('רעיון נהדר למשחק')).toBe('רעיון נהדר למשחק')
  })

  it('does not throw or strip on HTML-like input — treated as inert plain text', () => {
    const input = '<script>alert(1)</script>'
    expect(sanitizeMessage(input)).toBe(input)
  })
})

// ─── sanitizeMetadata ───────────────────────────────────────────────────────

describe('sanitizeMetadata', () => {
  it('returns null for non-strings', () => {
    expect(sanitizeMetadata(123)).toBeNull()
    expect(sanitizeMetadata(null)).toBeNull()
  })

  it('returns null for empty strings', () => {
    expect(sanitizeMetadata('   ')).toBeNull()
  })

  it('truncates to the given max length', () => {
    expect(sanitizeMetadata('a'.repeat(50), 10)).toBe('a'.repeat(10))
  })

  it('collapses newlines so a single field cannot inject extra lines', () => {
    expect(sanitizeMetadata('/game/ABC123\r\nInjected-Header: evil')).toBe(
      '/game/ABC123 Injected-Header: evil'
    )
  })
})

// ─── isValidGameCode ────────────────────────────────────────────────────────

describe('isValidGameCode', () => {
  it('accepts valid alphanumeric codes', () => {
    expect(isValidGameCode('ABC123')).toBe(true)
    expect(isValidGameCode('ab12')).toBe(true)
  })

  it('rejects non-strings, empty, and malformed codes', () => {
    expect(isValidGameCode(123)).toBe(false)
    expect(isValidGameCode('')).toBe(false)
    expect(isValidGameCode('has space')).toBe(false)
    expect(isValidGameCode('way-too-long-code')).toBe(false)
    expect(isValidGameCode(null)).toBe(false)
  })
})

// ─── isValidFeedbackType ────────────────────────────────────────────────────

describe('isValidFeedbackType', () => {
  it('accepts the known types', () => {
    expect(isValidFeedbackType('bug')).toBe(true)
    expect(isValidFeedbackType('unclear')).toBe(true)
    expect(isValidFeedbackType('idea')).toBe(true)
    expect(isValidFeedbackType('other')).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isValidFeedbackType('feature')).toBe(false)
    expect(isValidFeedbackType(null)).toBe(false)
    expect(isValidFeedbackType(42)).toBe(false)
  })
})

// ─── isValidEmail ───────────────────────────────────────────────────────────

describe('isValidEmail', () => {
  it('accepts reasonable-looking emails', () => {
    expect(isValidEmail('dana@example.com')).toBe(true)
    expect(isValidEmail(' dana@example.com ')).toBe(true)
  })

  it('rejects obviously malformed input', () => {
    expect(isValidEmail('not-an-email')).toBe(false)
    expect(isValidEmail('missing-domain@')).toBe(false)
    expect(isValidEmail('@missing-local.com')).toBe(false)
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail(null)).toBe(false)
    expect(isValidEmail(undefined)).toBe(false)
  })

  it('rejects unreasonably long input', () => {
    expect(isValidEmail(`${'a'.repeat(250)}@example.com`)).toBe(false)
  })
})

// ─── sanitizeContact ────────────────────────────────────────────────────────

describe('sanitizeContact', () => {
  it('returns null for non-objects', () => {
    expect(sanitizeContact(null)).toBeNull()
    expect(sanitizeContact('dana@example.com')).toBeNull()
  })

  it('returns null when the email is missing or invalid', () => {
    expect(sanitizeContact({})).toBeNull()
    expect(sanitizeContact({ email: 'not-an-email' })).toBeNull()
    expect(sanitizeContact({ name: 'דנה' })).toBeNull()
  })

  it('returns null when the name is missing or blank', () => {
    expect(sanitizeContact({ email: 'dana@example.com' })).toBeNull()
    expect(sanitizeContact({ name: '   ', email: 'dana@example.com' })).toBeNull()
  })

  it('accepts a non-English name alongside a valid email', () => {
    expect(sanitizeContact({ name: 'דנה', email: 'dana@example.com' })).toEqual({
      name: 'דנה',
      email: 'dana@example.com',
    })
  })

  it('trims the email', () => {
    expect(sanitizeContact({ name: 'דנה', email: '  dana@example.com  ' })?.email).toBe('dana@example.com')
  })
})

// ─── sanitizeGameContext ────────────────────────────────────────────────────

describe('sanitizeGameContext', () => {
  it('returns null without a valid game code', () => {
    expect(sanitizeGameContext(null)).toBeNull()
    expect(sanitizeGameContext({})).toBeNull()
    expect(sanitizeGameContext({ gameCode: 'not valid' })).toBeNull()
  })

  it('accepts a game code alone — other fields stay optional', () => {
    expect(sanitizeGameContext({ gameCode: 'abc123' })).toEqual({ gameCode: 'ABC123' })
  })

  it('includes every valid optional field', () => {
    expect(
      sanitizeGameContext({
        gameCode: 'abc123',
        status: 'active',
        role: 'spymaster',
        currentTeam: 'red',
        redRemaining: 5,
        blueRemaining: 6,
        clueWord: 'שמש',
        clueCount: 2,
      })
    ).toEqual({
      gameCode: 'ABC123',
      status: 'active',
      role: 'spymaster',
      currentTeam: 'red',
      redRemaining: 5,
      blueRemaining: 6,
      clueWord: 'שמש',
      clueCount: 2,
    })
  })

  it('drops individual invalid fields instead of rejecting the whole object', () => {
    expect(
      sanitizeGameContext({
        gameCode: 'ABC123',
        status: 'not-a-status',
        role: 'wizard',
        currentTeam: 'green',
        redRemaining: -1,
        blueRemaining: 999,
      })
    ).toEqual({ gameCode: 'ABC123' })
  })

  it('drops the clue count when there is no clue word', () => {
    expect(sanitizeGameContext({ gameCode: 'ABC123', clueCount: 3 })).toEqual({ gameCode: 'ABC123' })
  })
})

// ─── sanitizeDevice ─────────────────────────────────────────────────────────

describe('sanitizeDevice', () => {
  it('returns null without valid dimensions', () => {
    expect(sanitizeDevice(null)).toBeNull()
    expect(sanitizeDevice({ viewportWidth: 390 })).toBeNull()
    expect(sanitizeDevice({ viewportWidth: -1, viewportHeight: 800 })).toBeNull()
  })

  it('rounds dimensions and preserves isMobile', () => {
    expect(sanitizeDevice({ viewportWidth: 390.4, viewportHeight: 844.6, isMobile: true })).toEqual({
      viewportWidth: 390,
      viewportHeight: 845,
      isMobile: true,
    })
  })

  it('defaults isMobile to false when not exactly true', () => {
    expect(sanitizeDevice({ viewportWidth: 1440, viewportHeight: 900 })?.isMobile).toBe(false)
  })

  it('includes locale and timeZone when present', () => {
    expect(
      sanitizeDevice({
        viewportWidth: 390,
        viewportHeight: 844,
        isMobile: true,
        locale: 'he-IL',
        timeZone: 'Asia/Jerusalem',
      })
    ).toEqual({
      viewportWidth: 390,
      viewportHeight: 844,
      isMobile: true,
      locale: 'he-IL',
      timeZone: 'Asia/Jerusalem',
    })
  })

  it('omits locale and timeZone when missing', () => {
    const device = sanitizeDevice({ viewportWidth: 390, viewportHeight: 844 })
    expect(device).not.toHaveProperty('locale')
    expect(device).not.toHaveProperty('timeZone')
  })
})

// ─── buildFeedbackEmail ─────────────────────────────────────────────────────

describe('buildFeedbackEmail', () => {
  it('includes the message and type', () => {
    const email = buildFeedbackEmail({
      type: 'bug',
      message: 'תודה על המשחק!',
      contact: null,
      gameContext: null,
      device: null,
      pageUrl: '/game/ABC123',
      userAgent: 'Mozilla/5.0',
      timestamp: '2026-07-12T00:00:00.000Z',
    })
    expect(email).toContain('תודה על המשחק!')
    expect(email).toContain('משהו לא עובד')
    expect(email).toContain('/game/ABC123')
    expect(email).toContain('Mozilla/5.0')
    expect(email).toContain('2026-07-12T00:00:00.000Z')
  })

  it('falls back to a placeholder for missing page URL / user agent', () => {
    const email = buildFeedbackEmail({
      type: 'other',
      message: 'hi',
      contact: null,
      gameContext: null,
      device: null,
      pageUrl: null,
      userAgent: null,
      timestamp: '2026-07-12T00:00:00.000Z',
    })
    expect(email).toContain('—')
  })

  it('omits the contact, game, and device sections entirely when absent', () => {
    const email = buildFeedbackEmail({
      type: 'other',
      message: 'hi',
      contact: null,
      gameContext: null,
      device: null,
      pageUrl: null,
      userAgent: null,
      timestamp: '2026-07-12T00:00:00.000Z',
    })
    expect(email).not.toContain('איש קשר')
    expect(email).not.toContain('הקשר משחק')
    expect(email).not.toContain('מכשיר')
  })

  it('includes contact details when present', () => {
    const withName = buildFeedbackEmail({
      type: 'idea',
      message: 'hi',
      contact: { name: 'דנה', email: 'dana@example.com' },
      gameContext: null,
      device: null,
      pageUrl: null,
      userAgent: null,
      timestamp: '2026-07-12T00:00:00.000Z',
    })
    expect(withName).toContain('שם: דנה')
    expect(withName).toContain('אימייל: dana@example.com')
  })

  it('includes only the game context fields that are present', () => {
    const email = buildFeedbackEmail({
      type: 'unclear',
      message: 'לא הבנתי איך אני יודעת מה הרמז',
      contact: null,
      gameContext: {
        gameCode: 'ABC123',
        status: 'active',
        role: 'guesser',
        currentTeam: 'blue',
        redRemaining: 5,
        blueRemaining: 6,
        clueWord: 'שמש',
        clueCount: 2,
      },
      device: null,
      pageUrl: null,
      userAgent: null,
      timestamp: '2026-07-12T00:00:00.000Z',
    })
    expect(email).toContain('משחק: ABC123')
    expect(email).toContain('תפקיד: מנחש')
    expect(email).toContain('סטטוס: פעיל')
    expect(email).toContain('תור נוכחי: כחול')
    expect(email).toContain('נותרו לאדום: 5')
    expect(email).toContain('נותרו לכחול: 6')
    expect(email).toContain('רמז נוכחי: שמש (2)')
  })

  it('renders an infinite clue count as ∞', () => {
    const email = buildFeedbackEmail({
      type: 'unclear',
      message: 'hi',
      contact: null,
      gameContext: { gameCode: 'ABC123', clueWord: 'שמש', clueCount: 0 },
      device: null,
      pageUrl: null,
      userAgent: null,
      timestamp: '2026-07-12T00:00:00.000Z',
    })
    expect(email).toContain('רמז נוכחי: שמש (∞)')
  })

  it('includes device info when present', () => {
    const email = buildFeedbackEmail({
      type: 'other',
      message: 'hi',
      contact: null,
      gameContext: null,
      device: { viewportWidth: 390, viewportHeight: 844, isMobile: true },
      pageUrl: null,
      userAgent: null,
      timestamp: '2026-07-12T00:00:00.000Z',
    })
    expect(email).toContain('מכשיר: נייד')
    expect(email).toContain('רזולוציית תצוגה: 390x844')
  })

  it('includes locale and timeZone only when present', () => {
    const withBoth = buildFeedbackEmail({
      type: 'other',
      message: 'hi',
      contact: null,
      gameContext: null,
      device: { viewportWidth: 390, viewportHeight: 844, isMobile: true, locale: 'he-IL', timeZone: 'Asia/Jerusalem' },
      pageUrl: null,
      userAgent: null,
      timestamp: '2026-07-12T00:00:00.000Z',
    })
    expect(withBoth).toContain('שפה: he-IL')
    expect(withBoth).toContain('אזור זמן: Asia/Jerusalem')

    const withoutEither = buildFeedbackEmail({
      type: 'other',
      message: 'hi',
      contact: null,
      gameContext: null,
      device: { viewportWidth: 390, viewportHeight: 844, isMobile: true },
      pageUrl: null,
      userAgent: null,
      timestamp: '2026-07-12T00:00:00.000Z',
    })
    expect(withoutEither).not.toContain('שפה:')
    expect(withoutEither).not.toContain('אזור זמן:')
  })
})
