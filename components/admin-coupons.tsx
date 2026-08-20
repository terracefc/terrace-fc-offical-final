"use client"

import { useEffect, useState } from "react"
import { Edit3, Loader2, Plus, Save, ShieldAlert, Ticket, Trash2, X } from "lucide-react"
import { confirmAction } from "@/lib/confirm-action"
import { type Coupon } from "@/lib/coupons"
import { toast } from "sonner"

const emptyForm = {
  code: "",
  discountType: "percentage" as "percentage" | "fixed",
  discountValue: "",
  minSubtotal: "",
  usageLimit: "",
  perAccountUsageLimit: "",
  description: "",
  isActive: true,
}

export function AdminCoupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [form, setForm] = useState(emptyForm)
  const [editingCode, setEditingCode] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const loadCoupons = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/admin/coupons")
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not load coupons.")
      setCoupons(Array.isArray(data.coupons) ? data.coupons : [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load coupons.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadCoupons()
  }, [])

  const persistCoupons = async (nextCoupons: Coupon[]) => {
    setIsSaving(true)
    try {
      const response = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coupons: nextCoupons }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not save coupons.")

      setCoupons(data.coupons)
      toast.success("Coupons saved.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save coupons.")
    } finally {
      setIsSaving(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    const cleanCode = form.code.trim().toUpperCase()
    const discountValue = Number(form.discountValue)
    const minSubtotal = form.minSubtotal ? Number(form.minSubtotal) : undefined
    const usageLimit = form.usageLimit ? Number(form.usageLimit) : undefined
    const perAccountUsageLimit = form.perAccountUsageLimit ? Number(form.perAccountUsageLimit) : undefined

    if (!cleanCode) return toast.error("Code is required.")
    if (!Number.isFinite(discountValue) || discountValue <= 0) return toast.error("Discount value must be greater than 0.")
    if (form.discountType === "percentage" && discountValue > 100) return toast.error("Percentage discount cannot exceed 100%.")
    if (minSubtotal !== undefined && (!Number.isFinite(minSubtotal) || minSubtotal < 0)) return toast.error("Minimum subtotal cannot be negative.")
    if (usageLimit !== undefined && (!Number.isFinite(usageLimit) || usageLimit < 1)) return toast.error("Total usage limit must be at least 1, or leave it blank for infinite.")
    if (perAccountUsageLimit !== undefined && (!Number.isFinite(perAccountUsageLimit) || perAccountUsageLimit < 1)) return toast.error("Per-account usage limit must be at least 1, or leave it blank for infinite.")

    const coupon: Coupon = {
      code: cleanCode,
      discountType: form.discountType,
      discountValue,
      minSubtotal,
      usageLimit,
      perAccountUsageLimit,
      description: form.description.trim() || `${form.discountType === "percentage" ? `${discountValue}%` : `₹${discountValue}`} discount`,
      isActive: form.isActive,
    }

    const nextCoupons = [
      coupon,
      ...coupons.filter((current) => current.code !== cleanCode && current.code !== editingCode),
    ]

    await persistCoupons(nextCoupons)
    resetForm()
  }

  const editCoupon = (coupon: Coupon) => {
    setEditingCode(coupon.code)
    setForm({
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: String(coupon.discountValue),
      minSubtotal: coupon.minSubtotal ? String(coupon.minSubtotal) : "",
      usageLimit: coupon.usageLimit ? String(coupon.usageLimit) : "",
      perAccountUsageLimit: coupon.perAccountUsageLimit ? String(coupon.perAccountUsageLimit) : "",
      description: coupon.description,
      isActive: coupon.isActive,
    })
  }

  const deleteCoupon = async (code: string) => {
    if (!(await confirmAction(`Are you sure you want to delete coupon ${code}? Customers will not be able to use it after this.`))) {
      return
    }

    await persistCoupons(coupons.filter((coupon) => coupon.code !== code))
    if (editingCode === code) resetForm()
  }

  const toggleCoupon = async (code: string) => {
    const coupon = coupons.find((current) => current.code === code)
    if (!coupon) return

    const nextState = coupon.isActive ? "deactivate" : "activate"
    if (!(await confirmAction(`Are you sure you want to ${nextState} coupon ${code}?`))) {
      return
    }

    await persistCoupons(coupons.map((current) => current.code === code ? { ...current, isActive: !current.isActive } : current))
  }

  const resetForm = () => {
    setForm(emptyForm)
    setEditingCode("")
  }

  return (
    <div className="grid gap-6 md:grid-cols-[340px_1fr]">
      <div className="h-fit rounded-2xl border border-border bg-background/85 p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2 border-b border-border/60 pb-3">
          <Ticket className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-black tracking-tight">{editingCode ? "Edit Coupon" : "Create Coupon"}</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Coupon Code">
            <input
              value={form.code}
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase().replace(/\s+/g, "") }))}
              placeholder="Coupon code"
              className="h-10 w-full rounded-xl border border-border bg-secondary/30 px-3 text-sm font-medium outline-none focus:border-accent"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select
                value={form.discountType}
                onChange={(event) => setForm((current) => ({ ...current, discountType: event.target.value as "percentage" | "fixed" }))}
                className="h-10 w-full rounded-xl border border-border bg-secondary/30 px-2 text-sm font-medium outline-none focus:border-accent"
              >
                <option value="percentage">Percentage</option>
                <option value="fixed">Flat</option>
              </select>
            </Field>
            <Field label="Value">
              <input
                type="number"
                min="1"
                value={form.discountValue}
                onChange={(event) => setForm((current) => ({ ...current, discountValue: event.target.value }))}
                placeholder="Value"
                className="h-10 w-full rounded-xl border border-border bg-secondary/30 px-3 text-sm font-medium outline-none focus:border-accent"
              />
            </Field>
          </div>

          <Field label="Min. Subtotal">
            <input
              type="number"
              min="0"
              value={form.minSubtotal}
              onChange={(event) => setForm((current) => ({ ...current, minSubtotal: event.target.value }))}
              placeholder="Optional"
              className="h-10 w-full rounded-xl border border-border bg-secondary/30 px-3 text-sm font-medium outline-none focus:border-accent"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Total Uses">
              <input
                type="number"
                min="1"
                value={form.usageLimit}
                onChange={(event) => setForm((current) => ({ ...current, usageLimit: event.target.value }))}
                placeholder="Infinite"
                className="h-10 w-full rounded-xl border border-border bg-secondary/30 px-3 text-sm font-medium outline-none focus:border-accent"
              />
            </Field>
            <Field label="Uses / Account">
              <input
                type="number"
                min="1"
                value={form.perAccountUsageLimit}
                onChange={(event) => setForm((current) => ({ ...current, perAccountUsageLimit: event.target.value }))}
                placeholder="Infinite"
                className="h-10 w-full rounded-xl border border-border bg-secondary/30 px-3 text-sm font-medium outline-none focus:border-accent"
              />
            </Field>
          </div>
          <p className="-mt-2 text-[10px] font-bold text-muted-foreground">Leave either field empty for infinite.</p>

          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Shown after coupon is applied"
              className="min-h-20 w-full resize-none rounded-xl border border-border bg-secondary/30 px-3 py-2 text-sm font-medium outline-none focus:border-accent"
            />
          </Field>

          <label className="flex items-center justify-between rounded-xl border border-border bg-secondary/30 p-3 text-sm font-bold">
            Active
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
              className="h-5 w-5 accent-current"
            />
          </label>

          <button
            type="submit"
            disabled={isSaving}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-foreground text-xs font-black uppercase tracking-wider text-background disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingCode ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {editingCode ? "Save Coupon" : "Add Coupon"}
          </button>

          {editingCode && (
            <button type="button" onClick={resetForm} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border text-xs font-black uppercase tracking-widest hover:bg-secondary">
              <X className="h-4 w-4" />
              Cancel Edit
            </button>
          )}
        </form>
      </div>

      <div className="h-fit rounded-2xl border border-border bg-background/85 p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-accent" />
            <h2 className="text-xl font-black tracking-tight">Coupons</h2>
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-black text-accent">{coupons.length}</span>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Loading coupons...</div>
        ) : coupons.length === 0 ? (
          <div className="space-y-2 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground/60" />
            <p className="font-black">No coupons created yet.</p>
            <p className="text-xs">Only coupons you create here will work at checkout.</p>
          </div>
        ) : (
          <>
          <div className="grid gap-3 lg:hidden">
            {coupons.map((coupon) => (
              <div key={coupon.code} className="rounded-xl border border-border bg-secondary/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-black text-accent">{coupon.code}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{coupon.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleCoupon(coupon.code)}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${coupon.isActive ? "bg-emerald-500/10 text-emerald-600" : "bg-secondary text-muted-foreground"}`}
                  >
                    {coupon.isActive ? "Active" : "Inactive"}
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <Info label="Discount" value={coupon.discountType === "percentage" ? `${coupon.discountValue}%` : `₹${coupon.discountValue}`} />
                  <Info label="Min" value={coupon.minSubtotal ? `₹${coupon.minSubtotal}` : "-"} />
                  <Info label="Total Uses" value={coupon.usageLimit ? `${coupon.usageUsed || 0}/${coupon.usageLimit}` : `${coupon.usageUsed || 0}/Infinite`} />
                  <Info label="Per Account" value={coupon.perAccountUsageLimit ? `${coupon.perAccountUsageLimit} each` : "Infinite"} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => editCoupon(coupon)}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border text-xs font-black uppercase tracking-widest hover:bg-secondary"
                  >
                    <Edit3 className="h-4 w-4" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteCoupon(coupon.code)}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-500/30 text-xs font-black uppercase tracking-widest text-red-500 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-muted-foreground">
                <tr className="text-left">
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest">Code</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest">Discount</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest">Min</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest">Total Uses</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest">Per Account</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest">Status</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((coupon) => (
                  <tr key={coupon.code} className="border-t border-border/60 hover:bg-secondary/10">
                    <td className="px-4 py-3">
                      <p className="font-black text-accent">{coupon.code}</p>
                      <p className="max-w-[220px] truncate text-xs text-muted-foreground">{coupon.description}</p>
                    </td>
                    <td className="px-4 py-3 font-bold">{coupon.discountType === "percentage" ? `${coupon.discountValue}%` : `₹${coupon.discountValue}`}</td>
                    <td className="px-4 py-3 text-muted-foreground">{coupon.minSubtotal ? `₹${coupon.minSubtotal}` : "-"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {coupon.usageLimit ? `${coupon.usageUsed || 0}/${coupon.usageLimit}` : `${coupon.usageUsed || 0}/Infinite`}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {coupon.perAccountUsageLimit ? `${coupon.perAccountUsageLimit} each` : "Infinite"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleCoupon(coupon.code)}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${coupon.isActive ? "bg-emerald-500/10 text-emerald-600" : "bg-secondary text-muted-foreground"}`}
                      >
                        {coupon.isActive ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button type="button" onClick={() => editCoupon(coupon)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" title="Edit coupon">
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => deleteCoupon(coupon.code)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500" title="Delete coupon">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/70 p-2">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-bold">{value}</p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
