import type { Metadata, Viewport } from 'next'
import { Heebo } from 'next/font/google'
import FeedbackWidget from '@/components/ui/FeedbackWidget'
import './globals.css'

const heebo = Heebo({
  subsets: ['hebrew'],
  variable: '--font-heebo',
  display: 'swap',
})

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://shemkod.com'

export const viewport: Viewport = {
  themeColor: '#0F172A',
}

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'שם קוד | משחק Codenames בעברית אונליין',
    template: '%s | שם קוד',
  },
  description:
    'משחק שם קוד בעברית אונליין — Codenames. צרו משחק תוך שנייה, שתפו קישור לחברים, ושחקו יחד בזמן אמת. ללא הרשמה, ללא תשלום.',
  keywords: [
    'שם קוד',
    'שם קוד אונליין',
    'codenames עברית',
    'codenames בעברית',
    'codenames אונליין',
    'משחק שם קוד',
    'משחק מרגלים',
    'משחק חברתי עברית',
    'משחק מילים עברית',
    'שם קוד חינם',
  ],
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    title: 'שם קוד — Codenames בעברית אונליין',
    description: 'משחק שם קוד בעברית אונליין. ללא הרשמה, ללא תשלום — שתפו קישור ושחקו עם חברים.',
    url: siteUrl,
    siteName: 'שם קוד',
    locale: 'he_IL',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'שם קוד — Codenames בעברית אונליין',
    description: 'משחק שם קוד בעברית אונליין. ללא הרשמה, ללא תשלום.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <head>
        {/* Preload font subsets not covered by Next.js's automatic preload (Hebrew is covered, these are not) */}
        <link rel="preload" href="/_next/static/media/ec516af01d950ed6-s.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/_next/static/media/70b9b96e99f02a56-s.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://o4511579698626560.ingest.de.sentry.io" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen bg-bg font-sans antialiased">
        {children}
        <FeedbackWidget />
      </body>
    </html>
  )
}
