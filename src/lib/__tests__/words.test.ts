import { describe, it, expect } from 'vitest'
import { shuffle, buildCardTypes, sampleWords } from '../words'
import wordBank from '@/words/hebrew.json'

// ─── shuffle ──────────────────────────────────────────────────────────────────

describe('shuffle', () => {
  it('returns the same number of elements', () => {
    const arr = [1, 2, 3, 4, 5]
    expect(shuffle(arr)).toHaveLength(arr.length)
  })

  it('contains exactly the same elements', () => {
    const arr = ['א', 'ב', 'ג', 'ד', 'ה']
    expect(shuffle(arr).sort()).toEqual([...arr].sort())
  })

  it('does not mutate the original array', () => {
    const arr = [1, 2, 3]
    const copy = [...arr]
    shuffle(arr)
    expect(arr).toEqual(copy)
  })

  it('produces a different order at least sometimes (statistical)', () => {
    // Run 10 shuffles of a 10-element array; at least one should differ
    const arr = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    const results = Array.from({ length: 10 }, () => shuffle(arr).join(','))
    const original = arr.join(',')
    expect(results.some((r) => r !== original)).toBe(true)
  })
})

// ─── buildCardTypes ───────────────────────────────────────────────────────────

describe('buildCardTypes', () => {
  it('returns exactly 25 types', () => {
    expect(buildCardTypes()).toHaveLength(25)
  })

  it('contains exactly 9 red cards', () => {
    expect(buildCardTypes().filter((t) => t === 'red')).toHaveLength(9)
  })

  it('contains exactly 8 blue cards', () => {
    expect(buildCardTypes().filter((t) => t === 'blue')).toHaveLength(8)
  })

  it('contains exactly 7 neutral cards', () => {
    expect(buildCardTypes().filter((t) => t === 'neutral')).toHaveLength(7)
  })

  it('contains exactly 1 assassin', () => {
    expect(buildCardTypes().filter((t) => t === 'assassin')).toHaveLength(1)
  })

  it('contains no unknown types', () => {
    const valid = new Set(['red', 'blue', 'neutral', 'assassin'])
    expect(buildCardTypes().every((t) => valid.has(t))).toBe(true)
  })
})

// ─── sampleWords ──────────────────────────────────────────────────────────────

describe('sampleWords', () => {
  const bank = wordBank as string[]

  it('returns exactly 25 words', () => {
    expect(sampleWords(bank)).toHaveLength(25)
  })

  it('every word comes from the word bank', () => {
    const bankSet = new Set(bank)
    expect(sampleWords(bank).every((w) => bankSet.has(w))).toBe(true)
  })

  it('returns no duplicate words', () => {
    const selected = sampleWords(bank)
    expect(new Set(selected).size).toBe(25)
  })

  it('word bank itself has no duplicates', () => {
    expect(new Set(bank).size).toBe(bank.length)
  })

  it('word bank is large enough to fill a board', () => {
    expect(bank.length).toBeGreaterThanOrEqual(25)
  })
})
