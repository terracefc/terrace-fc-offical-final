import { notFound } from "next/navigation"
import { AdminPageShell } from "@/components/admin-page-shell"
import type { AdminTab } from "@/components/admin-tabs"

const ADMIN_SECTIONS = new Set<AdminTab>(["orders", "support", "requests", "accounts", "coupons", "lockdown", "settings"])

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  if (!ADMIN_SECTIONS.has(section as AdminTab)) notFound()
  return <AdminPageShell initialTab={section as AdminTab} />
}
