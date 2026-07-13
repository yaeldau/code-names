import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'שם קוד — Codenames בעברית',
    short_name: 'שם קוד',
    description: 'משחק Codenames בעברית אונליין. ללא הרשמה, ללא תשלום.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F7F8FA',
    theme_color: '#0F172A',
    lang: 'he',
    dir: 'rtl',
    icons: [
      {
        src: '/icon',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
