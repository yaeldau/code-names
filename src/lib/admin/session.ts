/**
 * Signed, stateless admin session tokens.
 *
 * The cookie value is `${expiresAtEpochSeconds}.${hmacHex}`, where the HMAC is
 * computed over the expiry with ADMIN_SESSION_SECRET as the key. No session
 * store is needed — verification just recomputes the signature and checks the
 * expiry. Uses the Web Crypto API (not Node's `crypto` module) so this file
 * works unchanged from both Server Actions/Server Components (Node) and
 * middleware (Edge).
 */

export const ADMIN_SESSION_COOKIE = 'admin_session'

const SESSION_DURATION_SECONDS = 8 * 60 * 60 // 8 hours

async function getSigningKey(): Promise<CryptoKey> {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not configured')
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

// Returns a plain ArrayBuffer (rather than a Uint8Array view) so callers can
// hand it straight to crypto.subtle without generic-typed-array friction.
function fromHex(hex: string): ArrayBuffer | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes.buffer
}

/** Builds a fresh signed session value + the cookie maxAge (seconds) to pair it with. */
export async function createAdminSessionValue(): Promise<{ value: string; maxAge: number }> {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS
  const key = await getSigningKey()
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(expiresAt)))
  return { value: `${expiresAt}.${toHex(signature)}`, maxAge: SESSION_DURATION_SECONDS }
}

/**
 * Verifies a session cookie value. Never throws — any malformed, unsigned, or
 * expired value is simply treated as "not authenticated" (fail closed).
 */
export async function verifyAdminSession(cookieValue: string | undefined | null): Promise<boolean> {
  try {
    if (!cookieValue) return false

    const dotIndex = cookieValue.indexOf('.')
    if (dotIndex <= 0) return false
    const expiresAtRaw = cookieValue.slice(0, dotIndex)
    const signatureHex = cookieValue.slice(dotIndex + 1)

    const expiresAt = Number(expiresAtRaw)
    if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false

    const signatureBytes = fromHex(signatureHex)
    if (!signatureBytes) return false

    const key = await getSigningKey()
    return await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      new TextEncoder().encode(expiresAtRaw)
    )
  } catch {
    return false
  }
}

/** Constant-time string comparison — avoids a timing side-channel on the password check. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}