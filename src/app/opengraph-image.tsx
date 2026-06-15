import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const alt = 'שם קוד — Codenames בעברית'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Representative 5×5 game board
const BOARD: ('red' | 'blue' | 'neu' | 'black')[][] = [
  ['red',   'red',   'neu',   'blue',  'red'  ],
  ['blue',  'neu',   'red',   'blue',  'red'  ],
  ['red',   'blue',  'black', 'neu',   'blue' ],
  ['blue',  'neu',   'red',   'red',   'blue' ],
  ['neu',   'blue',  'red',   'neu',   'blue' ],
]

const CARD_BG: Record<string, string> = {
  red:   '#b91c1c',
  blue:  '#1d4ed8',
  neu:   '#57534e',
  black: '#080706',
}

export default async function OgImage() {
  const [heeboHebrew, heeboLatin] = await Promise.all([
    readFile(path.join(process.cwd(), 'public/fonts/Heebo-Bold.woff')),
    readFile(path.join(process.cwd(), 'public/fonts/Heebo-Bold-Latin.woff')),
  ])

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#0f172a',
          fontFamily: 'Heebo, sans-serif',
        }}
      >
        {/* Left panel — decorative game board */}
        <div
          style={{
            width: 400,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingLeft: 52,
          }}
        >
          {BOARD.map((row, r) => (
            <div key={r} style={{ display: 'flex', gap: 8 }}>
              {row.map((type, c) => (
                <div
                  key={c}
                  style={{
                    width: 60,
                    height: 44,
                    borderRadius: 7,
                    background: CARD_BG[type],
                    border: '1px solid rgba(255,255,255,0.07)',
                  }}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Divider */}
        <div
          style={{
            width: 1,
            margin: '60px 0',
            background: 'rgba(255,255,255,0.1)',
          }}
        />

        {/* Right panel — title */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            justifyContent: 'center',
            paddingRight: 72,
            paddingLeft: 40,
            gap: 20,
          }}
        >
          {/* Team colour accents */}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ width: 56, height: 6, borderRadius: 3, background: '#dc2626' }} />
            <div style={{ width: 56, height: 6, borderRadius: 3, background: '#2563eb' }} />
          </div>

          {/* Main title */}
          <div
            style={{
              fontSize: 112,
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: 1,
              letterSpacing: '-2px',
              direction: 'rtl',
              textAlign: 'right',
            }}
          >
            שם קוד
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: 30,
              color: '#94a3b8',
              direction: 'rtl',
              textAlign: 'right',
              lineHeight: 1.4,
            }}
          >
            Codenames בעברית אונליין
          </div>

          {/* Feature pills */}
          <div style={{ display: 'flex', gap: 10, direction: 'rtl' }}>
            {['חינמי', 'ללא הרשמה', 'זמן אמת'].map((tag) => (
              <div
                key={tag}
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 99,
                  paddingTop: 8,
                  paddingBottom: 8,
                  paddingLeft: 20,
                  paddingRight: 20,
                  fontSize: 20,
                  color: '#64748b',
                }}
              >
                {tag}
              </div>
            ))}
          </div>

          {/* Domain */}
          <div style={{ fontSize: 20, color: '#334155', marginTop: 4 }}>
            shemkod.com
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Heebo', data: heeboHebrew, weight: 800, style: 'normal' },
        { name: 'Heebo', data: heeboLatin,  weight: 800, style: 'normal' },
      ],
    }
  )
}
