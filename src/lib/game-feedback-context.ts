'use client'

import type { GameFeedbackContext } from './feedback'

// A plain module-level singleton, not a React context — FeedbackWidget lives
// outside the game page's component tree (mounted once in the root layout),
// so there's no ancestor to provide a context through. GameBoard pushes a
// snapshot here whenever its state changes; FeedbackWidget only pulls it at
// submit time, so no reactivity/subscription is needed.
let current: GameFeedbackContext | null = null

export function setGameFeedbackContext(ctx: GameFeedbackContext | null) {
  current = ctx
}

export function getGameFeedbackContext(): GameFeedbackContext | null {
  return current
}
