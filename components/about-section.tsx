"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { Check, Star } from "lucide-react"
import { kits } from "@/lib/data"
import { defaultHomepageContent, type HomepageContent } from "@/lib/homepage-content"
import { fetchPublicInventory, readCachedPublicInventory, type EditableKit } from "@/lib/inventory-client"

export function AboutSection() {
  const [content, setContent] = useState<HomepageContent>(defaultHomepageContent)
  const [inventory, setInventory] = useState<EditableKit[]>(() => readCachedPublicInventory(kits))

  useEffect(() => {
    fetch("/api/admin/homepage")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data?.content) setContent(data.content)
      })
      .catch(() => null)
    fetchPublicInventory(kits).then(setInventory).catch(() => null)
  }, [])

  const storyKits = content.storyImageKitIds
    .map((id) => inventory.find((kit) => kit.id === id))
    .filter(Boolean)

  return (
    <section id="about" className="py-24 lg:py-32 relative overflow-hidden noise-texture">
      {/* Background elements */}
      <div className="absolute top-0 left-0 w-full h-full">
        <div className="absolute top-20 right-20 w-72 h-72 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-20 w-96 h-96 bg-secondary rounded-full blur-3xl" />
      </div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Image Stack */}
          <div className="relative">
            {/* Main image */}
            <div className="aspect-square rounded-3xl overflow-hidden relative shadow-2xl grain bg-secondary">
              {storyKits[0] ? (
                <Image src={storyKits[0].image} alt={storyKits[0].name} fill className="object-cover" sizes="(max-width: 1024px) 90vw, 560px" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-foreground via-foreground/90 to-accent/60" />
              )}
              {/* Floating label */}
              <div className="absolute bottom-6 left-6 right-6 bg-background/10 backdrop-blur-md rounded-2xl p-4">
                <p className="text-background/60 text-xs uppercase tracking-wider mb-1">Est. 2023</p>
                <p className="text-background font-bold text-lg">{storyKits[0]?.club || "The Terrace Culture"}</p>
              </div>
            </div>
            
            {/* Floating cards */}
            <div className="absolute -top-4 -right-4 bg-accent text-accent-foreground p-5 rounded-2xl shadow-xl hidden lg:block">
              <div className="flex items-center gap-1 mb-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-current" />
                ))}
              </div>
              <p className="text-sm font-bold">4.9/5 Rating</p>
              <p className="text-xs opacity-80">2,000+ Reviews</p>
            </div>
            
            <div className="absolute -bottom-6 -left-6 hidden w-36 overflow-hidden rounded-2xl border border-border bg-background p-2 shadow-xl lg:block">
              <div className="relative aspect-square overflow-hidden rounded-xl bg-secondary">
                {storyKits[1] ? <Image src={storyKits[1].image} alt={storyKits[1].name} fill className="object-cover" sizes="160px" /> : null}
              </div>
            </div>
          </div>

          {/* Content */}
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-accent/10 rounded-full text-xs font-bold tracking-widest uppercase text-accent mb-6">
              {content.storyBadge}
            </div>
            
            <h2 className="text-5xl sm:text-6xl font-black tracking-tighter mb-8 leading-[0.9]">
              {content.storyTitleTop}<br />
              <span className="font-serif italic text-accent">{content.storyTitleAccent}</span>
            </h2>
            
            <div className="space-y-5 text-muted-foreground leading-relaxed text-lg">
              <p>
                {content.storyParagraphOne}
              </p>
              <p>
                {content.storyParagraphTwo}
              </p>
            </div>
            
            {/* Features list */}
            <div className="grid grid-cols-2 gap-4 mt-8">
              {[
                "100% High Quality Kits",
                "Worldwide Shipping",
                "Secure Checkout",
                "Premium Quality"
              ].map((feature) => (
                <div key={feature} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3.5 h-3.5 text-accent" />
                  </div>
                  <span className="text-sm font-medium">{feature}</span>
                </div>
              ))}
            </div>
            
          </div>
        </div>
      </div>
    </section>
  )
}
