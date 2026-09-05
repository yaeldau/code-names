import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// INTENTIONALLY UNSCHEDULED. This route deletes finished games after 1 hour
// and waiting/active games after 24 hours — a short-retention assumption we
// no longer hold. Game history is now a deliberate product feature (see the
// admin dashboard and CLAUDE.md), so this is no longer wired up to any Vercel
// Cron schedule (removed from vercel.json). The route itself is kept as-is
// for now rather than deleted, in case a *different*, deliberately-scoped
// cleanup policy is designed later — but nothing currently calls it, and it
// must not be rescheduled without first deciding what "safe to delete" means
// under the new retention model.
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Finished games older than 1 hour — cards and clues cascade automatically
  const { count: finished } = await supabase
    .from('games')
    .delete({ count: 'exact' })
    .eq('status', 'finished')
    .lt('created_at', oneHourAgo)

  // Abandoned games (never played or mid-game) older than 24 hours
  const { count: abandoned } = await supabase
    .from('games')
    .delete({ count: 'exact' })
    .in('status', ['waiting', 'active'])
    .lt('created_at', oneDayAgo)

  return NextResponse.json({ deleted: { finished: finished ?? 0, abandoned: abandoned ?? 0 } })
}
