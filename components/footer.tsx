"use client"

import Link from "next/link"
import { Instagram } from "lucide-react"

const footerLinks = {
  shop: [
    { name: "All Kits", href: "/collection" },
    { name: "Football", href: "/collection?sport=football" },
    { name: "F1", href: "/collection?category=f1" },
    { name: "New Arrivals", href: "/collection" },
    { name: "Best Sellers", href: "/collection" },
    { name: "Request Jersey", href: "/request-jersey" },
  ],
  leagues: [
    { name: "Premier League", href: "/leagues/premier-league" },
    { name: "La Liga", href: "/leagues/la-liga" },
    { name: "Serie A", href: "/leagues/serie-a" },
    { name: "International", href: "/leagues/international" },
    { name: "Liga Argentina", href: "/leagues/liga-argentina" },
  ],
  support: [
    { name: "Email Us", href: "mailto:terrace.fc@terracefc.com" },
    { name: "WhatsApp", href: "https://wa.me/918147338142" },
    { name: "Shipping", href: "/checkout" },
    { name: "Size Guide", href: "/size-guide" },
  ],
}

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-foreground text-background">
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: "20px 20px",
        }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 py-16 md:grid-cols-4 lg:grid-cols-5 lg:gap-12 lg:py-24">
          <div className="col-span-2 mb-4 md:col-span-4 lg:col-span-1 lg:mb-0">
            <Link href="/" className="inline-block group">
              <span className="text-2xl font-black tracking-tight">
                terrace<span className="text-accent">.</span>fc
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-background/60">
              High-quality football and F1 pieces for the modern supporter. Born in the stands, made for the culture.
            </p>

            <div className="mt-6 flex items-center gap-3">
              <a
                href="https://www.instagram.com/terrace.fc_/"
                target="_blank"
                rel="noreferrer"
                aria-label="terrace.fc Instagram"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-background/10 transition-colors hover:bg-accent group"
              >
                <Instagram className="h-4 w-4 transition-colors group-hover:text-accent-foreground" />
              </a>
            </div>
          </div>

          <FooterColumn title="Shop" links={footerLinks.shop} />
          <FooterColumn title="Leagues" links={footerLinks.leagues} />
          <FooterColumn title="Support" links={footerLinks.support} />

          <div className="col-span-2 md:col-span-1">
            <h3 className="mb-6 text-xs font-bold uppercase tracking-widest text-background/50">We Accept</h3>
            <div className="flex flex-wrap gap-2">
              {["UPI", "Cards", "NetBanking", "Wallets"].map((card) => (
                <div key={card} className="flex h-8 items-center justify-center rounded bg-background/10 px-3">
                  <span className="text-xs font-bold text-background/70">{card}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-background/10 py-8 sm:flex-row">
          <p className="text-xs text-background/50">© 2025 terrace.fc. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-xs text-background/50 transition-colors hover:text-accent">Privacy Policy</a>
            <a href="#" className="text-xs text-background/50 transition-colors hover:text-accent">Terms of Service</a>
          </div>
        </div>

        <div className="overflow-hidden py-12 lg:py-20">
          <p className="select-none whitespace-nowrap text-center text-[18vw] font-black leading-none tracking-tighter text-background/[0.03] lg:text-[14vw]">
            terrace.fc
          </p>
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({ title, links }: { title: string; links: Array<{ name: string; href: string }> }) {
  return (
    <div>
      <h3 className="mb-6 text-xs font-bold uppercase tracking-widest text-background/50">{title}</h3>
      <ul className="space-y-4">
        {links.map((link) => (
          <li key={link.name}>
            <Link
              href={link.href}
              className="text-sm text-background/70 transition-colors hover:text-accent"
              target={link.href.startsWith("http") || link.href.startsWith("mailto:") ? "_blank" : undefined}
              rel={link.href.startsWith("http") ? "noreferrer" : undefined}
            >
              {link.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
