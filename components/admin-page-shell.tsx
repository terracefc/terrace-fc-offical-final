import Link from "next/link"
import { AdminTabs, type AdminTab } from "@/components/admin-tabs"
import { kits } from "@/lib/data"

export function AdminPageShell({ initialTab }: { initialTab: AdminTab }) {
  return (
    <main className="min-h-screen bg-background text-foreground noise-texture">
      <div className="border-b border-border bg-background/90 backdrop-blur-xl sticky top-0 z-40">
        <div className="mx-auto flex h-16 max-w-[1800px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="font-black tracking-tight text-xl hover:text-accent transition-colors">
            terrace<span className="text-red-600">.</span>fc
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/collection" className="text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-accent">
              View Store
            </Link>
            <form action="/api/admin/logout" method="post">
              <button className="h-9 px-4 rounded-lg border border-border text-xs font-black uppercase tracking-widest hover:bg-secondary">
                Logout
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1800px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 mb-8">
          <p className="text-xs font-black uppercase tracking-widest text-accent">Private Dashboard</p>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight">Admin</h1>
          <p className="text-muted-foreground max-w-2xl">
            Orders and store controls live here. This page is protected and is not linked from the public storefront.
          </p>
        </div>

        <AdminTabs kits={kits} initialTab={initialTab} />
      </div>
    </main>
  )
}
