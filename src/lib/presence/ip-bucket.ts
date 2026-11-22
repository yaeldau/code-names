/**
 * Rate-limit bucket for presence (D1/E1): a keyed, daily-rotating hash of the
 * client IP. It is used ONLY to bound how many new tab ids one network can
 * create per 10 minutes, is stored at most 1 hour, and can't be reversed or
 * linked across days without the server secret. Raw IPs are never stored.
 *
 * Key: PRESENCE_SECRET, or — so no new production secret is required — a key
 * derived from ADMIN_SESSION_SECRET with domain separation. Web Crypto only.
 */

function secretMaterial(): string | null {
  const dedicated = process.env.PRESENCE_SECRET
  if (dedicated) return `presence-ip-bucket:v1:${dedicated}`
  const admin = process.env.ADMIN_SESSION_SECRET
  if (admin) return `presence-ip-bucket:v1:derived:${admin}`
  return null
}

export function presenceSecretConfigured(): boolean {
  return secretMaterial() !== null
}

/** UTC calendar day, so the same IP maps to unrelated buckets on different days. */
export function bucketDay(now: Date): string {
  return now.toISOString().slice(0, 10)
}

export async function ipBucket(ip: string, now: Date = new Date()): Promise<string | null> {
  const material = secretMaterial()
  if (!material) return null
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(material), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${bucketDay(now)}|${ip}`))
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('')
}
