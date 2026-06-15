import { ImageResponse } from 'next/og'
import { rtl, CARD_BG, loadFonts, OG_W, OG_H } from '@/lib/og'

// Version B — high-contrast split: dark board left / white text right

// 4×3 board in the left panel
const BOARD = [
  ['red',  'blue', 'red',  'tan' ],
  ['blue', 'red',  'dark', 'blue'],
  ['tan',  'red',  'blue', 'tan' ],
]

const LEFT_W = 430

export async function GET() {
  const fonts = await loadFonts()

  return new ImageResponse(
    (
      <div style={{
        width: OG_W, height: OG_H,
        display: 'flex',
        fontFamily: 'Heebo, sans-serif',
      }}>

        {/* ── Left: dark board panel ── */}
        <div style={{
          width: LEFT_W,
          background: '#0f172a',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: '0 32px',
        }}>
          {BOARD.map((row, r) => (
            <div key={r} style={{ display: 'flex', gap: 10 }}>
              {row.map((color, c) => (
                <div key={c} style={{
                  width: 82, height: 60,
                  background: CARD_BG[color],
                  borderRadius: 10,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                  display: 'flex',
                }} />
              ))}
            </div>
          ))}

          {/* "Play" label */}
          <div style={{
            marginTop: 20,
            fontSize: 16, color: '#334155',
            letterSpacing: 3,
          }}>
            shemkod.com
          </div>
        </div>

        {/* ── Right: white text panel ── */}
        <div style={{
          flex: 1,
          background: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 64px',
          gap: 14,
          borderLeft: '1px solid #e2e8f0',
        }}>
          {/* Accent dots */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#ef4444', display: 'flex' }} />
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#3b82f6', display: 'flex' }} />
          </div>

          {/* Title */}
          <div style={{
            fontSize: 104,
            fontWeight: 800,
            color: '#0f172a',
            lineHeight: 1,
            letterSpacing: '-2px',
          }}>
            {rtl('שם קוד')}
          </div>

          {/* Subtitle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 28, color: '#64748b' }}>
            <span>Codenames</span>
            <span style={{ color: '#e2e8f0' }}>|</span>
            <span>{rtl('בעברית אונליין')}</span>
          </div>

          {/* Marketing */}
          <div style={{ fontSize: 20, color: '#94a3b8', marginTop: 4 }}>
            {rtl('משחק חברתי מהיר, חינם וללא הרשמה')}
          </div>
        </div>

      </div>
    ),
    { width: OG_W, height: OG_H, fonts }
  )
}
