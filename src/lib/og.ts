import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const OG_W = 1200
export const OG_H = 630

// Satori lacks BiDi — reverse Hebrew strings so glyphs render in correct visual order.
export function rtl(s: string) {
  return [...s].reverse().join('')
}

export const CARD_BG: Record<string, string> = {
  red:  '#ef4444',
  blue: '#3b82f6',
  tan:  '#d4c5a0',
  dark: '#374151',
}

export async function loadFonts() {
  const [hebrew, latin] = await Promise.all([
    readFile(path.join(process.cwd(), 'public/fonts/Heebo-Bold.woff')),
    readFile(path.join(process.cwd(), 'public/fonts/Heebo-Bold-Latin.woff')),
  ])
  return [
    { name: 'Heebo', data: hebrew, weight: 800 as const, style: 'normal' as const },
    { name: 'Heebo', data: latin,  weight: 800 as const, style: 'normal' as const },
  ]
}
