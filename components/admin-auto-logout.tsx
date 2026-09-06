"use client"

import { useEffect } from "react"

export function AdminAutoLogout() {
  useEffect(() => {
    const logout = () => {
      fetch("/api/admin/logout", {
        method: "POST",
        credentials: "include",
        keepalive: true,
      }).catch(() => {
        // The page may already be closing, so failures here are harmless.
      })
    }

    window.addEventListener("pagehide", logout)
    window.addEventListener("beforeunload", logout)

    return () => {
      window.removeEventListener("pagehide", logout)
      window.removeEventListener("beforeunload", logout)
    }
  }, [])

  return null
}
