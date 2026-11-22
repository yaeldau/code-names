import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import AdminHeader from '@/components/admin/AdminHeader'
import AutoRefresh from '@/components/admin/AutoRefresh'
import GameStatusBadge from '@/components/admin/GameStatusBadge'
import { getLiveSnapshot } from '@/lib/admin/live'

// Protected by middleware.ts (/admin/:path*). Always rendered fresh.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'פעילות חיה',
  robots: { index: false, follow: false },
}

const TEAM_LABEL: Record<string, string> = { red: 'אדום', blue: 'כחול' }

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('he-IL', { timeStyle: 'medium', timeZone: 'Asia/Jerusalem' })
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 text-center">
      <div className="text-2xl font-bold text-navy tabular-nums">{value}</div>
      <div className="text-xs text-ink-soft">{label}</div>
      {hint && <div className="mt-0.5 text-[11px] text-ink-faint">{hint}</div>}
    </div>
  )
}

export default async function AdminLivePage() {
  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const result = await getLiveSnapshot(service)

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <AdminHeader title="פעילות חיה" backHref="/admin" />

        {result.state === 'unavailable' && (
          <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-ink-soft">
            מעקב הנוכחות עדיין לא הופעל בסביבה הזו (המיגרציה לא הוחלה).
          </p>
        )}

        {result.state === 'error' && (
          <p role="alert" className="rounded-2xl border border-game-red/30 bg-game-red-tint p-4 text-sm text-game-red">
            לא הצלחנו לטעון את הנתונים. המספרים אינם מוצגים כדי לא להטעות — נסו לרענן.
          </p>
        )}

        {result.state === 'ok' && (() => {
          const d = result.data
          return (
            <>
              <AutoRefresh generatedAt={d.generated_at} />

              {(d.paused || d.beats_today >= d.daily_beat_cap) && (
                <p role="alert" className="rounded-2xl border border-game-red/30 bg-game-red-tint p-4 text-sm text-game-red">
                  {d.paused
                    ? 'מעקב הנוכחות מושבת ידנית — הנתונים החיים אינם מתעדכנים.'
                    : `הגענו לתקציב היומי של מעקב הנוכחות (${d.daily_beat_cap.toLocaleString('he-IL')} בקשות). המספרים החיים יחסרו עד מחר.`}
                </p>
              )}

              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-ink-soft">עכשיו באתר</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Stat label="לשוניות פתוחות" value={d.tabs_online} hint={`פעילות ב-${d.online_seconds} השניות האחרונות`} />
                  <Stat label="מתוכן גלויות" value={d.visible_tabs_online} />
                  <Stat label="לשוניות בתוך משחק" value={d.tabs_in_games} />
                  <Stat label="חדרי משחק מאוכלסים" value={d.occupied_rooms} hint={`מתוכם בעיצומם: ${d.occupied_rooms_in_progress}`} />
                </div>
                <p className="text-[11px] text-ink-faint">
                  נספרות לשוניות, לא אנשים: אדם עם שתי לשוניות נספר פעמיים, ומכשיר אחד שמשמש כמה שחקנים נספר פעם אחת.
                </p>
              </section>

              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-ink-soft">היסטוריה (מספרים מצטברים בלבד)</h2>
                <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-ink-faint">
                      <tr className="border-b border-border">
                        <th className="p-2.5 text-start font-medium"></th>
                        <th className="p-2.5 text-start font-medium">היום</th>
                        <th className="p-2.5 text-start font-medium">7 ימים</th>
                        <th className="p-2.5 text-start font-medium">30 יום</th>
                        <th className="p-2.5 text-start font-medium">סה״כ</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      <tr className="border-b border-border">
                        <td className="p-2.5 font-medium">ביקורים</td>
                        <td className="p-2.5">{d.visits_today}</td><td className="p-2.5">{d.visits_7d}</td>
                        <td className="p-2.5">{d.visits_30d}</td><td className="p-2.5">{d.visits_total}</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="p-2.5 font-medium">כניסות לחדרי משחק</td>
                        <td className="p-2.5">{d.room_entries_today}</td><td className="p-2.5">{d.room_entries_7d}</td>
                        <td className="p-2.5">{d.room_entries_30d}</td><td className="p-2.5">—</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-medium">משחקים שנוצרו</td>
                        <td className="p-2.5">{d.games_created_today}</td><td className="p-2.5">{d.games_created_7d}</td>
                        <td className="p-2.5">{d.games_created_30d}</td><td className="p-2.5">—</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-ink-faint">
                  &quot;ביקור&quot; = טעינת דף בלשונית (רענון או לשונית נוספת נספרים כביקור נוסף). אין מזהה מבקר, ולכן אין ספירת אנשים ייחודיים.
                  {d.tracking_since ? ` נתונים מאז ${d.tracking_since}.` : ' עדיין אין נתונים.'}
                  {' '}משחקים שלא הסתיימו במסד (כולל נטושים): {result.gamesNotFinished ?? '—'}.
                  {' '}בקשות נוכחות היום: {d.beats_today.toLocaleString('he-IL')} מתוך תקציב {d.daily_beat_cap.toLocaleString('he-IL')}.
                </p>
              </section>

              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-ink-soft">חדרים מאוכלסים עכשיו</h2>
                {d.rooms.length === 0 ? (
                  <p className="text-sm text-ink-faint">אין כרגע אף אחד בתוך משחק.</p>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
                    <table className="w-full text-sm">
                      <thead className="text-xs text-ink-faint">
                        <tr className="border-b border-border">
                          <th className="p-2.5 text-start font-medium">קוד</th>
                          <th className="p-2.5 text-start font-medium">מצב</th>
                          <th className="p-2.5 text-start font-medium">תור</th>
                          <th className="p-2.5 text-start font-medium">לשוניות</th>
                          <th className="p-2.5 text-start font-medium">גלויות</th>
                          <th className="p-2.5 text-start font-medium">פעילות אחרונה</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.rooms.map((room) => (
                          <tr key={room.code} className="border-b border-border last:border-0">
                            <td className="p-2.5">
                              {/* Admin inspector page: no spymaster token anywhere. */}
                              <Link href={`/admin/games/${room.code}`} className="font-mono font-semibold text-navy hover:opacity-70">
                                {room.code}
                              </Link>
                            </td>
                            <td className="p-2.5"><GameStatusBadge status={room.status} /></td>
                            <td className="p-2.5">{room.status === 'finished' ? '—' : TEAM_LABEL[room.current_team] ?? '—'}</td>
                            <td className="p-2.5 tabular-nums">{room.tabs}</td>
                            <td className="p-2.5 tabular-nums">{room.visible_tabs}</td>
                            <td className="p-2.5 tabular-nums text-ink-soft">{timeOf(room.last_activity)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )
        })()}
      </div>
    </main>
  )
}
