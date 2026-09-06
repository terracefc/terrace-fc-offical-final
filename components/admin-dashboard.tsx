"use client"

import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  Boxes,
  Crop,
  IndianRupee,
  PackageCheck,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Upload,
  UsersRound,
  X,
} from "lucide-react"
import { confirmAction } from "@/lib/confirm-action"
import type { Kit } from "@/lib/data"
import { fetchCustomerAccounts } from "@/lib/customer-auth"
import {
  CUSTOM_KITS_KEY,
  DRAFT_KITS_KEY,
  KIT_SIZES,
  KIT_EDITS_KEY,
  PRIVATE_KITS_KEY,
  REMOVED_KITS_KEY,
  getKitStock,
  fetchAdminInventory,
  readCachedAdminInventory,
  normalizeSizeStock,
  readAdminInventory,
  saveInventoryKit,
  updateInventoryKits,
  deleteInventoryKit,
  type EditableKit,
  type KitSize,
} from "@/lib/inventory-client"

type InventoryTab = "active" | "inactive" | "draft"
type KitStatus = "active" | "inactive" | "draft"

type KitForm = {
  id?: number
  name: string
  club: string
  season: string
  price: string
  sizeStock: Record<KitSize, string>
  number: string
  league: string
  color: string
  badge: string
  description: string
  image: string
  backImage: string
  status: KitStatus
  isPublished: boolean
}

const emptyForm: KitForm = {
  name: "",
  club: "",
  season: "",
  price: "1299",
  sizeStock: { S: "0", M: "0", L: "0", XL: "0" },
  number: "#",
  league: "",
  color: "",
  badge: "",
  description: "",
  image: "",
  backImage: "",
  status: "active",
  isPublished: true,
}

const DEFAULT_JERSEY_IMAGE = "/placeholder.jpg"

export function AdminDashboard({ kits, tabs }: { kits: Kit[]; tabs?: ReactNode }) {
  const [removedIds, setRemovedIds] = useStoredNumberArray(REMOVED_KITS_KEY)
  const [customKits, setCustomKits] = useStoredKits(CUSTOM_KITS_KEY)
  const [kitEdits, setKitEdits] = useStoredEdits()
  const [privateIds, setPrivateIds] = useStoredNumberArray(PRIVATE_KITS_KEY)
  const [draftIds, setDraftIds] = useStoredNumberArray(DRAFT_KITS_KEY)
  const [form, setForm] = useState<KitForm>(emptyForm)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formMessage, setFormMessage] = useState("")
  const [inventoryTab, setInventoryTab] = useState<InventoryTab>("active")
  const [inventorySearch, setInventorySearch] = useState("")
  const deferredInventorySearch = useDeferredValue(inventorySearch)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [focusedKitId, setFocusedKitId] = useState<number | null>(null)
  const [accountCount, setAccountCount] = useState(0)
  const [serverInventory, setServerInventory] = useState<EditableKit[] | null>(() => readCachedAdminInventory(kits))
  const [isSavingKit, setIsSavingKit] = useState(false)
  const [savingImageField, setSavingImageField] = useState<"image" | "backImage" | null>(null)
  const formRef = useRef(form)

  const refreshInventory = () => {
    fetchAdminInventory(kits).then((data) => {
      setServerInventory(data)
      setPrivateIds(() => data.filter((kit) => kit.isPrivate).map((kit) => kit.id))
      setDraftIds(() => data.filter((kit) => kit.isDraft).map((kit) => kit.id))
      setRemovedIds(() => data.filter((kit) => kit.isRemoved).map((kit) => kit.id))
    }).catch(() => null)
  }

  useEffect(() => {
    refreshInventory()
  }, [])

  useEffect(() => {
    formRef.current = form
  }, [form])

  useEffect(() => {
    setSelectedIds([])
  }, [inventoryTab, inventorySearch])

  useEffect(() => {
    const syncAccounts = () => {
      fetchCustomerAccounts().then((accounts) => setAccountCount(accounts.length)).catch(() => null)
    }

    syncAccounts()
    const interval = window.setInterval(syncAccounts, 15000)
    window.addEventListener("storage", syncAccounts)
    window.addEventListener("focus", syncAccounts)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener("storage", syncAccounts)
      window.removeEventListener("focus", syncAccounts)
    }
  }, [])

  const inventory = useMemo(() => {
    return serverInventory && serverInventory.length > 0 ? serverInventory : readAdminInventory(kits)
  }, [kits, kitEdits, customKits, serverInventory])

  function getKitStatus(id: number): KitStatus {
    const kit = inventory.find((item) => item.id === id)
    if (kit.isDraft || draftIds.includes(id)) return "draft"
    if (kit.isPrivate || privateIds.includes(id)) return "inactive"
    return "active"
  }

  function getStatusLabel(status: KitStatus) {
    if (status === "draft") return "Draft"
    if (status === "inactive") return "Inactive"
    return "Active"
  }

  function getStatusClass(status: KitStatus) {
    if (status === "active") return "bg-emerald-500/10 text-emerald-500"
    if (status === "draft") return "bg-amber-500/10 text-amber-600"
    return "bg-secondary text-muted-foreground"
  }

  const visibleKits = useMemo(() => {
    return inventory.filter((kit) => !kit.isArchived && !kit.isRemoved && !removedIds.includes(kit.id))
  }, [inventory, removedIds])
  const removedKits = useMemo(() => {
    return inventory.filter((kit) => !kit.isArchived && (kit.isRemoved || removedIds.includes(kit.id)))
  }, [inventory, removedIds])
  const activeKits = useMemo(() => visibleKits.filter((kit) => getKitStatus(kit.id) === "active"), [visibleKits, draftIds, privateIds, inventory])
  const inactiveKits = useMemo(() => visibleKits.filter((kit) => getKitStatus(kit.id) === "inactive"), [visibleKits, draftIds, privateIds, inventory])
  const draftKits = useMemo(() => visibleKits.filter((kit) => getKitStatus(kit.id) === "draft"), [visibleKits, draftIds, privateIds, inventory])
  const displayedKits = useMemo(() => ({
    active: activeKits,
    inactive: inactiveKits,
    draft: draftKits,
  }[inventoryTab]), [activeKits, inactiveKits, draftKits, inventoryTab])
  const filteredDisplayedKits = useMemo(() => displayedKits.filter((kit) => {
    const query = deferredInventorySearch.trim().toLowerCase()
    if (!query) return true

    return [
      kit.id,
      kit.name,
      kit.club,
      kit.season,
      kit.number,
      kit.color,
      kit.league,
      kit.badge,
      kit.price,
    ].some((value) => String(value || "").toLowerCase().includes(query))
  }), [displayedKits, deferredInventorySearch])
  const totalStock = visibleKits.reduce((sum, kit) => sum + getKitStock(kit), 0)
  const totalValue = visibleKits.reduce((sum, kit) => sum + kit.price * getInventoryValueStock(kit), 0)

  useEffect(() => {
    if (filteredDisplayedKits.length === 0) {
      setFocusedKitId(null)
      return
    }
    if (!focusedKitId || !filteredDisplayedKits.some((kit) => kit.id === focusedKitId)) {
      setFocusedKitId(filteredDisplayedKits[0].id)
    }
  }, [filteredDisplayedKits, focusedKitId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isFormOpen) return
      const target = event.target as HTMLElement | null
      if (target && ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(target.tagName)) return
      const key = event.key.toLowerCase()
      if (!["s", "w", " "].includes(key)) return
      if (filteredDisplayedKits.length === 0) return

      event.preventDefault()
      const currentIndex = Math.max(0, filteredDisplayedKits.findIndex((kit) => kit.id === focusedKitId))
      if (key === " ") {
        const kit = filteredDisplayedKits[currentIndex]
        setSelectedIds((current) => current.includes(kit.id) ? current.filter((id) => id !== kit.id) : [...current, kit.id])
        return
      }
      const direction = key === "s" ? 1 : -1
      const nextIndex = Math.min(filteredDisplayedKits.length - 1, Math.max(0, currentIndex + direction))
      const nextId = filteredDisplayedKits[nextIndex].id
      setFocusedKitId(nextId)
      document.getElementById(`inventory-kit-${nextId}`).scrollIntoView({ block: "nearest" })
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [filteredDisplayedKits, focusedKitId, isFormOpen])

  const openAddForm = () => {
    formRef.current = emptyForm
    setForm(emptyForm)
    setFormMessage("")
    setIsFormOpen(true)
  }

  const openEditForm = (kit: EditableKit) => {
    setFormMessage("")
    const nextForm = {
      id: kit.id,
      name: kit.name,
      club: kit.club,
      season: kit.season,
      price: kit.price.toString(),
      sizeStock: Object.fromEntries(
        KIT_SIZES.map((size) => [size, normalizeSizeStock(kit)[size].toString()])
      ) as Record<KitSize, string>,
      number: kit.number,
      league: kit.league,
      color: kit.color,
      badge: kit.badge || "",
      description: kit.description || "",
      image: kit.image,
      backImage: kit.backImage || "",
      status: getKitStatus(kit.id),
      isPublished: getKitStatus(kit.id) === "active",
    }
    formRef.current = nextForm
    setForm(nextForm)
    setIsFormOpen(true)
  }

  const saveImageField = async (field: "image" | "backImage", value: string) => {
    setFormMessage("")

    const normalizedValue = !value && field === "image" ? DEFAULT_JERSEY_IMAGE : value
    const currentForm = { ...formRef.current, [field]: normalizedValue }
    formRef.current = currentForm
    setForm(currentForm)

    if (!currentForm.id) return

    setSavingImageField(field)

    try {
      const previousKit = inventory.find((item) => item.id === currentForm.id)
      const storedValue = await saveSingleImageField(field, normalizedValue, currentForm.id, previousKit)
      const savedForm = { ...currentForm, [field]: storedValue }
      if (field === "image" && !savedForm.backImage) savedForm.backImage = storedValue
      const storageKit = kitFromForm(savedForm, previousKit, customKits)
      const savedKit = await saveInventoryKit(storageKit, currentForm.status, false)
      await cleanupReplacedJerseyImages(previousKit, storageKit)
      setForm((current) => ({
        ...current,
        image: savedKit.image,
        backImage: savedKit.backImage || savedKit.image,
      }))
      formRef.current = {
        ...formRef.current,
        image: savedKit.image,
        backImage: savedKit.backImage || savedKit.image,
      }
      if (savedKit.isCustom) {
        setCustomKits((current) => {
          const exists = current.some((customKit) => customKit.id === savedKit.id)
          return exists ? current.map((customKit) => (customKit.id === savedKit.id ? savedKit : customKit)) : [...current, savedKit]
        })
      } else {
        setKitEdits((current) => ({
          ...current,
          [savedKit.id]: savedKit,
        }))
      }
      setServerInventory((current) => {
        if (!current) return current
        const exists = current.some((item) => item.id === savedKit.id)
        return exists ? current.map((item) => item.id === savedKit.id ? savedKit : item) : [...current, savedKit]
      })
      refreshInventory()
      import("sonner").then(({ toast }) => {
        toast.success(`${field === "image" ? "Front" : "Back"} image saved`, {
          description: value ? "The edited crop was saved to Supabase." : "The image change was saved to Supabase.",
        })
      })
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Could not save the edited crop.")
      throw error
    } finally {
      setSavingImageField(null)
    }
  }

  const saveKit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormMessage("")
    setIsSavingKit(true)

    try {
      const currentForm = formRef.current
      formRef.current = currentForm
      const price = Number(currentForm.price)
      const sizeStock = Object.fromEntries(
        KIT_SIZES.map((size) => [size, Math.max(0, Math.floor(Number(currentForm.sizeStock[size])))])
      ) as Record<KitSize, number>
      if (
        !currentForm.name.trim() ||
        !currentForm.club.trim() ||
        Number.isNaN(price) ||
        KIT_SIZES.some((size) => Number.isNaN(sizeStock[size]))
      ) {
        setFormMessage("Add at least a player name, club/style, valid price, and valid stock numbers.")
        return
      }

      if (price <= 0) {
        setFormMessage("Price must be greater than zero.")
        return
      }

      const previousKit = currentForm.id ? inventory.find((item) => item.id === currentForm.id) : undefined
      const kit = kitFromForm(
        { ...currentForm, id: currentForm.id || createCustomId(inventory) },
        previousKit,
        customKits,
      )
      const storageKit = await compressKitImages(kit)

      if (storageKit.isCustom) {
        setCustomKits((current) => {
          const exists = current.some((customKit) => customKit.id === storageKit.id)
          return exists ? current.map((customKit) => (customKit.id === storageKit.id ? storageKit : customKit)) : [...current, storageKit]
        })
      } else {
        setKitEdits((current) => ({
          ...current,
          [storageKit.id]: storageKit,
        }))
      }

      setStatusState(storageKit.id, currentForm.status)
      const savedKit = await saveInventoryKit(storageKit, currentForm.status, false)
      await cleanupReplacedJerseyImages(previousKit, storageKit)
      setServerInventory((current) => {
        if (!current) return [savedKit]
        const exists = current.some((item) => item.id === savedKit.id)
        return exists ? current.map((item) => item.id === savedKit.id ? savedKit : item) : [...current, savedKit]
      })
      refreshInventory()
      setInventoryTab(currentForm.status)
      setRemovedIds((current) => current.filter((id) => id !== storageKit.id))
      setIsFormOpen(false)
      setForm(emptyForm)
      formRef.current = emptyForm
      import("sonner").then(({ toast }) => {
        toast.success(`${storageKit.name} saved`, {
          description: `Jersey added to ${getStatusLabel(currentForm.status).toLowerCase()} inventory.`,
        })
      })
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Could not sync jersey to live inventory.")
    } finally {
      setIsSavingKit(false)
    }
  }

  const setKitStatus = async (id: number, status: KitStatus, confirmChange = true) => {
    const kit = inventory.find((item) => item.id === id)
    const label = status === "active" ? "activate" : status === "inactive" ? "deactivate" : "move to draft"
    if (confirmChange && status !== "active" && !(await confirmAction(`Are you sure you want to ${label} ${kit.name || `jersey #${id}`}? It will be removed from the public storefront.`))) {
      return
    }

    setStatusState(id, status)
    updateInventoryKits([id], { status }).then(refreshInventory).catch(() => null)
  }

  const setStatusState = (id: number, status: KitStatus) => {
    setPrivateIds((current) => {
      const withoutCurrent = current.filter((privateId) => privateId !== id)
      return status === "inactive" ? [...withoutCurrent, id] : withoutCurrent
    })
    setDraftIds((current) => {
      const withoutCurrent = current.filter((draftId) => draftId !== id)
      return status === "draft" ? [...withoutCurrent, id] : withoutCurrent
    })
  }

  const removeKit = async (id: number) => {
    const kit = inventory.find((item) => item.id === id)
    if (!(await confirmAction(`Are you sure you want to remove ${kit.name || `jersey #${id}`} from the storefront? You can restore it from Removed Jerseys.`))) {
      return
    }

    setRemovedIds((current) => [...new Set([...current, id])])
    updateInventoryKits([id], { isRemoved: true }).then(refreshInventory).catch(() => null)
  }

  const removeEditingKit = async () => {
    if (!form.id) return

    const kit = inventory.find((item) => item.id === form.id)
    if (!(await confirmAction(`Are you sure you want to remove ${kit.name || form.name || `jersey #${form.id}`} from the storefront? You can restore it from Removed Jerseys.`))) {
      return
    }

    setRemovedIds((current) => [...new Set([...current, form.id as number])])
    updateInventoryKits([form.id], { isRemoved: true }).then(refreshInventory).catch(() => null)
    setIsFormOpen(false)
    setForm(emptyForm)
  }

  const undoRemove = (id?: number) => {
    setRemovedIds((current) => {
      if (typeof id === "number") {
        return current.filter((removedId) => removedId !== id)
      }
      return current.slice(0, -1)
    })
    if (typeof id === "number") {
      updateInventoryKits([id], { isRemoved: false }).then(refreshInventory).catch(() => null)
    }
  }

  const deleteRemovedKit = async (id: number) => {
    const kit = inventory.find((item) => item.id === id)
    if (!kit) return
    if (!(await confirmAction(`Are you sure you want to permanently delete ${kit.name || `jersey #${id}`}? This cannot be undone from the admin page.`))) {
      return
    }

    try {
      const result = await deleteInventoryKit(id)
      setRemovedIds((current) => current.filter((removedId) => removedId !== id))
      setPrivateIds((current) => current.filter((privateId) => privateId !== id))
      setDraftIds((current) => current.filter((draftId) => draftId !== id))
      setCustomKits((current) => current.filter((customKit) => customKit.id !== id))
      setKitEdits((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
      setServerInventory((current) => current ? current.filter((item) => item.id !== id) : current)
      await refreshInventory()
      import("sonner").then(({ toast }) => toast.success(`${kit.name || "Jersey"} deleted.${result.albumPhotosRemoved ? ` Removed ${result.albumPhotosRemoved} matching album photo${result.albumPhotosRemoved === 1 ? "" : "s"}.` : ""}`))
    } catch (error) {
      import("sonner").then(({ toast }) => toast.error(error instanceof Error ? error.message : "Could not delete this jersey."))
    }
  }

  const resetEdit = async (kit: EditableKit) => {
    if (!(await confirmAction(`Are you sure you want to reset edits for ${kit.name}?`))) {
      return
    }

    if (kit.isCustom) {
      setCustomKits((current) => current.filter((customKit) => customKit.id !== kit.id))
      setRemovedIds((current) => current.filter((id) => id !== kit.id))
      setPrivateIds((current) => current.filter((id) => id !== kit.id))
      setDraftIds((current) => current.filter((id) => id !== kit.id))
      return
    }

    setKitEdits((current) => {
      const next = { ...current }
      delete next[kit.id]
      return next
    })
  }

  const setMultipleKitsStatus = async (ids: number[], status: KitStatus) => {
    const label = status === "active" ? "activate" : status === "inactive" ? "deactivate" : "move to draft"
    if (status !== "active" && !(await confirmAction(`Are you sure you want to ${label} ${ids.length} selected jersey${ids.length === 1 ? "" : "s"}?`))) {
      return false
    }

    setPrivateIds((current) => {
      const withoutIds = current.filter((id) => !ids.includes(id))
      return status === "inactive" ? [...withoutIds, ...ids] : withoutIds
    })
    setDraftIds((current) => {
      const withoutIds = current.filter((id) => !ids.includes(id))
      return status === "draft" ? [...withoutIds, ...ids] : withoutIds
    })
    setSelectedIds([])
    updateInventoryKits(ids, { status }).then(refreshInventory).catch(() => null)
    import("sonner").then(({ toast }) => {
      toast.success(`Updated status to ${getStatusLabel(status)} for selected items.`)
    })
    return true
  }

  const setMultipleKitsStock = async (ids: number[], newStock: number) => {
    if (ids.length === 0) {
      import("sonner").then(({ toast }) => toast.error("Select at least one jersey."))
      return
    }

    const customKitIds = customKits.map((k) => k.id)
    const baseIdsToEdit = ids.filter((id) => !customKitIds.includes(id))
    const customIdsToEdit = ids.filter((id) => customKitIds.includes(id))
    const updates = {
      sizeStock: Object.fromEntries(KIT_SIZES.map((size) => [size, newStock])) as Record<KitSize, number>,
      stock: newStock * KIT_SIZES.length,
    }

    if (baseIdsToEdit.length > 0) {
      setKitEdits((current) => {
        const next = { ...current }
        baseIdsToEdit.forEach((id) => {
          next[id] = {
            ...(next[id] || {}),
            ...updates,
          }
        })
        return next
      })
    }

    if (customIdsToEdit.length > 0) {
      setCustomKits((current) =>
        current.map((kit) => {
          if (customIdsToEdit.includes(kit.id)) {
            return {
              ...kit,
              ...updates,
            }
          }
          return kit
        })
      )
    }

    try {
      const savedKits = await updateInventoryKits(ids, updates)
      if (savedKits.length > 0) {
        setServerInventory((current) => mergeSavedInventory(current || inventory, savedKits))
      }
      setSelectedIds([])
      refreshInventory()
      import("sonner").then(({ toast }) => {
        toast.success(`Updated every size to ${newStock} for ${ids.length} item(s).`)
      })
    } catch (error) {
      import("sonner").then(({ toast }) => {
        toast.error(error instanceof Error ? error.message : "Could not update stock.")
      })
    }
  }

  const removeMultipleKits = async (ids: number[]) => {
    if (!(await confirmAction(`Are you sure you want to remove ${ids.length} selected jersey${ids.length === 1 ? "" : "s"} from the storefront?`))) {
      return
    }

    setRemovedIds((current) => [...new Set([...current, ...ids])])
    setSelectedIds([])
    updateInventoryKits(ids, { isRemoved: true }).then(refreshInventory).catch(() => null)
  }

  return (
    <>
      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <StatCard icon={<Boxes className="w-5 h-5" />} label="Active Products" value={activeKits.length.toString()} />
        <StatCard icon={<PackageCheck className="w-5 h-5" />} label="Estimated Stock" value={totalStock.toString()} />
        <StatCard icon={<IndianRupee className="w-5 h-5" />} label="Inventory Value" value={`₹${totalValue.toLocaleString("en-IN")}`} />
        <StatCard icon={<UsersRound className="w-5 h-5" />} label="Customer Accounts" value={accountCount.toString()} />
      </section>
      {tabs && <div className="mb-6">{tabs}</div>}

      {isFormOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-background/80 px-4 py-6 backdrop-blur-sm sm:py-10">
          <form
            onSubmit={saveKit}
            className="mx-auto w-full max-w-5xl rounded-2xl border border-border bg-background p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h2 className="font-black text-xl tracking-tight">{form.id ? "Edit Jersey" : "Add Jersey"}</h2>
                <p className="text-sm text-muted-foreground">Add photo, price, number, color, club, season, and badge.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-secondary"
                aria-label="Close editor"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formMessage && (
              <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-bold text-red-500">
                {formMessage}
              </div>
            )}

            <div className="grid lg:grid-cols-[180px_1fr] gap-5">
              <div className="space-y-4">
                <JerseyImageEditor
                  label="Front Image"
                  value={form.image}
                  emptyLabel="No Front"
                  alt={form.name || "Jersey front preview"}
                  isSaving={savingImageField === "image"}
                  onUpload={(image) => saveImageField("image", image)}
                  onRemove={() => saveImageField("image", "")}
                />
                <JerseyImageEditor
                  label="Back Image"
                  value={form.backImage}
                  emptyLabel="No Back"
                  alt={form.name || "Jersey back preview"}
                  isSaving={savingImageField === "backImage"}
                  onUpload={(backImage) => saveImageField("backImage", backImage)}
                  onRemove={() => saveImageField("backImage", "")}
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
              <FormField label="Player" value={form.name} onChange={(name) => setForm((current) => ({ ...current, name }))} />
              <FormField label="Club / Style" value={form.club} onChange={(club) => setForm((current) => ({ ...current, club }))} />
              <FormField label="Season" value={form.season} onChange={(season) => setForm((current) => ({ ...current, season }))} />
              <FormField label="Price" value={form.price} type="number" onChange={(price) => setForm((current) => ({ ...current, price }))} />
              <div className="sm:col-span-2 space-y-2">
                <span className="block text-xs font-black uppercase tracking-widest text-muted-foreground">Size Stock</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {KIT_SIZES.map((size) => (
                    <label key={size} className="space-y-1">
                      <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">{size}</span>
                      <input
                        type="number"
                        min="0"
                        value={form.sizeStock[size]}
                        onChange={(event) => {
                          const value = event.target.value
                          setForm((current) => {
                            const next = {
                              ...current,
                              sizeStock: { ...current.sizeStock, [size]: value },
                            }
                            formRef.current = next
                            return next
                          })
                        }}
                        className="w-full h-11 rounded-xl border border-border bg-secondary/30 px-3 outline-none focus:border-accent"
                      />
                    </label>
                  ))}
                </div>
              </div>
              <FormField label="Number" value={form.number} onChange={(number) => setForm((current) => ({ ...current, number }))} />
              <FormField label="Color" value={form.color} onChange={(color) => setForm((current) => ({ ...current, color }))} />
              <FormField label="League" value={form.league} onChange={(league) => setForm((current) => ({ ...current, league }))} />
                <FormField label="Badge" value={form.badge} onChange={(badge) => setForm((current) => ({ ...current, badge }))} placeholder="Optional" />
                <label className="sm:col-span-2 space-y-2">
                  <span className="block text-xs font-black uppercase tracking-widest text-muted-foreground">Description</span>
                  <textarea
                    value={form.description}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Story, fit notes, material, or anything customers should know."
                    rows={4}
                    className="w-full rounded-xl border border-border bg-secondary/30 px-3 py-3 text-sm outline-none focus:border-accent"
                  />
                </label>

                <label className="sm:col-span-2 space-y-2">
                  <span className="block text-xs font-black uppercase tracking-widest text-muted-foreground">Status</span>
                  <select
                    value={form.status}
                    onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as KitStatus }))}
                    className="w-full h-11 rounded-xl border border-border bg-secondary/30 px-3 outline-none focus:border-accent"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="draft">Draft</option>
                  </select>
                </label>

                <div className="sm:col-span-2 flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={isSavingKit}
                    className="inline-flex items-center justify-center gap-2 h-12 px-5 rounded-xl bg-foreground text-background text-xs font-black uppercase tracking-widest disabled:opacity-60"
                  >
                    <Save className="w-4 h-4" />
                    {isSavingKit ? "Saving..." : "Save Jersey"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="inline-flex items-center justify-center h-12 px-5 rounded-xl border border-border text-xs font-black uppercase tracking-widest hover:bg-secondary"
                  >
                    Cancel
                  </button>
                  {form.id && (
                    <button
                      type="button"
                      onClick={removeEditingKit}
                      className="inline-flex items-center justify-center gap-2 h-12 px-5 rounded-xl border border-red-500/30 text-red-500 text-xs font-black uppercase tracking-widest hover:bg-red-500/10 sm:ml-auto"
                    >
                      <Trash2 className="w-4 h-4" />
                      Remove Jersey
                    </button>
                  )}
                </div>
              </div>
            </div>
          </form>
        </div>
      )}

      {removedKits.length > 0 && (
        <div className="mb-6 rounded-2xl border border-accent/30 bg-accent/10 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-black">Removed {removedKits.length} jersey{removedKits.length === 1 ? "" : "s"}</p>
            <p className="text-xs text-muted-foreground">Latest: {removedKits[removedKits.length - 1].name}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => undoRemove()}
              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-foreground text-background text-xs font-black uppercase tracking-widest"
            >
              <RotateCcw className="w-4 h-4" />
              Undo Last
            </button>
            <button
              onClick={() => deleteRemovedKit(removedKits[removedKits.length - 1].id)}
              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl border border-red-500/30 text-red-500 text-xs font-black uppercase tracking-widest hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4" />
              Delete Forever
            </button>
          </div>
        </div>
      )}

      <div className="border border-border rounded-2xl overflow-hidden bg-background/85 shadow-sm">
        <div className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="font-black text-xl tracking-tight">Inventory</h2>
            <p className="text-sm text-muted-foreground">Active jerseys are published. Inactive and draft jerseys stay off the storefront.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-black uppercase tracking-widest bg-accent/10 text-accent px-3 py-1 rounded-full">
              {activeKits.length} active
            </span>
            <button
              onClick={openAddForm}
              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-foreground text-background text-xs font-black uppercase tracking-widest"
            >
              <Plus className="w-4 h-4" />
              Add Jersey
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-b border-border bg-secondary/20 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="inline-grid grid-cols-3 rounded-xl border border-border bg-background p-1">
            <button
              type="button"
              onClick={() => setInventoryTab("active")}
              className={`h-10 px-4 rounded-lg text-xs font-black uppercase tracking-widest transition-colors ${
                inventoryTab === "active" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Active ({activeKits.length})
            </button>
            <button
              type="button"
              onClick={() => setInventoryTab("inactive")}
              className={`h-10 px-4 rounded-lg text-xs font-black uppercase tracking-widest transition-colors ${
                inventoryTab === "inactive" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Inactive ({inactiveKits.length})
            </button>
            <button
              type="button"
              onClick={() => setInventoryTab("draft")}
              className={`h-10 px-4 rounded-lg text-xs font-black uppercase tracking-widest transition-colors ${
                inventoryTab === "draft" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Drafts ({draftKits.length})
            </button>
          </div>
          <label className="relative block w-full xl:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={inventorySearch}
              onChange={(event) => setInventorySearch(event.target.value)}
              placeholder="Search player, club, number, color..."
              className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-10 text-sm font-bold outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-accent"
            />
            {inventorySearch && (
              <button
                type="button"
                onClick={() => setInventorySearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Clear inventory search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={() => {
              const visibleIds = filteredDisplayedKits.map((kit) => kit.id)
              setSelectedIds((current) =>
                visibleIds.length > 0 && visibleIds.every((id) => current.includes(id)) ? [] : visibleIds
              )
            }}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-4 text-xs font-black uppercase tracking-widest hover:bg-secondary"
          >
            {filteredDisplayedKits.length > 0 && filteredDisplayedKits.every((kit) => selectedIds.includes(kit.id))
              ? "Deselect All"
              : "Select All"}
          </button>
        </div>

        <div className="overflow-x-auto lg:overflow-visible">
          <table className="block w-full text-sm">
            <thead className="hidden bg-secondary/60 text-muted-foreground">
              <tr className="text-left">
                <th className="w-12 px-5 py-3 text-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-border text-accent focus:ring-accent bg-secondary/50 cursor-pointer"
                    checked={filteredDisplayedKits.length > 0 && selectedIds.length === filteredDisplayedKits.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(filteredDisplayedKits.map((kit) => kit.id))
                      } else {
                        setSelectedIds([])
                      }
                    }}
                  />
                </th>
                <th className="px-5 py-3 font-black uppercase tracking-widest text-[10px]">Item</th>
                <th className="px-5 py-3 font-black uppercase tracking-widest text-[10px]">Number</th>
                <th className="px-5 py-3 font-black uppercase tracking-widest text-[10px]">Color</th>
                <th className="px-5 py-3 font-black uppercase tracking-widest text-[10px]">League</th>
                <th className="px-5 py-3 font-black uppercase tracking-widest text-[10px]">Size Stock</th>
                <th className="px-5 py-3 font-black uppercase tracking-widest text-[10px]">Status</th>
                <th className="px-5 py-3 font-black uppercase tracking-widest text-[10px] text-right">Price</th>
                <th className="px-5 py-3 font-black uppercase tracking-widest text-[10px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="block divide-y divide-border/60">
              {filteredDisplayedKits.map((kit, index) => (
                <tr
                  key={kit.id}
                  id={`inventory-kit-${kit.id}`}
                  onClick={() => setFocusedKitId(kit.id)}
                  className={`grid min-w-0 gap-3 p-4 transition-colors hover:bg-secondary/30 lg:grid-cols-[34px_minmax(230px,1.35fr)_64px_minmax(130px,0.85fr)_minmax(130px,0.75fr)_minmax(144px,0.8fr)_86px_88px_minmax(260px,1.25fr)] lg:items-center ${selectedIds.includes(kit.id) ? "bg-accent/5" : ""} ${focusedKitId === kit.id ? "ring-2 ring-accent/60" : ""}`}
                >
                  <td className="block lg:text-center">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-border text-accent focus:ring-accent bg-secondary/50 cursor-pointer"
                      checked={selectedIds.includes(kit.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds((current) => [...current, kit.id])
                        } else {
                          setSelectedIds((current) => current.filter((id) => id !== kit.id))
                        }
                      }}
                    />
                  </td>
                  <td className="block min-w-0">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="w-12 aspect-square rounded-lg overflow-hidden relative bg-muted border border-border flex-shrink-0">
                        <ProductImage src={kit.image} alt={kit.name} className="object-cover" priority={index < 12} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link href={`/kit/${kit.id}`} className="block truncate font-black hover:text-accent">
                          {kit.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{kit.club}  -  {kit.season}</p>
                        {kit.isCustom && <p className="text-[10px] font-black uppercase tracking-widest text-accent">Custom item</p>}
                      </div>
                    </div>
                  </td>
                  <td className="block font-black before:mr-2 before:text-[10px] before:font-black before:uppercase before:tracking-widest before:text-muted-foreground before:content-['Number'] lg:before:hidden">{kit.number}</td>
                  <td className="block before:mr-2 before:text-[10px] before:font-black before:uppercase before:tracking-widest before:text-muted-foreground before:content-['Color'] lg:before:hidden">{kit.color}</td>
                  <td className="block before:mr-2 before:text-[10px] before:font-black before:uppercase before:tracking-widest before:text-muted-foreground before:content-['League'] lg:before:hidden">{kit.league}</td>
                  <td className="block">
                    <div className="flex flex-wrap gap-1.5">
                      {KIT_SIZES.map((size) => (
                        <span key={size} className="rounded-lg border border-border bg-secondary/30 px-2 py-1 text-[10px] font-black">
                          {size}: {normalizeSizeStock(kit)[size]}
                        </span>
                      ))}
                      {getKitStock(kit) > 0 && getKitStock(kit) <= 5 && (
                        <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-amber-600">
                          Low stock
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="block">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${getStatusClass(getKitStatus(kit.id))}`}>
                      {getStatusLabel(getKitStatus(kit.id))}
                    </span>
                  </td>
                  <td className="block font-black text-accent lg:text-right">₹{kit.price.toLocaleString("en-IN")}</td>
                  <td className="block">
                    <div className="grid grid-cols-3 gap-1.5 lg:justify-end">
                      <button
                        onClick={() => openEditForm(kit)}
                        className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-border px-2 text-[10px] font-black uppercase tracking-widest hover:bg-secondary"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      {(kit.isCustom || kitEdits[kit.id]) && (
                        <button
                          onClick={() => resetEdit(kit)}
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-border px-2 text-[10px] font-black uppercase tracking-widest hover:bg-secondary"
                        >
                          Reset
                        </button>
                      )}
                      {getKitStatus(kit.id) !== "active" ? (
                        <button
                          onClick={() => setKitStatus(kit.id, "active")}
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-emerald-500/30 px-2 text-[10px] font-black uppercase tracking-widest text-emerald-500 hover:bg-emerald-500/10"
                        >
                          Activate
                        </button>
                      ) : (
                        <button
                          onClick={() => setKitStatus(kit.id, "inactive")}
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-border px-2 text-[10px] font-black uppercase tracking-widest hover:bg-secondary"
                        >
                          Deactivate
                        </button>
                      )}
                      {getKitStatus(kit.id) !== "draft" && (
                        <button
                          onClick={() => setKitStatus(kit.id, "draft")}
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-amber-500/30 px-2 text-[10px] font-black uppercase tracking-widest text-amber-600 hover:bg-amber-500/10"
                        >
                          Draft
                        </button>
                      )}
                      <button
                        onClick={() => removeKit(kit.id)}
                        className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-red-500/30 px-2 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </button>
                      <button
                        onClick={() => deleteRemovedKit(kit.id)}
                        className="inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-red-600 px-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-red-700"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete Forever
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredDisplayedKits.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center">
                    <p className="font-black text-sm">
                      {inventorySearch.trim() ? "No jerseys match your search" : `No ${inventoryTab} jerseys`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {inventorySearch.trim() ? "Try a player, club, number, color, league, or season." : "Move a jersey into this tab from the actions menu."}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {removedKits.length > 0 && (
        <div className="mt-6 border border-border rounded-2xl bg-background/85 p-5 shadow-sm">
          <h2 className="font-black text-xl tracking-tight mb-4">Removed Jerseys</h2>
          <div className="space-y-3">
            {removedKits.map((kit) => (
              <div key={kit.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                <div>
                  <p className="font-black text-sm">{kit.name}</p>
                  <p className="text-xs text-muted-foreground">{kit.club}  -  {kit.number}  -  {kit.color}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                  <button
                    onClick={() => undoRemove(kit.id)}
                    className="inline-flex items-center justify-center gap-2 h-9 px-3 rounded-lg bg-secondary text-xs font-black uppercase tracking-widest hover:bg-secondary/80"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Restore
                  </button>
                  <button
                    onClick={() => deleteRemovedKit(kit.id)}
                    className="inline-flex items-center justify-center gap-2 h-9 px-3 rounded-lg border border-red-500/30 text-red-500 text-xs font-black uppercase tracking-widest hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Forever
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Floating Bulk Actions Bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-3 left-1/2 z-50 max-h-[70vh] w-[calc(100%-1rem)] max-w-5xl -translate-x-1/2 overflow-y-auto rounded-2xl border border-border bg-background/95 p-3 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-300 sm:bottom-6 sm:w-[calc(100%-2rem)] sm:p-4">
          <div className="flex flex-col items-stretch justify-between gap-4 md:flex-row md:items-center">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent/15 text-accent flex items-center justify-center font-black text-sm">
                {selectedIds.length}
              </div>
              <div>
                <p className="text-sm font-black tracking-tight text-foreground">Jerseys Selected</p>
                <p className="text-xs text-muted-foreground">Perform bulk changes on selection.</p>
              </div>
            </div>

            <div className="grid w-full gap-3 sm:grid-cols-2 md:flex md:w-auto md:flex-wrap md:items-center md:justify-center">
              {/* Status Update */}
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Status:</span>
                <select
                  onChange={async (e) => {
                    if (e.target.value) {
                      await setMultipleKitsStatus(selectedIds, e.target.value as KitStatus)
                      e.target.value = ""
                    }
                  }}
                  defaultValue=""
                  className="h-9 rounded-lg border border-border bg-secondary/30 px-3 outline-none focus:border-accent text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                  <option value="" disabled hidden>Change Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="draft">Draft</option>
                </select>
              </div>

              {/* Stock Update */}
              <div className="flex min-w-0 items-center gap-1.5 rounded-lg border border-border bg-secondary/10 px-2 h-9">
                <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">All sizes:</span>
                <input
                  id="bulk-stock-input"
                  type="number"
                  placeholder="Qty"
                  min="0"
                  className="w-14 bg-transparent border-0 outline-none text-xs font-bold text-center h-full text-foreground [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const val = parseInt((e.target as HTMLInputElement).value)
                      if (!isNaN(val) && val >= 0) {
                        setMultipleKitsStock(selectedIds, val)
                        ;(e.target as HTMLInputElement).value = ""
                      }
                    }
                  }}
                />
                <button
                  onClick={() => {
                    const input = document.getElementById("bulk-stock-input") as HTMLInputElement
                    if (input) {
                      const val = parseInt(input.value)
                      if (!isNaN(val) && val >= 0) {
                        setMultipleKitsStock(selectedIds, val)
                        input.value = ""
                      } else {
                        import("sonner").then(({ toast }) => {
                          toast.error("Please enter a valid stock quantity.")
                        })
                      }
                    }
                  }}
                  className="text-[10px] font-black uppercase tracking-widest bg-foreground text-background px-2.5 py-1 rounded-md hover:bg-foreground/90 transition-colors h-6 flex items-center justify-center cursor-pointer"
                >
                  Apply
                </button>
              </div>

              {/* Delete Selection */}
              <button
                onClick={() => removeMultipleKits(selectedIds)}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 text-xs font-black uppercase tracking-widest transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                Remove
              </button>

              {/* Deselect All */}
              <button
                onClick={() => setSelectedIds([])}
                className="inline-flex items-center justify-center h-9 px-3 rounded-lg border border-border hover:bg-secondary text-xs font-black uppercase tracking-widest transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ProductImage({ src, alt, className, priority = false }: { src: string; alt: string; className?: string; priority?: boolean }) {
  if (src.startsWith("data:")) {
    return <img src={src} alt={alt} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} data-load-gate={priority ? "true" : undefined} className={`w-full h-full ${className || ""}`} />
  }

  return <Image src={src} alt={alt} fill className={className} sizes="180px" quality={100} priority={priority} data-load-gate={priority ? "true" : undefined} />
}

function JerseyImageEditor({
  label,
  value,
  emptyLabel,
  alt,
  isSaving = false,
  onUpload,
  onRemove,
}: {
  label: string
  value: string
  emptyLabel: string
  alt: string
  isSaving?: boolean
  onUpload: (image: string) => void | Promise<void>
  onRemove: () => void
}) {
  const [cropSource, setCropSource] = useState("")
  const [cropZoom, setCropZoom] = useState(1)
  const [cropX, setCropX] = useState(0)
  const [cropY, setCropY] = useState(0)
  const [cropMessage, setCropMessage] = useState("")
  const [isPreparingEdit, setIsPreparingEdit] = useState(false)
  const imageRef = useRef<HTMLImageElement | null>(null)

  const closeCropper = () => {
    setCropSource("")
    setCropZoom(1)
    setCropX(0)
    setCropY(0)
    setCropMessage("")
  }

  const saveCrop = async () => {
    if (!cropSource) return
    setCropMessage("")

    try {
      const cropped = await cropImageToPortrait(cropSource, cropZoom, cropX, cropY)
      await onUpload(cropped)
      closeCropper()
    } catch (error) {
      setCropMessage(error instanceof Error ? error.message : "Could not crop this image. Try another file.")
    }
  }

  const removeImage = async () => {
    onRemove()
  }

  const editImage = async () => {
    if (!value) return
    setIsPreparingEdit(true)
    setCropMessage("")
    try {
      const editableSource = value.startsWith("data:image/") ? value : await imageUrlToDataUrl(value)
      setCropSource(editableSource)
      setCropZoom(1)
      setCropX(0)
      setCropY(0)
    } catch (error) {
      console.error("Could not open image for crop editing:", { value, error })
      setCropMessage(error instanceof Error ? error.message : "Could not open this image for editing.")
    } finally {
      setIsPreparingEdit(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">{label}</span>
        {value && (
          <button
            type="button"
            onClick={removeImage}
            className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:underline"
          >
            Remove
          </button>
        )}
      </div>
      <div className="aspect-square overflow-hidden rounded-2xl border border-border bg-white relative">
        {value ? (
          <ProductImage src={value} alt={alt} className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs font-black uppercase tracking-widest text-muted-foreground">
            {emptyLabel}
          </div>
        )}
      </div>
      <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border text-xs font-black uppercase tracking-widest hover:bg-secondary">
        <Upload className="w-4 h-4" />
        Change {label}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            if (!file) return
            const image = await fileToDataUrl(file)
            setCropSource(image)
            setCropZoom(1)
            setCropX(0)
            setCropY(0)
            event.currentTarget.value = ""
          }}
        />
      </label>
      {value && (
        <button
          type="button"
          onClick={editImage}
          disabled={isPreparingEdit}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border text-xs font-black uppercase tracking-widest hover:bg-secondary disabled:opacity-60"
        >
          <Crop className="w-4 h-4" />
          {isPreparingEdit ? "Opening Image..." : "Edit Crop"}
        </button>
      )}
      {cropMessage && !cropSource && <p className="text-xs font-bold text-red-500">{cropMessage}</p>}
      {cropSource && (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-background/85 px-4 py-6 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-xl rounded-2xl border border-border bg-background p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-black tracking-tight">Crop {label}</h3>
                <p className="text-xs text-muted-foreground">Frame the jersey inside the box before saving.</p>
              </div>
              <button
                type="button"
                onClick={closeCropper}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-secondary"
                aria-label="Close cropper"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mx-auto aspect-square max-h-[60vh] w-full max-w-sm overflow-hidden rounded-2xl border-2 border-accent/40 bg-white">
              <img
                ref={imageRef}
                src={cropSource}
                alt={`${label} crop preview`}
                className="h-full w-full object-contain"
                style={{
                  transform: `translate(${cropX}%, ${cropY}%) scale(${cropZoom})`,
                  transformOrigin: "center",
                }}
              />
            </div>

            <div className="mt-4 grid gap-3">
              <CropSlider label="Zoom" min={1} max={3} step={0.05} value={cropZoom} onChange={setCropZoom} />
              <CropSlider label="Move left / right" min={-40} max={40} step={1} value={cropX} onChange={setCropX} />
              <CropSlider label="Move up / down" min={-40} max={40} step={1} value={cropY} onChange={setCropY} />
            </div>

            {cropMessage && <p className="mt-3 text-xs font-bold text-red-500">{cropMessage}</p>}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={saveCrop}
                disabled={isSaving}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-xs font-black uppercase tracking-widest text-background disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {isSaving ? "Saving Crop..." : "Save Crop"}
              </button>
              <button
                type="button"
                onClick={closeCropper}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-4 text-xs font-black uppercase tracking-widest hover:bg-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CropSlider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="space-y-1">
      <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-current"
      />
    </label>
  )
}

function FormField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <label className="space-y-2">
      <span className="block text-xs font-black uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full h-11 rounded-xl border border-border bg-secondary/30 px-3 outline-none focus:border-accent"
      />
    </label>
  )
}

function useStoredNumberArray(key: string) {
  const [items, setItemsState] = useState<number[]>([])

  useEffect(() => {
    const stored = window.localStorage.getItem(key)
    if (!stored) return

    try {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        setItemsState(parsed.filter((id) => typeof id === "number"))
      }
    } catch {
      window.localStorage.removeItem(key)
    }
  }, [key])

  const setItems = (updater: (current: number[]) => number[]) => {
    setItemsState((current) => {
      const next = updater(current)
      window.localStorage.setItem(key, JSON.stringify(next))
      return next
    })
  }

  return [items, setItems] as const
}

function useStoredKits(key: string) {
  const [items, setItemsState] = useState<EditableKit[]>([])

  useEffect(() => {
    const stored = window.localStorage.getItem(key)
    if (!stored) return

    try {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        setItemsState(parsed)
      }
    } catch {
      window.localStorage.removeItem(key)
    }
  }, [key])

  const setItems = (updater: (current: EditableKit[]) => EditableKit[]) => {
    setItemsState((current) => {
      const next = updater(current)
      window.localStorage.setItem(key, JSON.stringify(next))
      return next
    })
  }

  return [items, setItems] as const
}

function useStoredEdits() {
  const [items, setItemsState] = useState<Record<number, Partial<EditableKit>>>({})

  useEffect(() => {
    const stored = window.localStorage.getItem(KIT_EDITS_KEY)
    if (!stored) return

    try {
      const parsed = JSON.parse(stored)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        setItemsState(parsed)
      }
    } catch {
      window.localStorage.removeItem(KIT_EDITS_KEY)
    }
  }, [])

  const setItems = (updater: (current: Record<number, Partial<EditableKit>>) => Record<number, Partial<EditableKit>>) => {
    setItemsState((current) => {
      const next = updater(current)
      window.localStorage.setItem(KIT_EDITS_KEY, JSON.stringify(next))
      return next
    })
  }

  return [items, setItems] as const
}

function createCustomId(inventory: EditableKit[]) {
  const highestId = inventory.reduce((max, kit) => Math.max(max, kit.id), 0)
  return highestId + 1
}

function mergeSavedInventory(current: EditableKit[], savedKits: EditableKit[]) {
  const savedById = new Map(savedKits.map((kit) => [kit.id, kit]))
  const next = current.map((kit) => savedById.get(kit.id) || kit)
  const currentIds = new Set(current.map((kit) => kit.id))

  return [
    ...next,
    ...savedKits.filter((kit) => !currentIds.has(kit.id)),
  ]
}

function kitFromForm(form: KitForm, previousKit: EditableKit | undefined, customKits: EditableKit[]) {
  const price = Number(form.price)
  const sizeStock = Object.fromEntries(
    KIT_SIZES.map((size) => [size, Math.max(0, Math.floor(Number(form.sizeStock[size])))])
  ) as Record<KitSize, number>
  const image = form.image || form.backImage || previousKit.image || DEFAULT_JERSEY_IMAGE
  const backImage = form.backImage || form.image || previousKit.backImage || image

  return {
    ...(previousKit || {}),
    id: form.id || previousKit.id || createCustomId(customKits),
    name: form.name.trim() || previousKit.name || "Custom Jersey",
    club: form.club.trim() || previousKit.club || "Custom",
    season: form.season.trim() || previousKit.season || "Custom",
    price: Number.isFinite(price) && price > 0 ? price : previousKit.price || 1299,
    sizeStock,
    stock: KIT_SIZES.reduce((sum, size) => sum + sizeStock[size], 0),
    number: form.number.trim() || previousKit.number || "#",
    league: form.league.trim() || previousKit.league || "Custom",
    gradient: gradientFromColor(form.color || previousKit.color || "Custom"),
    badge: form.badge.trim() || previousKit.badge || null,
    description: form.description.trim() || previousKit.description || "",
    image,
    color: form.color.trim() || previousKit.color || "Custom",
    backImage,
    isCustom: !form.id || customKits.some((customKit) => customKit.id === form.id) || !!previousKit.isCustom,
  } as EditableKit
}

function gradientFromColor(color: string) {
  const normalized = color.toLowerCase()

  if (normalized.includes("red") && normalized.includes("black")) return "from-red-700 via-black to-red-950"
  if (normalized.includes("blue") && normalized.includes("red")) return "from-blue-800 via-red-700 to-blue-900"
  if (normalized.includes("blue") && normalized.includes("black")) return "from-blue-800 via-black to-blue-950"
  if (normalized.includes("yellow") && normalized.includes("green")) return "from-yellow-300 via-green-500 to-green-800"
  if (normalized.includes("white")) return "from-white via-gray-100 to-slate-300"
  if (normalized.includes("purple")) return "from-purple-300 via-purple-500 to-purple-800"
  if (normalized.includes("maroon")) return "from-[#5C1E2E] via-[#7A243A] to-[#2B0E18]"
  if (normalized.includes("blue")) return "from-blue-500 via-blue-700 to-blue-950"
  if (normalized.includes("red")) return "from-red-600 via-red-700 to-black"
  if (normalized.includes("black")) return "from-zinc-900 via-black to-zinc-700"

  return "from-zinc-700 via-zinc-900 to-black"
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function imageUrlToDataUrl(url: string) {
  return fetchEditableImageThroughServer(url)
}

async function fetchEditableImageThroughServer(url: string) {
  const proxyResponse = await fetch(`/api/inventory/upload-image?url=${encodeURIComponent(url)}`, { cache: "no-store" })
  const data = await proxyResponse.json().catch(() => null)
  if (!proxyResponse.ok || typeof data.dataUrl !== "string") {
    throw new Error(data.error || "Could not load this image for editing.")
  }
  return data.dataUrl
}

async function compressKitImages(kit: EditableKit) {
  const image = await uploadImageForStorage(kit.image, kit.id, "front")
  const backImage = await uploadImageForStorage(kit.backImage || kit.image, kit.id, "back")

  return {
    ...kit,
    image,
    backImage,
  }
}

async function uploadImageForStorage(source: string, kitId: number, side: "front" | "back") {
  const compressed = await compressImageForStorage(source)
  if (!compressed.startsWith("data:image/")) return compressed
  return uploadJerseyImage(compressed, { kitId, side, previousUrl: "" })
}

async function saveSingleImageField(
  field: "image" | "backImage",
  source: string,
  kitId: number,
  previousKit: EditableKit | undefined,
) {
  const side = field === "image" ? "front" : "back"
  const previousUrl = field === "image" ? previousKit.image || "" : previousKit.backImage || ""

  if (!source) {
    if (previousUrl) await deleteJerseyImage(previousUrl)
    return ""
  }

  const compressed = await compressImageForStorage(source)
  if (!compressed.startsWith("data:image/")) return compressed

  return uploadJerseyImage(compressed, { kitId, side, previousUrl })
}

async function cleanupReplacedJerseyImages(previousKit: EditableKit | undefined, nextKit: EditableKit) {
  if (!previousKit) return

  const previousFront = previousKit.image || ""
  const previousBack = previousKit.backImage || ""
  const nextUrls = new Set([nextKit.image, nextKit.backImage].filter(Boolean))

  if (previousFront && previousFront !== nextKit.image && !nextUrls.has(previousFront)) {
    await deleteJerseyImage(previousFront)
  }

  if (previousBack && previousBack !== nextKit.backImage && !nextUrls.has(previousBack)) {
    await deleteJerseyImage(previousBack)
  }
}

async function compressImageForStorage(source: string) {
  if (!source.startsWith("data:image/")) return source
  if (estimateDataUrlBytes(source) < 650_000) return source

  return resizeImageDataUrl(source, 700, 0.78)
}

function estimateDataUrlBytes(source: string) {
  const base64 = source.split(",")[1] || ""
  return Math.ceil((base64.length * 3) / 4)
}

function cropImageToPortrait(source: string, zoom: number, offsetXPercent: number, offsetYPercent: number) {
  return resizeImageDataUrl(source, 700, 0.78, zoom, offsetXPercent, offsetYPercent)
}

async function uploadJerseyImage(
  image: string,
  options: {
    kitId: number | string
    side: "front" | "back"
    previousUrl: string
  },
) {
  const response = await fetch("/api/inventory/upload-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image,
      kitId: options.kitId,
      side: options.side,
      previousUrl: options.previousUrl,
    }),
  })
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(data.error || "Could not upload image to Supabase Storage.")
  }

  if (typeof data.publicUrl !== "string") {
    throw new Error("Supabase Storage did not return an image URL.")
  }

  return data.publicUrl
}

async function deleteJerseyImage(url: string) {
  if (!url.includes("/storage/v1/object/public/jersey-photos/")) return

  await fetch("/api/inventory/upload-image", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  }).catch(() => null)
}

function resizeImageDataUrl(source: string, size: number, quality: number, zoom = 1, offsetXPercent = 0, offsetYPercent = 0) {
  return new Promise<string>((resolve, reject) => {
    const image = document.createElement("img")
    image.onload = () => {
      const canvas = document.createElement("canvas")
      const width = size
      const height = size
      canvas.width = width
      canvas.height = height

      const context = canvas.getContext("2d")
      if (!context) {
        reject(new Error("Canvas is unavailable."))
        return
      }

      context.fillStyle = "#ffffff"
      context.fillRect(0, 0, width, height)
      const baseScale = Math.min(width / image.naturalWidth, height / image.naturalHeight)
      const drawWidth = image.naturalWidth * baseScale * zoom
      const drawHeight = image.naturalHeight * baseScale * zoom
      const x = (width - drawWidth) / 2 + (offsetXPercent / 100) * width
      const y = (height - drawHeight) / 2 + (offsetYPercent / 100) * height

      context.drawImage(image, x, y, drawWidth, drawHeight)
      resolve(canvas.toDataURL("image/webp", quality))
    }
    image.onerror = () => reject(new Error("Image could not be loaded."))
    image.src = source
  })
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="border border-border rounded-2xl bg-background/85 p-5 shadow-sm">
      <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-4">
        {icon}
      </div>
      <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-black tracking-tight">{value}</p>
    </div>
  )
}

function getInventoryValueStock(kit: Pick<EditableKit, "stock" | "sizeStock">) {
  if (kit.sizeStock) {
    return KIT_SIZES.reduce((sum, size) => {
      const value = kit.sizeStock?.[size]
      return sum + (typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0)
    }, 0)
  }

  return typeof kit.stock === "number" && Number.isFinite(kit.stock) ? Math.max(0, Math.floor(kit.stock)) : 0
}
