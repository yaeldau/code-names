import type { Metadata } from 'next'
import { Heebo } from 'next/font/google'
import './globals.css'

const heebo = Heebo({
  subsets: ['hebrew'],
  variable: '--font-heebo',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'שם קוד | משחק Codenames בעברית',
    template: '%s | שם קוד',
  },
  description: 'משחק שם קוד בעברית — צרו משחק, שתפו קישור, ושחקו עם חברים בזמן אמת.',
  keywords: ['שם קוד', 'codenames', 'משחק מילים', 'משחק חברתי', 'עברית'],
  openGraph: {
    title: 'שם קוד | Codenames בעברית',
    description: 'משחק שם קוד בעברית — שחקו עם חברים בזמן אמת.',
    locale: 'he_IL',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="min-h-screen bg-gray-50 font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
