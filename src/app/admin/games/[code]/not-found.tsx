import Link from 'next/link'

export default function AdminGameNotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-4 text-center">
      <h1 className="text-2xl font-bold text-ink">משחק לא נמצא</h1>
      <p className="text-ink-soft">הקוד שגוי, או שהמשחק כבר לא נשמר במערכת.</p>
      <Link
        href="/admin"
        className="rounded-xl bg-navy px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
      >
        חזרה לרשימת המשחקים
      </Link>
    </main>
  )
}
