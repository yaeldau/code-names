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
      {copied ? `✓ הועתק` : label}
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
        className="flex-1 rounded-xl border border-border bg-surface py-3 text-sm font-medium text-ink-soft hover:bg-bg transition-colors"
      />
      <CopyButton
        label="קישור מרגלים"
        url={`${origin}/game/${game.code}?spymaster=${game.spymaster_token}`}
        className="flex-1 rounded-xl bg-navy py-3 text-sm font-semibold text-white hover:opacity-85 transition-opacity"
      />
    </div>
  )
}
