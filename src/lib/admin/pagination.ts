/**
 * Pure pagination math for the admin game history list — kept dependency-free
 * so it's testable without a live Supabase client or Next.js request scope.
 */

export const GAMES_PAGE_SIZE = 50

export interface Pagination {
  /** 1-indexed, already clamped into [1, totalPages]. */
  page: number
  /** Always >= 1, even when totalCount is 0 (so "page 1 of 1" renders, not "of 0"). */
  totalPages: number
  /** 0-indexed start row for `.range(offset, offset + limit - 1)`. */
  offset: number
  limit: number
}

/**
 * Resolves a raw `?page=` query-string value into a safe, clamped pagination
 * state for a given total row count. Never throws and never produces a
 * negative/out-of-range offset — a missing, non-numeric, zero, negative,
 * fractional, or too-large page value all silently clamp to the nearest
 * valid page rather than erroring. This matters because the total row count
 * is live production data that can legitimately change between the moment a
 * page link was rendered and the moment it's followed.
 */
export function resolvePagination(
  rawPage: string | undefined,
  totalCount: number,
  pageSize: number = GAMES_PAGE_SIZE
): Pagination {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  const parsed = Number(rawPage)
  const requestedPage = Number.isInteger(parsed) && parsed > 0 ? parsed : 1
  const page = Math.min(requestedPage, totalPages)

  return { page, totalPages, offset: (page - 1) * pageSize, limit: pageSize }
}
