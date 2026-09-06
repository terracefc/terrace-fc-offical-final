import Link from "next/link"
import { ArrowLeft, Mail, MessageCircle, PackageCheck, Shirt } from "lucide-react"

const helpCards = [
  {
    title: "Track Order",
    text: "Login and check your order progress from your profile.",
    href: "/profile",
    icon: PackageCheck,
  },
  {
    title: "WhatsApp",
    text: "Message us directly for order help or jersey requests.",
    href: "https://wa.me/918147338142",
    icon: MessageCircle,
  },
  {
    title: "Email",
    text: "Send order questions to terrace.fc@terracefc.com.",
    href: "mailto:terrace.fc@terracefc.com?subject=Terrace.fc%20help",
    icon: Mail,
  },
  {
    title: "Request Jersey",
    text: "Send the team, year, player, size, and any photo reference.",
    href: "/request-jersey",
    icon: Shirt,
  },
]

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-[#080506] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_right,rgba(220,38,38,0.14),transparent_34%)]" />
      <div className="relative mx-auto max-w-5xl">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/60 hover:text-red-300">
          <ArrowLeft className="h-4 w-4" />
          Home
        </Link>

        <section className="border border-white/10 bg-black p-6 sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.34em] text-red-300">terrace.fc help</p>
          <h1 className="mt-2 text-4xl font-black uppercase tracking-tight sm:text-6xl">Support</h1>
          <p className="mt-4 max-w-2xl text-sm font-bold leading-relaxed text-white/68">
            Track orders, request jerseys, or contact us directly. Returns are not available on this store.
          </p>
        </section>

        <section className="mt-6 grid gap-3 sm:grid-cols-2">
          {helpCards.map(({ title, text, href, icon: Icon }) => (
            <Link
              key={title}
              href={href}
              target={href.startsWith("http") || href.startsWith("mailto:") ? "_blank" : undefined}
              rel={href.startsWith("http") || href.startsWith("mailto:") ? "noreferrer" : undefined}
              className="group flex min-h-36 items-start gap-4 border border-white/10 bg-white/[0.06] p-4 transition-colors hover:border-red-500/45 hover:bg-white/10"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white">
                <Icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-lg font-black uppercase tracking-tight">{title}</span>
                <span className="mt-2 block text-sm font-bold leading-relaxed text-white/62">{text}</span>
              </span>
            </Link>
          ))}
        </section>
      </div>
    </main>
  )
}
