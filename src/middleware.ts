import { NextResponse, type NextRequest } from 'next/server'
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from '@/lib/admin/session'

// Gates every /admin/* route server-side (not just hidden navigation). The
// login page itself is excluded so there's somewhere to redirect to.
export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/admin/login') {
    return NextResponse.next()
  }

  const cookie = request.cookies.get(ADMIN_SESSION_COOKIE)?.value
  const authenticated = await verifyAdminSession(cookie)

  if (!authenticated) {
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
