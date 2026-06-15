import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const alt = 'שם קוד — Codenames בעברית'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Satori has no BiDi support — reverse Hebrew strings for correct visual glyph order.
function rtl(s: string) {
  return [...s].reverse().join('')
}

// 5×4 board sample (realistic colour distribution)
const BOARD = [
  ['red',   'red',   'blue',  'tan',   'red'  ],
  ['blue',  'tan',   'red',   'blue',  'blue' ],
  ['tan',   'red',   'black', 'blue',  'tan'  ],
  ['red',   'blue',  'tan',   'red',   'blue' ],
]

const CARD_BG: Record<string, string> = {
  red:   '#ef4444',
  blue:  '#3b82f6',
  tan:   '#c4a882',
  black: '#374151',
}

const CARD_BORDER: Record<string, string> = {
  red:   '#b91c1c',
  blue:  '#1d4ed8',
  tan:   '#8a7660',
  black: '#334155',
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
          flexDirection: 'column',
          background: '#f8fafc',
          fontFamily: 'Heebo, sans-serif',
          position: 'relative',
        }}
      >
        {/* Top gradient accent bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 5,
          background: 'linear-gradient(90deg, #ef4444 0%, #a855f7 50%, #3b82f6 100%)',
          display: 'flex',
        }} />

        {/* Main content row */}
        <div style={{ display: 'flex', flex: 1 }}>

          {/* Left panel — decorative game board */}
          <div
            style={{
              width: 430,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              paddingLeft: 56,
              paddingRight: 20,
            }}
          >
            {BOARD.map((row, r) => (
              <div key={r} style={{ display: 'flex', gap: 10 }}>
                {row.map((type, c) => (
                  <div
                    key={c}
                    style={{
                      width: 62,
                      height: 46,
                      borderRadius: 9,
                      background: CARD_BG[type],
                      border: `2px solid ${CARD_BORDER[type]}`,
                      boxShadow: `0 2px 8px rgba(0,0,0,0.15)`,
                      display: 'flex',
                    }}
                  />
                ))}
              </div>
            ))}

          </div>

          {/* Divider */}
          <div style={{
            width: 1,
            margin: '64px 0',
            background: '#e2e8f0',
            display: 'flex',
          }} />

          {/* Right panel — branding */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              justifyContent: 'center',
              paddingRight: 72,
              paddingLeft: 44,
              gap: 18,
            }}
          >
            {/* Red / blue accent stripes */}
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ width: 48, height: 5, borderRadius: 3, background: '#ef4444', display: 'flex' }} />
              <div style={{ width: 48, height: 5, borderRadius: 3, background: '#3b82f6', display: 'flex' }} />
            </div>

            {/* Main Hebrew title */}
            <div
              style={{
                fontSize: 118,
                fontWeight: 800,
                color: '#0f172a',
                lineHeight: 1,
                letterSpacing: '-2px',
              }}
            >
              {rtl('שם קוד')}
            </div>

            {/* Subtitle */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
              <div style={{ fontSize: 28, color: '#94a3b8', letterSpacing: 5 }}>CODENAMES</div>
              <div style={{ fontSize: 28, color: '#64748b' }}>{rtl('בעברית')}</div>
            </div>

            {/* Pills */}
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              {[rtl('ללא הרשמה'), rtl('זמן אמת'), rtl('חינמי')].map((tag) => (
                <div
                  key={tag}
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #e2e8f0',
                    borderRadius: 99,
                    paddingTop: 7, paddingBottom: 7,
                    paddingLeft: 18, paddingRight: 18,
                    fontSize: 20,
                    color: '#64748b',
                    display: 'flex',
                  }}
                >
                  {tag}
                </div>
              ))}
            </div>

            {/* Domain */}
            <div style={{ fontSize: 19, color: '#cbd5e1', marginTop: 8, letterSpacing: 1 }}>
              shemkod.com
            </div>
          </div>

        </div>

        {/* Bottom gradient bar */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg, #3b82f6 0%, #a855f7 50%, #ef4444 100%)',
          display: 'flex',
        }} />
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
