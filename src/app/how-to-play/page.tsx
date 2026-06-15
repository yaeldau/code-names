import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'איך משחקים שם קוד? הוראות משחק Codenames בעברית',
  description:
    'הוראות המשחק המלאות לשם קוד — Codenames בעברית. הכירו את חוקי המשחק, תפקיד המרגל, ואיך לנצח. משחק חברתי לקבוצות.',
  alternates: {
    canonical: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://shemkod.com'}/how-to-play`,
  },
}

export default function HowToPlayPage() {
  return (
    <main className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-sm text-gray-500 underline underline-offset-2 mb-6 inline-block">
          ← חזרה לדף הבית
        </Link>

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

        </div>
      </div>
    </main>
  )
}
