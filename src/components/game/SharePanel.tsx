'use client'

import { useState } from 'react'
import type { Game } from '@/types/game'

function CopyButton({ label, url, className }: { label: string; url: string; className: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button onClick={handleCopy} className={className}>
      {copied ? `✓ הועתק` : `העתק ${label}`}
    </button>
  )
}

export default function SharePanel({ game }: { game: Game }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div className="flex gap-2">
      <CopyButton
        label="קישור שחקנים"
        url={`${origin}/game/${game.code}`}
        className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
      />
      <CopyButton
        label="קישור מרגלים"
        url={`${origin}/game/${game.code}?spymaster=${game.spymaster_token}`}
        className="flex-1 rounded-xl border border-purple-200 bg-purple-50 py-3 text-sm font-medium text-purple-700 hover:bg-purple-100 transition-colors"
      />
    </div>
  )
}
