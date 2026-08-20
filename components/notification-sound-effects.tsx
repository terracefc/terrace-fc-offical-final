"use client"

import { useEffect } from "react"
import { playNotificationSound } from "@/lib/notification-sounds"

export function NotificationSoundEffects() {
  useEffect(() => {
    const playErrorSound = (element: Element) => {
      if (!(element instanceof HTMLElement)) return
      const toast = element.matches("[data-sonner-toast]")
        ? element
        : element.querySelector<HTMLElement>("[data-sonner-toast]")

      if (!toast || toast.dataset.type !== "error" || toast.dataset.terraceSoundPlayed === "true") return
      toast.dataset.terraceSoundPlayed = "true"
      playNotificationSound("error")
    }

    const observer = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach((node) => {
        if (node instanceof Element) playErrorSound(node)
      }))
    })

    observer.observe(document.body, { childList: true, subtree: true })
    document.querySelectorAll("[data-sonner-toast]").forEach(playErrorSound)
    return () => observer.disconnect()
  }, [])

  return null
}
