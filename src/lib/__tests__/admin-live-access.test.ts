import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware, config } from '@/middleware'
import { ADMIN_SESSION_COOKIE, createAdminSessionValue } from '@/lib/admin/session'

// The live dashboard (/admin/live) is protected by the same middleware as the
// rest of /admin — verified here against the real middleware function.
describe('/admin/live access control', () => {
  const saved = process.env.ADMIN_SESSION_SECRET
  beforeAll(() => { process.env.ADMIN_SESSION_SECRET = 'unit-test-admin-secret' })
  afterAll(() => { process.env.ADMIN_SESSION_SECRET = saved })

  it('the matcher covers /admin/live', () => {
    expect(config.matcher).toContain('/admin/:path*')
  })

  it('no session → redirect to the login page', async () => {
    const res = await middleware(new NextRequest('http://localhost/admin/live'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/admin/login')
  })

  it('forged / expired session → redirect', async () => {
    for (const value of ['9999999999.deadbeef', `${Math.floor(Date.now() / 1000) - 10}.${'0'.repeat(64)}`]) {
      const req = new NextRequest('http://localhost/admin/live', { headers: { cookie: `${ADMIN_SESSION_COOKIE}=${value}` } })
      expect((await middleware(req)).headers.get('location')).toBe('http://localhost/admin/login')
    }
  })

  it('valid admin session → allowed through', async () => {
    const { value } = await createAdminSessionValue()
    const req = new NextRequest('http://localhost/admin/live', { headers: { cookie: `${ADMIN_SESSION_COOKIE}=${value}` } })
    const res = await middleware(req)
    expect(res.headers.get('location')).toBeNull()
    expect(res.headers.get('x-middleware-next')).toBe('1')
  })
})
