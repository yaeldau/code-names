import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

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
