import Link from 'next/link'
import { adminLogout } from '@/app/admin/actions'

export default function AdminHeader({ title, backHref }: { title: string; backHref?: string }) {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        {backHref && (
          <Link href={backHref} className="text-sm text-ink-faint hover:text-ink-soft transition-colors">
            ← חזרה
          </Link>
        )}
        <h1 className="font-bold text-navy text-lg">{title}</h1>
      </div>
      <form action={adminLogout}>
        <button type="submit" className="text-sm text-ink-faint hover:text-ink-soft transition-colors">
          התנתקות
        </button>
      </form>
    </header>
  )
}
