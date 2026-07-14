import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { getDeck, listDecks, sampleDeck, imagePathFor } from '../registry'
import { wordsClassic } from '../words/classic'
import { picturesClassic } from '../pictures/classic'

// ─── getDeck ────────────────────────────────────────────────────────────────

describe('getDeck', () => {
  it('returns the classic words deck', () => {
    expect(getDeck('words', 'classic')).toBe(wordsClassic)
  })

  it('returns the classic pictures deck', () => {
    expect(getDeck('pictures', 'classic')).toBe(picturesClassic)
  })

  it('falls back to the default theme when no theme is given', () => {
    expect(getDeck('words')).toBe(wordsClassic)
  })

  it('falls back to the default theme for an unknown theme', () => {
    expect(getDeck('pictures', 'does-not-exist')).toBe(picturesClassic)
  })
})

// ─── listDecks ──────────────────────────────────────────────────────────────

describe('listDecks', () => {
  it('lists every deck for a mode', () => {
    expect(listDecks('words')).toContain(wordsClassic)
    expect(listDecks('pictures')).toContain(picturesClassic)
  })
})

// ─── sampleDeck ─────────────────────────────────────────────────────────────

describe('sampleDeck', () => {
  it('returns exactly 25 cards by default', () => {
    expect(sampleDeck(wordsClassic)).toHaveLength(25)
  })

  it('returns no duplicate cards', () => {
    const selected = sampleDeck(picturesClassic)
    expect(new Set(selected.map((c) => c.label)).size).toBe(25)
  })

  it('every sampled card comes from the deck', () => {
    const bank = new Set(wordsClassic.cards.map((c) => c.label))
    expect(sampleDeck(wordsClassic).every((c) => bank.has(c.label))).toBe(true)
  })
})

// ─── imagePathFor ───────────────────────────────────────────────────────────

describe('imagePathFor', () => {
  it('builds a path under the theme folder', () => {
    expect(imagePathFor('classic', 'dog')).toBe('/decks/pictures/classic/dog.svg')
  })
})

// ─── Deck content integrity ─────────────────────────────────────────────────

describe('wordsClassic deck', () => {
  it('has no imageKey on any card', () => {
    expect(wordsClassic.cards.every((c) => !c.imageKey)).toBe(true)
  })

  it('is large enough to fill a board with no repeats', () => {
    expect(wordsClassic.cards.length).toBeGreaterThanOrEqual(25)
  })

  it('has no duplicate labels', () => {
    const labels = wordsClassic.cards.map((c) => c.label)
    expect(new Set(labels).size).toBe(labels.length)
  })
})

describe('picturesClassic deck', () => {
  it('is large enough to fill a board with no repeats', () => {
    expect(picturesClassic.cards.length).toBeGreaterThanOrEqual(25)
  })

  it('has no duplicate image keys', () => {
    const keys = picturesClassic.cards.map((c) => c.imageKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('every card has a corresponding local SVG asset on disk', () => {
    for (const card of picturesClassic.cards) {
      const path = join(process.cwd(), 'public', imagePathFor(picturesClassic.theme, card.imageKey!))
      expect(existsSync(path), `missing asset for ${card.imageKey}`).toBe(true)
    }
  })
})
