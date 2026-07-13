import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        background: '#0F172A',
        width: 180,
        height: 180,
        borderRadius: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 17, width: 101, height: 101 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: '#E5484D' }} />
        <div style={{ width: 42, height: 42, borderRadius: 12, background: '#315BDE' }} />
        <div style={{ width: 42, height: 42, borderRadius: 12, background: '#315BDE' }} />
        <div style={{ width: 42, height: 42, borderRadius: 12, background: '#E5484D' }} />
      </div>
    </div>,
    { ...size }
  )
}
