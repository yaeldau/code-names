import type { Metadata } from 'next'
import Link from 'next/link'
import BackButton from '@/components/ui/BackButton'
import { HEARTBEAT_INTERVAL_MS } from '@/lib/presence/shared'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://shemkod.com'
// Same build-time flag that renders the beacon, so this page always describes
// what the deployed site actually does.
const PRESENCE_ENABLED = process.env.NEXT_PUBLIC_PRESENCE_ENABLED === 'true'

export const metadata: Metadata = {
  title: 'סטטיסטיקת שימוש ופרטיות',
  description: 'איזה מידע האתר אוסף כדי לדעת כמה משחקים פעילים, לכמה זמן הוא נשמר, ומה לא נאסף.',
  alternates: { canonical: `${siteUrl}/privacy` },
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 flex flex-col gap-3">
      <h2 className="text-xl font-bold text-gray-800">{title}</h2>
      <div className="text-gray-600 leading-relaxed flex flex-col gap-2">{children}</div>
    </section>
  )
}

export default function PrivacyPage() {
  const seconds = Math.round(HEARTBEAT_INTERVAL_MS / 1000)
  return (
    <main className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto">
        <nav className="flex items-center justify-between mb-6">
          <Link href="/" className="font-bold text-gray-900 hover:text-gray-600 transition-colors">
            שם קוד
          </Link>
          <BackButton />
        </nav>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">סטטיסטיקת שימוש ופרטיות</h1>
        <p className="text-gray-500 mb-8">
          הדף מסביר את מדידת השימוש באתר: מה נאסף, למה, ולכמה זמן. הוא לא עוסק בתוכן שאתם שולחים בעצמכם
          (למשל הודעה בטופס המשוב, שנשלחת אלינו בדוא״ל).
        </p>

        <div className="flex flex-col gap-6">
          {!PRESENCE_ENABLED ? (
            <Section title="מצב נוכחי">
              <p>האתר אינו מפעיל כרגע מדידת שימוש.</p>
            </Section>
          ) : (
            <>
              <Section title="למה">
                <p>
                  כדי לדעת כמה אנשים משחקים עכשיו, כמה חדרי משחק פעילים, וכמה ביקורים יש באתר — מספרים כלליים
                  שעוזרים לנו לתחזק ולשפר את המשחק. המידע לא משמש לפרסום, לא נמכר ולא מועבר לאחרים.
                </p>
              </Section>

              <Section title="מה נשלח מהדפדפן">
                <p>כשדף באתר פתוח, הדפדפן שולח לשרת שלנו הודעה קצרה בכניסה לדף, במעבר בין דפים, כשהלשונית מוסתרת או חוזרת להיות גלויה, בסגירה, וכל {seconds} שניות בערך כשהלשונית גלויה. ההודעה כוללת:</p>
                <ul className="list-disc list-inside text-sm flex flex-col gap-1">
                  <li>סוג הדף: דף הבית, משחק, הוראות או אחר;</li>
                  <li>קוד המשחק, אם אתם בתוך חדר משחק;</li>
                  <li>האם הלשונית גלויה כרגע;</li>
                  <li>
                    מספר אקראי שמזהה את הלשונית. הוא נוצר כשהדף נטען, נשמר רק בזיכרון של הדף, ונעלם כשסוגרים או
                    מרעננים את הלשונית.
                  </li>
                </ul>
              </Section>

              <Section title="מה לא נאסף">
                <ul className="list-disc list-inside text-sm flex flex-col gap-1">
                  <li>אין עוגיות למדידה, ושום דבר לא נשמר במכשיר שלכם (גם לא ב־localStorage).</li>
                  <li>אין מזהה קבוע: אי אפשר לקשר בין שני ביקורים, שני ימים או שני מכשירים, ולכן גם לא נספרים &quot;מבקרים ייחודיים&quot;.</li>
                  <li>אין כלי מדידה של צד שלישי ואין &quot;טביעת אצבע&quot; של הדפדפן.</li>
                  <li>לא נשלחים כתובת הדף המלאה, קישור המרגל או מה שכתוב במשחק.</li>
                </ul>
              </Section>

              <Section title="כתובת IP ונתונים טכניים">
                <p>
                  כמו בכל אתר, ספקי האחסון שלנו (Vercel ו־Supabase) מקבלים את כתובת ה־IP שלכם ונתונים טכניים רגילים
                  (כמו סוג הדפדפן) כחלק מכל בקשה לשרת. אלה לא נשמרים בנתוני הסטטיסטיקה. כדי למנוע שימוש לרעה, נשמר ממנה ערך מגובב (hash) עם מפתח
                  סודי שמתחלף מדי יום, שמשמש רק להגבלת כמות הבקשות, ונמחק תוך שעה.
                </p>
              </Section>

              <Section title="לכמה זמן">
                <ul className="list-disc list-inside text-sm flex flex-col gap-1">
                  <li>רשומת לשונית פתוחה: עד שעה אחרי הפעילות האחרונה שלה.</li>
                  <li>הערך המגובב של כתובת ה־IP: עד שעה.</li>
                  <li>
                    מונים יומיים כלליים (כמה ביקורים וכמה כניסות לחדרי משחק היו בכל יום): נשמרים לאורך זמן. הם
                    מספרים בלבד, בלי שום מזהה.
                  </li>
                </ul>
              </Section>
            </>
          )}

          <Section title="שאלות">
            <p>אפשר לפנות אלינו דרך כפתור המשוב באתר.</p>
          </Section>
        </div>
      </div>
    </main>
  )
}
