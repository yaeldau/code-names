import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'שם קוד — Codenames בעברית'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#111827',
          gap: 24,
        }}
      >
        {/* Team colour dots */}
        <div style={{ display: 'flex', gap: 16 }}>
          {['#dc2626', '#dc2626', '#dc2626', '#1d4ed8', '#1d4ed8', '#1d4ed8'].map((c, i) => (
            <div
              key={i}
              style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: c, opacity: 0.8 }}
            />
          ))}
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 96,
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: '-2px',
          }}
        >
          שם קוד
        </div>

        {/* Subtitle */}
        <div style={{ fontSize: 36, color: '#9ca3af' }}>
          Codenames בעברית — שחקו עם חברים בזמן אמת
        </div>

        {/* Bottom pill */}
        <div
          style={{
            marginTop: 16,
            backgroundColor: '#1f2937',
            borderRadius: 99,
            paddingTop: 12,
            paddingBottom: 12,
            paddingLeft: 32,
            paddingRight: 32,
            fontSize: 26,
            color: '#d1d5db',
          }}
        >
          משחק חינמי · ללא הרשמה · מולטיפלייר
        </div>
      </div>
    ),
    { ...size }
  )
}
