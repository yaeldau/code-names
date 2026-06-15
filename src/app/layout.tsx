import type { Metadata } from 'next'
import { Heebo } from 'next/font/google'
import './globals.css'

const heebo = Heebo({
  subsets: ['hebrew'],
  variable: '--font-heebo',
  display: 'swap',
})

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://shemkod.com'

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
      <body className="min-h-screen bg-gray-50 font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
