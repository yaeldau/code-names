import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-4 text-center">
      <h1 className="text-2xl font-bold text-gray-900">משחק לא נמצא</h1>
      <p className="text-gray-500">הקוד שגוי, או שהמשחק כבר לא קיים.</p>
      <Link
        href="/"
        className="rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white hover:bg-gray-800"
      >
        משחק חדש
      </Link>
    </main>
  )
}
