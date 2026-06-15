import { ImageResponse } from 'next/og'
import { rtl, CARD_BG, loadFonts, OG_W, OG_H } from '@/lib/og'

// Version C — full 5×5 board (all 25 cards) + compact bottom strip

// Authentic Codenames distribution: R:9 B:8 T:7 D:1
const BOARD = [
  ['red',  'red',  'blue', 'tan',  'red' ],
  ['blue', 'tan',  'red',  'blue', 'blue'],
  ['tan',  'red',  'dark', 'blue', 'tan' ],
  ['red',  'blue', 'tan',  'red',  'blue'],
  ['red',  'red',  'tan',  'blue', 'tan' ],
]

const BOARD_H = 480
const STRIP_H = OG_H - BOARD_H  // 150px
const GAP = 7

export async function GET() {
  const fonts = await loadFonts()

  return new ImageResponse(
    (
      <div style={{
        width: OG_W, height: OG_H,
        display: 'flex', flexDirection: 'column',
        fontFamily: 'Heebo, sans-serif',
        background: '#ffffff',
      }}>

        {/* ── Full 5×5 board — fills top ── */}
        <div style={{
          height: BOARD_H,
          display: 'flex', flexDirection: 'column',
          gap: GAP,
        }}>
          {BOARD.map((row, r) => (
            <div key={r} style={{ display: 'flex', flex: 1, gap: GAP }}>
              {row.map((color, c) => (
                <div key={c} style={{
                  flex: 1,
                  background: CARD_BG[color],
                  borderRadius: 8,
                  boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.16)',
                  display: 'flex',
                }} />
              ))}
            </div>
          ))}
        </div>

        {/* ── Bottom strip ── */}
        <div style={{
          height: STRIP_H,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 48px',
          background: '#0f172a',
          borderTop: '4px solid #1e3a5f',
        }}>
          {/* Title */}
          <div style={{
            fontSize: 72,
            fontWeight: 800,
            color: '#f8fafc',
            lineHeight: 1,
          }}>
            {rtl('שם קוד')}
          </div>

          {/* Right: subtitle + marketing */}
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'flex-end', gap: 6,
          }}>
            <div style={{ display: 'flex', gap: 10, fontSize: 24, color: '#94a3b8', alignItems: 'center' }}>
              <span>Codenames</span>
              <span style={{ color: '#334155' }}>·</span>
              <span>{rtl('בעברית אונליין')}</span>
            </div>
            <div style={{ fontSize: 18, color: '#475569' }}>
              {rtl('משחק חברתי מהיר, חינם וללא הרשמה')}
            </div>
          </div>
        </div>

      </div>
    ),
    { width: OG_W, height: OG_H, fonts }
  )
}
