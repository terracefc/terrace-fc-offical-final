"use client"

import { useEffect } from "react"
import { saveCustomer, type CustomerAccount } from "@/lib/customer-auth"

export function CustomerSessionSync() {
  useEffect(() => {
    fetch("/api/auth/google/session", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) return
        const data = await response.json()
        if (data.customer) saveCustomer(data.customer as CustomerAccount)
      })
      .catch(() => null)
  }, [])

  return null
}
