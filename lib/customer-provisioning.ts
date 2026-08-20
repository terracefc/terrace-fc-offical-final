import { randomUUID } from "crypto"
import { createCustomerId, type CustomerAccount, type CustomerSavedAddress } from "@/lib/customer-auth"
import { upsertStoredCustomerAccount } from "@/lib/customer-account-storage"
import { GOOGLE_CUSTOMER_COOKIE, signCustomerPayload } from "@/lib/google-auth"
import { findSupabaseAuthUserByEmail, isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"

export type PendingCustomerIdentity = {
  email: string
  name?: string
  googleSub?: string
}

export type CustomerProvisioningInput = PendingCustomerIdentity & {
  phone: string
  password?: string
  savedAddress: CustomerSavedAddress
}

export async function provisionCustomerAfterPayment(input: CustomerProvisioningInput) {
  const email = input.email.trim().toLowerCase()
  const name = input.name?.trim() || email.split("@")[0] || "Customer"
  const phone = input.phone.replace(/\D/g, "").slice(-10)

  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("A valid customer email is required.")
  if (!name) throw new Error("A customer name is required.")

  const existing = await findSupabaseAuthUserByEmail(email)
  if (existing.error && isSupabaseAdminConfigured) throw new Error(existing.error)

  const customerId = existing.user?.user_metadata?.customer_id || createCustomerId()
  const createdAt = existing.user?.created_at || new Date().toISOString()
  const metadata = {
    ...(existing.user?.user_metadata || {}),
    customer_id: customerId,
    name,
    phone,
    ...(input.googleSub ? { google_sub: input.googleSub } : {}),
    saved_address: input.savedAddress,
  }

  let customer: CustomerAccount = {
    id: customerId,
    name,
    email: existing.user?.email || email,
    phone,
    createdAt,
    savedAddress: input.savedAddress,
  }

  if (isSupabaseAdminConfigured && supabaseAdmin) {
    if (existing.user) {
      const { data, error } = await supabaseAdmin.auth.admin.updateUserById(existing.user.id, {
        ...(input.password?.trim() ? { password: input.password.trim() } : {}),
        user_metadata: metadata,
      })
      if (error || !data.user) throw new Error(error?.message || "Could not save the customer account.")
      customer = mapUserToCustomer(data.user, input.savedAddress)
    } else {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: input.password?.trim() || randomUUID(),
        email_confirm: true,
        user_metadata: metadata,
      })
      if (error || !data.user) throw new Error(error?.message || "Could not create the customer account.")
      customer = mapUserToCustomer(data.user, input.savedAddress)
    }
  }

  const saved = await upsertStoredCustomerAccount(customer)
  if (saved.error) throw new Error(saved.error)

  return { customer, cookieValue: signCustomerPayload(customer) }
}

export const CUSTOMER_COOKIE_NAME = GOOGLE_CUSTOMER_COOKIE

function mapUserToCustomer(user: any, savedAddress: CustomerSavedAddress): CustomerAccount {
  return {
    id: user.user_metadata?.customer_id || user.id,
    name: user.user_metadata?.name || user.email?.split("@")[0] || "Customer",
    email: user.email || "",
    phone: user.user_metadata?.phone || "",
    createdAt: user.created_at || new Date().toISOString(),
    savedAddress: user.user_metadata?.saved_address || savedAddress,
  }
}
