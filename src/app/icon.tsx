import { ImageResponse } from 'next/og'

export const size = { width: 192, height: 192 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        background: '#0F172A',
        width: 192,
        height: 192,
        borderRadius: 42,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, width: 108, height: 108 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: '#E5484D' }} />
        <div style={{ width: 42, height: 42, borderRadius: 12, background: '#315BDE' }} />
        <div style={{ width: 42, height: 42, borderRadius: 12, background: '#315BDE' }} />
        <div style={{ width: 42, height: 42, borderRadius: 12, background: '#E5484D' }} />
      </div>
    </div>,
    { ...size }
  )
}
