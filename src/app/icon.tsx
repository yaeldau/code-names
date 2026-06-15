import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        background: '#0F172A',
        width: 32,
        height: 32,
        borderRadius: 7,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, width: 18, height: 18 }}>
        <div style={{ width: 7, height: 7, borderRadius: 2, background: '#E5484D' }} />
        <div style={{ width: 7, height: 7, borderRadius: 2, background: '#315BDE' }} />
        <div style={{ width: 7, height: 7, borderRadius: 2, background: '#315BDE' }} />
        <div style={{ width: 7, height: 7, borderRadius: 2, background: '#E5484D' }} />
      </div>
    </div>,
    { ...size }
  )
}
