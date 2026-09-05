import { describe, it, expect } from 'vitest'
import { chunkArray, mergeCountsByGame, lookupCount, GAME_ID_CHUNK_SIZE } from '../admin/aggregate'

describe('chunkArray', () => {
  it('splits into chunks of the given size', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('returns a single chunk when smaller than the size', () => {
    expect(chunkArray([1, 2], 10)).toEqual([[1, 2]])
  })

  it('returns no chunks for an empty array', () => {
    expect(chunkArray([], 10)).toEqual([])
  })

  it('exports a chunk size well under typical URL-length limits for UUID lists', () => {
    // 36-char UUID + 1 separator per id — this is the exact shape that
    // caused the production bug (a 1000-game .in() list => ~37,000 chars).
    expect(GAME_ID_CHUNK_SIZE * 37).toBeLessThan(8000)
  })
})

describe('mergeCountsByGame', () => {
  it('counts rows per game_id, defaulting untouched games in a successful chunk to 0', () => {
    // This is the historical-game regression case: a game with real clue
    // history must come back with its true count, not 0.
    const result = mergeCountsByGame([
      {
        gameIds: ['game-with-clues', 'game-with-none'],
        rows: [
          { game_id: 'game-with-clues' },
          { game_id: 'game-with-clues' },
          { game_id: 'game-with-clues' },
        ],
      },
    ])

    expect(result.counts.get('game-with-clues')).toBe(3)
    expect(result.counts.get('game-with-none')).toBe(0)
    expect(result.failedGameIds.size).toBe(0)
  })

  it('marks every game in a failed chunk as failed, not zero', () => {
    const result = mergeCountsByGame([{ gameIds: ['a', 'b'], rows: null }])

    expect(result.counts.has('a')).toBe(false)
    expect(result.counts.has('b')).toBe(false)
    expect(result.failedGameIds.has('a')).toBe(true)
    expect(result.failedGameIds.has('b')).toBe(true)
  })

  it('handles a mix of successful and failed chunks independently', () => {
    const result = mergeCountsByGame([
      { gameIds: ['ok-game'], rows: [{ game_id: 'ok-game' }, { game_id: 'ok-game' }] },
      { gameIds: ['broken-game'], rows: null },
    ])

    expect(result.counts.get('ok-game')).toBe(2)
    expect(result.failedGameIds.has('broken-game')).toBe(true)
    expect(result.counts.has('broken-game')).toBe(false)
  })

  it('reproduces the reported bug shape: a large id list split across many chunks still finds the right game', () => {
    // Simulates ~1000 retained games, one of which (in the middle somewhere)
    // has 7 real clues — the exact B8Z3DT scenario.
    const gameIds = Array.from({ length: 1000 }, (_, i) => `game-${i}`)
    const chunks = []
    for (let i = 0; i < gameIds.length; i += 150) chunks.push(gameIds.slice(i, i + 150))

    const targetGame = 'game-537'
    const chunkResults = chunks.map((ids) => ({
      gameIds: ids,
      rows: ids.includes(targetGame)
        ? Array.from({ length: 7 }, () => ({ game_id: targetGame }))
        : [],
    }))

    const result = mergeCountsByGame(chunkResults)
    expect(result.counts.get(targetGame)).toBe(7)
    expect(result.failedGameIds.size).toBe(0)
  })
})

describe('lookupCount', () => {
  it('returns the real count for a successful game', () => {
    const result = mergeCountsByGame([{ gameIds: ['g1'], rows: [{ game_id: 'g1' }] }])
    expect(lookupCount('g1', result)).toBe(1)
  })

  it('returns null (unknown) for a game whose chunk failed, never 0', () => {
    const result = mergeCountsByGame([{ gameIds: ['g1'], rows: null }])
    expect(lookupCount('g1', result)).toBeNull()
  })

  it('returns 0 for a game whose chunk succeeded but had no matching rows', () => {
    const result = mergeCountsByGame([{ gameIds: ['g1', 'g2'], rows: [{ game_id: 'g2' }] }])
    expect(lookupCount('g1', result)).toBe(0)
  })
})
