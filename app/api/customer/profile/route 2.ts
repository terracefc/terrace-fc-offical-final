import { NextResponse } from "next/server"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { upsertStoredCustomerAccount } from "@/lib/customer-account-storage"

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Login is required." }, { status: 401 })

  const body = await request.json().catch(() => null)
  const firstName = String(body?.firstName || "").trim()
  const lastName = String(body?.lastName || "").trim()
  const email = String(body?.email || "").trim().toLowerCase()
  const phone = String(body?.phone || "").replace(/\D/g, "").slice(-10)

  if (!firstName || !lastName) return NextResponse.json({ error: "First and last name are required." }, { status: 400 })
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "A valid email is required." }, { status: 400 })
  if (!/^[6-9]\d{9}$/.test(phone)) return NextResponse.json({ error: "A valid mobile number is required." }, { status: 400 })

  try {
    const client = await clerkClient()
    let user = await client.users.getUser(userId)
    let emailAddress = user.emailAddresses.find((candidate) => candidate.emailAddress.toLowerCase() === email)
    if (!emailAddress) {
      emailAddress = await client.emailAddresses.createEmailAddress({ userId, emailAddress: email, verified: true, primary: true })
    } else if (user.primaryEmailAddressId !== emailAddress.id) {
      await client.emailAddresses.updateEmailAddress(emailAddress.id, { verified: true, primary: true })
    }

    user = await client.users.updateUser(userId, {
      firstName,
      lastName,
      primaryEmailAddressID: emailAddress.id,
      unsafeMetadata: { ...user.unsafeMetadata, contactPhone: phone, contactEmail: email },
      publicMetadata: { ...user.publicMetadata, contactPhone: phone, contactEmail: email },
    })

    const customer = {
      id: `CLK-${user.id}`,
      name: `${firstName} ${lastName}`.trim(),
      email,
      phone,
      createdAt: new Date(user.createdAt).toISOString(),
    }
    await upsertStoredCustomerAccount(customer)
    return NextResponse.json({ customer })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The customer profile could not be completed." }, { status: 500 })
  }
}
