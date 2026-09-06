import Link from "next/link"
import { Instagram, ArrowDown } from "lucide-react"

export default function MaintenancePage() {
  return (
    <main className="min-h-screen bg-black px-6 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl flex-col items-center justify-center text-center">
        <Link href="/" aria-label="terrace.fc home" className="text-3xl font-black tracking-tight text-white/90 sm:text-4xl">
          terrace<span className="text-[#ff454b]">.</span>fc
        </Link>
        <div className="mt-16 max-w-3xl px-2 text-center">
          <h1 className="text-5xl font-black tracking-[-0.06em] sm:text-7xl">We’ll be back soon.</h1>
          <p className="mx-auto mt-12 max-w-2xl text-xl leading-8 text-white/65 sm:text-3xl sm:leading-10">
                We are under maintenance while we fix a few things. Thanks for your patience.
          </p>
          <div className="mt-20 flex flex-col items-center gap-8">
            <ArrowDown className="h-10 w-10 animate-bounce text-[#ff454b]" strokeWidth={3} />
            <a
              href="https://www.instagram.com/terrace.fc_/"
              target="_blank"
              rel="noreferrer"
              className="group inline-flex flex-col items-center gap-8 text-xl text-white/70 transition hover:text-white sm:text-2xl"
            >
              <span>Click here to DM me</span>
              <span className="inline-flex items-center gap-5 rounded-full bg-white px-12 py-5 font-black text-black shadow-lg transition group-hover:scale-105">
                <Instagram className="h-8 w-8" strokeWidth={2.5} /> Instagram
              </span>
            </a>
          </div>
        </div>
      </div>
    </main>
  )
}
