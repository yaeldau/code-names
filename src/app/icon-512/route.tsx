import { ImageResponse } from 'next/og'

// Dedicated 512x512 render for the manifest's maskable icon entry — icon.tsx
// only produces a 192x192 image, which isn't big enough to reuse here.
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0F172A',
          width: 512,
          height: 512,
          borderRadius: 112,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 48, width: 288, height: 288 }}>
          <div style={{ width: 112, height: 112, borderRadius: 32, background: '#E5484D' }} />
          <div style={{ width: 112, height: 112, borderRadius: 32, background: '#315BDE' }} />
          <div style={{ width: 112, height: 112, borderRadius: 32, background: '#315BDE' }} />
          <div style={{ width: 112, height: 112, borderRadius: 32, background: '#E5484D' }} />
        </div>
      </div>
    ),
    { width: 512, height: 512 }
  )
}
