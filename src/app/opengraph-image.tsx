import { ImageResponse } from 'next/og'
import { rtl, CARD_BG, loadFonts, OG_W, OG_H } from '@/lib/og'

export const alt = 'שם קוד — Codenames בעברית אונליין'
export const size = { width: OG_W, height: OG_H }
export const contentType = 'image/png'

// 5×4 = 20 cards  (R:8 B:7 T:4 D:1)
const BOARD = [
  ['red',  'blue', 'red',  'tan',  'red' ],
  ['blue', 'red',  'blue', 'red',  'blue'],
  ['red',  'tan',  'dark', 'blue', 'red' ],
  ['blue', 'red',  'tan',  'blue', 'tan' ],
]

// Card area: 410px, text area: 220px, total 630px
const CARD_AREA_H = 410
const TEXT_AREA_H = OG_H - CARD_AREA_H  // 220px
const GAP = 8

export default async function OgImage() {
  const fonts = await loadFonts()

  return new ImageResponse(
    (
      <div style={{
        width: OG_W, height: OG_H,
        display: 'flex', flexDirection: 'column',
        fontFamily: 'Heebo, sans-serif',
        background: '#ffffff',
      }}>

        {/* ── Card grid — full bleed, no outer padding ── */}
        <div style={{
          height: CARD_AREA_H,
          display: 'flex', flexDirection: 'column',
          gap: GAP,
        }}>
          {BOARD.map((row, r) => (
            <div key={r} style={{ display: 'flex', flex: 1, gap: GAP }}>
              {row.map((color, c) => (
                <div key={c} style={{
                  flex: 1,
                  background: CARD_BG[color],
                  borderRadius: 10,
                  boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.18)',
                  display: 'flex',
                }} />
              ))}
            </div>
          ))}
        </div>

        {/* ── Text section ── */}
        <div style={{
          height: TEXT_AREA_H,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
        }}>
          {/* Title */}
          <div style={{
            fontSize: 86,
            fontWeight: 800,
            color: '#0f172a',
            lineHeight: 1,
          }}>
            {rtl('שם קוד')}
          </div>

          {/* Subtitle row */}
          <div style={{
            display: 'flex', gap: 14,
            alignItems: 'center',
            fontSize: 26, color: '#64748b',
          }}>
            <span>Codenames</span>
            <span style={{ color: '#cbd5e1', fontSize: 20 }}>·</span>
            <span>{rtl('בעברית אונליין')}</span>
          </div>

          {/* Marketing line */}
          <div style={{ fontSize: 19, color: '#94a3b8', marginTop: 2 }}>
            {rtl('משחק חברתי מהיר, חינם וללא הרשמה')}
          </div>
        </div>

      </div>
    ),
    { width: OG_W, height: OG_H, fonts }
  )
}
