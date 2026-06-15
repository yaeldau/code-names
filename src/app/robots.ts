import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: '/game/', // individual game rooms are ephemeral, not worth indexing
    },
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://shemkod.com'}/sitemap.xml`,
  }
}
