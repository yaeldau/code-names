import type { Metadata } from 'next'
import Link from 'next/link'
import BackButton from '@/components/ui/BackButton'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://shemkod.com'

export const metadata: Metadata = {
  title: 'איך משחקים שם קוד? הוראות משחק Codenames בעברית',
  description:
    'הוראות המשחק המלאות לשם קוד — Codenames בעברית. הכירו את חוקי המשחק, תפקיד המרגל, ואיך לנצח. משחק חברתי לקבוצות.',
  alternates: {
    canonical: `${siteUrl}/how-to-play`,
  },
}

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'מה זה שם קוד (Codenames)?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'שם קוד הוא משחק קלפים חברתי שפותח על ידי Vlaada Chvátil ופורסם ב-2015. המשחק מיועד ל-4 עד 8 שחקנים המחולקים לשתי קבוצות. כל קבוצה מנסה לגלות את סוכניה לפי רמזים שנותן המרגל שלה.',
      },
    },
    {
      '@type': 'Question',
      name: 'כמה שחקנים יכולים לשחק שם קוד אונליין?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'שם קוד מתאים ל-4 עד 8 שחקנים. לכל קבוצה דרוש לפחות מרגל אחד ושחקן אחד נוסף. אפשר לשחק גם בשניים — כל אחד מחליט לבד על הניחושים שלו.',
      },
    },
    {
      '@type': 'Question',
      name: 'האם שם קוד אונליין חינמי?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'כן, שם קוד אונליין הוא לגמרי חינמי. אין צורך בהרשמה, אין תשלום, ואין צורך להוריד אפליקציה. פשוט צרו משחק ושתפו קישור לחברים.',
      },
    },
    {
      '@type': 'Question',
      name: 'מה זה מרגל (Spymaster) בשם קוד?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'המרגל הוא תפקיד מיוחד בכל קבוצה. המרגל רואה את הצבע של כל הקלפים על הלוח, ומנחה את חברי קבוצתו על ידי נתינת רמז — מילה אחת ומספר המציין לכמה קלפים הרמז קשור. המרגל לא יכול לרמוז בשום דרך אחרת.',
      },
    },
    {
      '@type': 'Question',
      name: 'מה קורה אם לוחצים על הקוטל?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'אם קבוצה לוחצת על קלף הקוטל (השחור), היא מפסידה מיד — ללא קשר לכמה סוכנים כבר גילתה. זהו הסיכון הגדול ביותר במשחק.',
      },
    },
    {
      '@type': 'Question',
      name: 'איך מתחילים משחק שם קוד אונליין?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'לחצו על "צור משחק חדש" בדף הבית. תקבלו שני קישורים — אחד לשחקנים רגילים ואחד למרגלים. שתפו אותם עם החברים והמשחק מתחיל מיד, בזמן אמת.',
      },
    },
  ],
}

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'שם קוד', item: siteUrl },
    { '@type': 'ListItem', position: 2, name: 'איך משחקים?', item: `${siteUrl}/how-to-play` },
  ],
}

export default function HowToPlayPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <main className="min-h-screen p-6">
        <div className="max-w-2xl mx-auto">
          <nav className="flex items-center justify-between mb-6">
            <Link href="/" className="font-bold text-gray-900 hover:text-gray-600 transition-colors">
              שם קוד
            </Link>
            <BackButton />
          </nav>

          <h1 className="text-3xl font-bold text-gray-900 mb-2">איך משחקים שם קוד?</h1>
          <p className="text-gray-500 mb-8">
            שם קוד (Codenames) הוא משחק חברתי לשתי קבוצות, בו מרגלים מנחים את חבריהם לגלות קלפים סודיים.
          </p>

          <div className="flex flex-col gap-6">

            <section className="rounded-2xl border border-gray-200 bg-white p-6 flex flex-col gap-3">
              <h2 className="text-xl font-bold text-gray-800">המטרה</h2>
              <p className="text-gray-600 leading-relaxed">
                שתי קבוצות — <span className="text-red-600 font-semibold">אדומים</span> ו<span className="text-blue-700 font-semibold">כחולים</span> — מתחרות זו בזו.
                כל קבוצה מנסה לגלות את 8–9 הסוכנים שלה לפני הקבוצה היריבה.
                הקבוצה שמגלה את כל הסוכנים שלה ראשונה — מנצחת.
              </p>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-6 flex flex-col gap-3">
              <h2 className="text-xl font-bold text-gray-800">הגדרת המשחק</h2>
              <ol className="flex flex-col gap-2 text-gray-600 leading-relaxed list-decimal list-inside">
                <li>צרו משחק חדש — 25 קלפים עם מילים עבריות יוצגו על הלוח.</li>
                <li>
                  שלחו את <strong>קישור המרגל</strong> למרגל של כל קבוצה — הם יראו את הצבע של כל קלף.
                </li>
                <li>שלחו את <strong>קישור השחקנים</strong> לשאר הקבוצה — הם לא רואים את הצבעים.</li>
                <li>קבוצת האדומים מתחילה (יש להם 9 סוכנים, לכחולים 8).</li>
              </ol>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-6 flex flex-col gap-3">
              <h2 className="text-xl font-bold text-gray-800">תפקיד המרגל (Spymaster)</h2>
              <p className="text-gray-600 leading-relaxed">
                המרגל רואה את כל הצבעים על הלוח ונותן רמז בכל תור — <strong>מילה אחת ומספר</strong>.
              </p>
              <ul className="flex flex-col gap-1 text-gray-600 text-sm list-disc list-inside">
                <li>המילה — קשורה לקלפים שהקבוצה צריכה לגלות.</li>
                <li>המספר — כמה קלפים קשורים לרמז הזה.</li>
                <li>המרגל לא יכול לתת יותר מרמז אחד בתור.</li>
              </ul>
              <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-500 mt-1">
                <strong>דוגמה:</strong> &ldquo;מים 3&rdquo; — שלושה קלפים על הלוח קשורים למילה &ldquo;מים&rdquo;.
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-6 flex flex-col gap-3">
              <h2 className="text-xl font-bold text-gray-800">תפקיד השחקנים</h2>
              <p className="text-gray-600 leading-relaxed">
                השחקנים מקשיבים לרמז של המרגל שלהם ולוחצים על קלפים שלדעתם קשורים לרמז.
              </p>
              <ul className="flex flex-col gap-1 text-gray-600 text-sm list-disc list-inside">
                <li>לחיצה על קלף של הקבוצה שלך — הקלף נחשף בצבע שלך, ואפשר להמשיך לנחש.</li>
                <li>לחיצה על קלף <strong>ניטרלי</strong> (בז&apos;) — הקלף נחשף והתור עובר לקבוצה השנייה.</li>
                <li>לחיצה על קלף של <strong>הקבוצה היריבה</strong> — הקלף נחשף בצבע שלהם, והתור עובר.</li>
                <li>לחיצה על <strong>הקוטל</strong> (שחור) — הקבוצה שלחצה מפסידה מיד!</li>
              </ul>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-6 flex flex-col gap-3">
              <h2 className="text-xl font-bold text-gray-800">סיום התור</h2>
              <p className="text-gray-600 leading-relaxed">
                הקבוצה יכולה לנחש עד <strong>מספר הרמז + 1</strong> פעמים. אפשר גם לסיים את התור מוקדם יותר
                בלחיצה על &ldquo;סיים תור&rdquo;.
              </p>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-6 flex flex-col gap-3">
              <h2 className="text-xl font-bold text-gray-800">ניצחון</h2>
              <ul className="flex flex-col gap-1 text-gray-600 leading-relaxed list-disc list-inside">
                <li>הקבוצה הראשונה שמגלה את כל הסוכנים שלה — מנצחת.</li>
                <li>אם קבוצה לוחצת על הקוטל — היא מפסידה מיד.</li>
              </ul>
            </section>

            <div className="text-center pt-2">
              <Link
                href="/"
                className="inline-block rounded-2xl bg-gray-900 px-8 py-3 font-semibold text-white hover:bg-gray-800 transition-colors"
              >
                צרו משחק עכשיו
              </Link>
            </div>

            <section className="rounded-2xl border border-gray-100 bg-gray-50 p-6 flex flex-col gap-3">
              <h2 className="text-base font-semibold text-gray-600">על המשחק המקורי</h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                שם קוד המקורי הוא משחק קלפים שפותח על ידי Vlaada Chvátil ויוצר על ידי Czech Games Edition ב-2015.
                המשחק זכה בפרס Spiel des Jahres ב-2016 ונחשב לאחד ממשחקי המסיבה הטובים בעולם.
                הגרסה שלנו היא עיבוד דיגיטלי לא-רשמי בעברית לשימוש חינמי ומקוון.
              </p>
              <div className="flex flex-wrap gap-3 text-sm">
                <a
                  href="https://he.wikipedia.org/wiki/%D7%A9%D7%9D_%D7%A7%D7%95%D7%93_(%D7%9E%D7%A9%D7%97%D7%A7_%D7%A7%D7%9C%D7%A4%D7%99%D7%9D)"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  ויקיפדיה — שם קוד
                </a>
                <span className="text-gray-300">·</span>
                <a
                  href="https://en.wikipedia.org/wiki/Codenames_(board_game)"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Wikipedia — Codenames
                </a>
                <span className="text-gray-300">·</span>
                <a
                  href="https://boardgamegeek.com/boardgame/178900/codenames"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  BoardGameGeek
                </a>
              </div>
            </section>

          </div>
        </div>
      </main>
    </>
  )
}
