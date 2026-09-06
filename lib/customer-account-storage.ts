import { randomUUID } from "crypto"
import type { CustomerAccount } from "@/lib/customer-auth"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"
import { isMongoConfigured, readMongoSingleton, writeMongoSingleton } from "@/lib/mongodb"

const CUSTOMER_BACKUP_EMAIL = "site-customer-accounts@terracefc.local"
const CUSTOMER_COLLECTION = "app_storage"
const CUSTOMER_DOCUMENT = "customer_accounts"

export async function readStoredCustomerAccounts() {
  if (isMongoConfigured) {
    const stored = await readMongoSingleton<CustomerAccount[]>(CUSTOMER_COLLECTION, CUSTOMER_DOCUMENT, [])
    if (!stored.error) return { accounts: normalizeAccounts(stored.value), error: null }
  }

  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return { accounts: [] as CustomerAccount[], error: "Customer account backup storage is not configured." }
  }

  const user = await findCustomerBackupUser()
  return { accounts: normalizeAccounts(user?.user_metadata?.accounts), error: null }
}

export async function upsertStoredCustomerAccount(customer: CustomerAccount) {
  const current = await readStoredCustomerAccounts()
  if (current.error) return { accounts: [] as CustomerAccount[], error: current.error }

  const accounts = [
    customer,
    ...current.accounts.filter((account) => account.id !== customer.id && account.email.toLowerCase() !== customer.email.toLowerCase()),
  ].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())

  const saved = await saveStoredCustomerAccounts(accounts)
  return { accounts, error: saved.error }
}

export async function deleteStoredCustomerAccount(email: string) {
  const normalizedEmail = email.trim().toLowerCase()
  const current = await readStoredCustomerAccounts()
  if (current.error) return { deleted: false, error: current.error }

  const accounts = current.accounts.filter((account) => account.email.toLowerCase() !== normalizedEmail)
  if (accounts.length === current.accounts.length) return { deleted: false, error: "Customer account was not found in backup storage." }

  const saved = await saveStoredCustomerAccounts(accounts)
  return { deleted: !saved.error, error: saved.error }
}

async function saveStoredCustomerAccounts(accounts: CustomerAccount[]) {
  if (isMongoConfigured) {
    const saved = await writeMongoSingleton(CUSTOMER_COLLECTION, CUSTOMER_DOCUMENT, accounts)
    if (!saved.error) return { error: null }
  }

  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return { error: "Customer account backup storage is not configured." }
  }

  const existingUser = await findCustomerBackupUser()
  const metadata = { accounts }

  if (existingUser) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
      user_metadata: {
        ...existingUser.user_metadata,
        ...metadata,
      },
    })
    return { error: error?.message || null }
  }

  const { error } = await supabaseAdmin.auth.admin.createUser({
    email: CUSTOMER_BACKUP_EMAIL,
    password: randomUUID(),
    email_confirm: true,
    user_metadata: metadata,
  })

  return { error: error?.message || null }
}

async function findCustomerBackupUser() {
  if (!supabaseAdmin) return null

  const perPage = 1000
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
    if (error) return null

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === CUSTOMER_BACKUP_EMAIL)
    if (user) return user
    if ((data.users || []).length < perPage) break
  }

  return null
}

function normalizeAccounts(value: unknown) {
  if (!Array.isArray(value)) return [] as CustomerAccount[]
  return value.filter((account): account is CustomerAccount => {
    return !!account && typeof account === "object" && typeof (account as CustomerAccount).id === "string" && typeof (account as CustomerAccount).email === "string"
  })
}
