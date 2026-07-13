import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import * as Sentry from '@sentry/nextjs'
import { createServiceClient } from '@/lib/supabase/server'
import {
  sanitizeMessage,
  sanitizeMetadata,
  isValidGameCode,
  buildFeedbackEmail,
  MAX_MESSAGE_LENGTH,
} from '@/lib/feedback'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 6_000
const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_SECONDS = 600

function errorResponse(status: number, message = 'משהו השתבש. נסו שוב מאוחר יותר.') {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request) {
  // Every path below — including infrastructure failures like a missing env
  // var or a Supabase/Resend outage — must still return a clean JSON error,
  // never leak an internal stack trace or an empty body to the client.
  try {
    return await handleFeedback(request)
  } catch (err) {
    console.error('[feedback] unhandled error', err)
    Sentry.captureException(err)
    return errorResponse(500)
  }
}

async function handleFeedback(request: Request): Promise<NextResponse> {
  // Cheap size check before we even look at the body.
  const declaredLength = Number(request.headers.get('content-length') ?? '0')
  if (declaredLength > MAX_BODY_BYTES) {
    return errorResponse(413, 'הבקשה גדולה מדי.')
  }

  const rawBody = await request.text()
  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
    return errorResponse(413, 'הבקשה גדולה מדי.')
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return errorResponse(400, 'בקשה לא תקינה.')
  }

  if (typeof body !== 'object' || body === null) {
    return errorResponse(400, 'בקשה לא תקינה.')
  }

  const { message, honeypot, pageUrl, gameCode } = body as Record<string, unknown>

  // Honeypot: real users never see or fill this field. Bots that fill every
  // field get a fake success so they don't learn to avoid it.
  if (typeof honeypot === 'string' && honeypot.trim() !== '') {
    return NextResponse.json({ ok: true })
  }

  const cleanMessage = sanitizeMessage(message)
  if (!cleanMessage) {
    return errorResponse(400, `ההודעה חייבת להכיל טקסט, עד ${MAX_MESSAGE_LENGTH} תווים.`)
  }

  const resendApiKey = process.env.RESEND_API_KEY
  const toEmail = process.env.FEEDBACK_TO_EMAIL
  const fromEmail = process.env.FEEDBACK_FROM_EMAIL

  if (!resendApiKey || !toEmail || !fromEmail) {
    console.error('[feedback] missing RESEND_API_KEY, FEEDBACK_TO_EMAIL, or FEEDBACK_FROM_EMAIL')
    return errorResponse(500)
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const ipHash = createHash('sha256').update(ip).digest('hex')

  const supabase = await createServiceClient()
  const { data: allowed, error: rateLimitError } = await supabase.rpc('check_feedback_rate_limit', {
    p_ip_hash: ipHash,
    p_max: RATE_LIMIT_MAX,
    p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
  })

  if (rateLimitError) {
    console.error('[feedback] rate limit check failed', rateLimitError)
    Sentry.captureException(rateLimitError)
    return errorResponse(500)
  }

  if (!allowed) {
    return errorResponse(429, 'נשלחו יותר מדי הודעות. נסו שוב בעוד כמה דקות.')
  }

  const emailBody = buildFeedbackEmail({
    message: cleanMessage,
    pageUrl: sanitizeMetadata(pageUrl),
    gameCode: isValidGameCode(gameCode) ? gameCode.toUpperCase() : null,
    userAgent: sanitizeMetadata(request.headers.get('user-agent'), 200),
    timestamp: new Date().toISOString(),
  })

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: toEmail,
      subject: 'משוב חדש — שם קוד',
      text: emailBody,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('[feedback] Resend API error', res.status, detail)
    Sentry.captureException(new Error(`Resend API error: ${res.status}`))
    return errorResponse(502, 'שליחת ההודעה נכשלה. נסו שוב.')
  }

  return NextResponse.json({ ok: true })
}
