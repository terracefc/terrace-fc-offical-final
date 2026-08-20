"use client"

import { useEffect, useState, type ReactNode } from "react"

const MIN_WAIT_MS = 900
const SETTLE_WAIT_MS = 250
const MAX_WAIT_MS = 10000

export function PhotoLoadGate({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    let settleTimeoutId = 0
    let maxTimeoutId = 0
    let observer: MutationObserver | null = null
    let removeImageListeners: Array<() => void> = []
    const startedAt = Date.now()

    const reveal = () => {
      if (cancelled) return
      cancelled = true
      observer?.disconnect()
      window.clearTimeout(settleTimeoutId)
      window.clearTimeout(maxTimeoutId)
      removeImageListeners.forEach((remove) => remove())
      setIsReady(true)
    }

    const clearImageListeners = () => {
      removeImageListeners.forEach((remove) => remove())
      removeImageListeners = []
    }

    const queueCheck = () => {
      if (cancelled) return
      window.clearTimeout(settleTimeoutId)
      settleTimeoutId = window.setTimeout(checkPhotos, SETTLE_WAIT_MS)
    }

    const checkPhotos = () => {
      if (cancelled) return
      clearImageListeners()

      const images = Array.from(document.querySelectorAll<HTMLImageElement>("img[data-load-gate='true']"))
      const pending = images.filter((image) => !image.complete)
      const waitedLongEnough = Date.now() - startedAt >= MIN_WAIT_MS

      if (images.length === 0 && document.readyState === "complete" && waitedLongEnough) {
        reveal()
        return
      }

      if (images.length > 0 && pending.length === 0 && waitedLongEnough) {
        reveal()
        return
      }

      pending.forEach((image) => {
        image.addEventListener("load", queueCheck, { once: true })
        image.addEventListener("error", queueCheck, { once: true })
        removeImageListeners.push(() => {
          image.removeEventListener("load", queueCheck)
          image.removeEventListener("error", queueCheck)
        })
      })

      if (!waitedLongEnough) queueCheck()
    }

    observer = new MutationObserver(queueCheck)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "data-load-gate"],
    })

    if (document.readyState === "complete") {
      queueCheck()
    } else {
      window.addEventListener("load", queueCheck, { once: true })
    }

    const frameId = window.requestAnimationFrame(queueCheck)
    maxTimeoutId = window.setTimeout(reveal, MAX_WAIT_MS)

    return () => {
      cancelled = true
      observer?.disconnect()
      window.cancelAnimationFrame(frameId)
      window.clearTimeout(settleTimeoutId)
      window.clearTimeout(maxTimeoutId)
      window.removeEventListener("load", queueCheck)
      clearImageListeners()
    }
  }, [])

  return (
    <>
      <div className={isReady ? "contents" : "pointer-events-none opacity-0"} aria-hidden={!isReady}>
        {children}
      </div>
      {!isReady && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background text-foreground">
          <div className="flex flex-col items-center gap-4">
            <div className="h-12 w-12 rounded-full border-2 border-border border-t-accent animate-spin" />
            <div className="text-center">
              <p className="text-lg font-black tracking-tight">terrace.fc</p>
              <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Loading</p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
