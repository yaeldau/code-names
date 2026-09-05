import { describe, it, expect } from 'vitest'
import { resolvePagination, GAMES_PAGE_SIZE } from '../admin/pagination'

describe('resolvePagination', () => {
  it('defaults to page 1 when no page param is given', () => {
    expect(resolvePagination(undefined, 1831, 50)).toEqual({ page: 1, totalPages: 37, offset: 0, limit: 50 })
  })

  it('computes offset and totalPages for a normal middle page', () => {
    expect(resolvePagination('2', 1831, 50)).toEqual({ page: 2, totalPages: 37, offset: 50, limit: 50 })
  })

  it('computes the correct last page with a partial final page', () => {
    // 1831 / 50 = 36.62 -> 37 pages, last page holds 31 games
    const result = resolvePagination('37', 1831, 50)
    expect(result.page).toBe(37)
    expect(result.totalPages).toBe(37)
    expect(result.offset).toBe(1800)
  })

  it('clamps a page beyond the last page down to the last page', () => {
    expect(resolvePagination('999', 1831, 50)).toEqual({ page: 37, totalPages: 37, offset: 1800, limit: 50 })
  })

  describe('invalid page values all fall back to page 1', () => {
    it.each([['abc'], ['0'], ['-5'], ['2.5'], [''], [' '], ['NaN'], ['Infinity']])('rawPage=%s', (raw) => {
      const result = resolvePagination(raw, 1831, 50)
      expect(result.page).toBe(1)
      expect(result.offset).toBe(0)
    })
  })

  it('always returns totalPages >= 1 even with zero games (no divide-by-zero "page 1 of 0")', () => {
    const result = resolvePagination(undefined, 0, 50)
    expect(result).toEqual({ page: 1, totalPages: 1, offset: 0, limit: 50 })
  })

  it('clamps to page 1 when there are zero games and an out-of-range page was requested', () => {
    const result = resolvePagination('5', 0, 50)
    expect(result.page).toBe(1)
    expect(result.totalPages).toBe(1)
  })

  it('handles exactly one full page with no remainder', () => {
    const result = resolvePagination('1', 100, 50)
    expect(result.totalPages).toBe(2)
    expect(result.offset).toBe(0)
  })

  it('uses the exported default page size when none is passed explicitly', () => {
    expect(GAMES_PAGE_SIZE).toBe(50)
    const result = resolvePagination('1', 1831)
    expect(result.limit).toBe(50)
  })
})
