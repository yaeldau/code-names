// Lazy-load Sentry after the page is interactive so it doesn't block the initial LCP paint.
// Errors captured during the first ~1s before Sentry loads are lost, which is an acceptable tradeoff.

// Set once Sentry finishes loading, so onRouterTransitionStart below can forward to it.
// Navigations that happen before that (rare, since we only defer ~1s) are simply not captured.
let sentryClient: typeof import('@sentry/nextjs') | null = null

if (typeof window !== 'undefined') {
  const initSentry = () => {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return
    import('@sentry/nextjs').then((Sentry) => {
      sentryClient = Sentry
      Sentry.init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        tracesSampleRate: 0.1,
        debug: false,
      })
    })
  }

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(initSentry, { timeout: 2000 })
  } else {
    setTimeout(initSentry, 100)
  }
}

export function onRouterTransitionStart(href: string, navigationType: string) {
  sentryClient?.captureRouterTransitionStart(href, navigationType)
}
