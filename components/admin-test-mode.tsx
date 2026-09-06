"use client"

import { useMemo, useState } from "react"
import { Banknote, CheckCircle2, ClipboardList, PackageCheck, RotateCcw, Truck, XCircle } from "lucide-react"
import { useSiteSettings } from "@/hooks/use-site-settings"
import type { Kit } from "@/lib/data"
import { createOrderId, saveOrder, type StoreOrder } from "@/lib/orders"

type TestResult = {
  name: string
  ok: boolean
  detail: string
}

const testCustomer = {
  name: "Test Customer",
  phone: "9876543210",
  email: "customer@example.com",
}

const testAddress = {
  ...testCustomer,
  address: "221 Test Street",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560001",
}

export function AdminTestMode({ kits }: { kits: Kit[] }) {
  const [email, setEmail] = useState(testCustomer.email)
  const [phone, setPhone] = useState(testCustomer.phone)
  const [isRunning, setIsRunning] = useState("")
  const [results, setResults] = useState<TestResult[]>([])
  const { testModeEnabled } = useSiteSettings()

  const testOrder = useMemo(() => buildTestOrder(kits, email, phone, testModeEnabled), [kits, email, phone, testModeEnabled])

  const addResult = (result: TestResult) => {
    setResults((current) => [result, ...current].slice(0, 8))
  }

  const runTest = async (name: string, action: () => Promise<string>) => {
    setIsRunning(name)
    try {
      const detail = await action()
      addResult({ name, ok: true, detail })
    } catch (error) {
      addResult({ name, ok: false, detail: error instanceof Error ? error.message : "Test failed." })
    } finally {
      setIsRunning("")
    }
  }

  const postJson = async (url: string, payload: unknown) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
    return data
  }

  const saveLocalTestOrder = async () => {
    saveOrder(testOrder)
    window.dispatchEvent(new StorageEvent("storage", { key: "terrace_orders" }))
    return `${testOrder.id} saved locally. Open Orders tab to inspect it.`
  }

  const testOrderEmail = async () => {
    const data = await postJson("/api/customer/order-email", testOrder)
    return data.emailSent ? `Order email sent to ${email}.` : "Order email route worked, but provider did not send."
  }

  const testShippingEmail = async () => {
    const shippedOrder: StoreOrder = {
      ...testOrder,
      fulfillmentStatus: "shipped",
      shippingId: "TEST-AWB-12345",
      shippedAt: new Date().toISOString(),
    }
    const data = await postJson("/api/customer/shipping-email", shippedOrder)
    return data.emailSent ? `Shipping email sent to ${email}.` : "Shipping email route worked, but provider did not send."
  }

  const testCancelEmail = async () => {
    const cancelledOrder: StoreOrder = {
      ...testOrder,
      fulfillmentStatus: "cancelled",
    }
    const data = await postJson("/api/customer/cancel-email", cancelledOrder)
    return data.emailSent ? `Cancellation email sent to ${email}.` : "Cancellation email route worked, but provider did not send."
  }

  const testRazorpayOrder = async () => {
    const data = await postJson("/api/razorpay/order", {
      amount: testOrder.total,
      address: testOrder.address,
      items: testOrder.items,
    })
    return `Razorpay test order created: ${data.orderId}. No payment was charged.`
  }

  const runEmailSuite = async () => {
    await runTest("Email Suite", async () => {
      const order = await testOrderEmail()
      const shipping = await testShippingEmail()
      const cancel = await testCancelEmail()
      return [order, shipping, cancel].join(" ")
    })
  }

  return (
    <div className="max-w-5xl space-y-6">
      <section className="rounded-2xl border border-border bg-background/85 p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-accent" />
          <h2 className="text-xl font-black tracking-tight">Test Mode</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="block text-xs font-black uppercase tracking-widest text-muted-foreground">Recipient Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-secondary/30 px-3 outline-none focus:border-accent"
            />
          </label>
          <label className="space-y-2">
            <span className="block text-xs font-black uppercase tracking-widest text-muted-foreground">Phone</span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-secondary/30 px-3 outline-none focus:border-accent"
            />
          </label>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <TestButton icon={<ClipboardList className="h-4 w-4" />} label="Create Test Order" busy={isRunning} onClick={() => runTest("Create Test Order", saveLocalTestOrder)} />
          <TestButton icon={<PackageCheck className="h-4 w-4" />} label="Order Email" busy={isRunning} onClick={() => runTest("Order Email", testOrderEmail)} />
          <TestButton icon={<Truck className="h-4 w-4" />} label="Shipping Email" busy={isRunning} onClick={() => runTest("Shipping Email", testShippingEmail)} />
          <TestButton icon={<XCircle className="h-4 w-4" />} label="Cancel Email" busy={isRunning} onClick={() => runTest("Cancel Email", testCancelEmail)} />
          <TestButton icon={<Banknote className="h-4 w-4" />} label="Razorpay Order" busy={isRunning} onClick={() => runTest("Razorpay Order", testRazorpayOrder)} />
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!!isRunning}
            onClick={runEmailSuite}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-xs font-black uppercase tracking-widest text-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            Run Email Suite
          </button>
          <button
            type="button"
            onClick={() => setResults([])}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-xs font-black uppercase tracking-widest hover:bg-secondary"
          >
            <RotateCcw className="h-4 w-4" />
            Clear Results
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-background/85 p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-black uppercase tracking-widest text-muted-foreground">Results</h3>
        {results.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Run a test to see pass/fail details here.</p>
        ) : (
          <div className="space-y-3">
            {results.map((result, index) => (
              <div key={`${result.name}-${index}`} className={`rounded-xl border p-4 text-sm ${result.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" : "border-red-500/30 bg-red-500/10 text-red-600"}`}>
                <p className="font-black">{result.ok ? "PASS" : "FAIL"}: {result.name}</p>
                <p className="mt-1 text-xs leading-relaxed">{result.detail}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function TestButton({ busy, icon, label, onClick }: { busy: string; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={!!busy}
      onClick={onClick}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-black uppercase tracking-widest hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
    >
      {icon}
      {busy === label ? "Running..." : label}
    </button>
  )
}

function buildTestOrder(kits: Kit[], email: string, phone: string, testModeEnabled: boolean): StoreOrder {
  const kit = kits[0]
  const item = {
    id: kit.id,
    name: kit.name,
    club: kit.club,
    season: kit.season,
    size: "M",
    quantity: 1,
    price: testModeEnabled ? 1 : kit.price,
  }

  return {
    id: createOrderId(),
    customerEmail: email,
    createdAt: new Date().toISOString(),
    status: "test",
    fulfillmentStatus: "pending",
    address: {
      ...testAddress,
      email,
      phone,
    },
    items: [item],
    subtotal: item.price,
    deliveryCharge: 0,
    total: item.price,
  }
}
