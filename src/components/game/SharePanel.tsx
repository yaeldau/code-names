'use client'

import { useState } from 'react'
import type { Game } from '@/types/game'

function CopyRow({ label, url, colorClass }: { label: string; url: string; colorClass?: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`text-sm font-medium ${colorClass ?? 'text-gray-700'}`}>{label}</span>
      <button
        onClick={handleCopy}
        className="shrink-0 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors"
      >
        {copied ? '✓ הועתק' : 'העתק'}
      </button>
    </div>
  )
}

export default function SharePanel({ game }: { game: Game }) {
  const [open, setOpen] = useState(false)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
      >
        <span>שיתוף קישורים</span>
        <span className="text-xs text-gray-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 py-3 flex flex-col gap-3">
          <CopyRow label="שחקנים" url={`${origin}/game/${game.code}`} />
          <CopyRow
            label="מרגלים"
            url={`${origin}/game/${game.code}?spymaster=${game.spymaster_token}`}
            colorClass="text-purple-700"
          />
        </div>
      )}
    </div>
  )
}
