import { Resend } from "resend"
import { getOrderDisplayId, type StoreOrder } from "@/lib/orders"
import { kits } from "@/lib/data"
import type { JerseyRequest } from "@/lib/jersey-requests"
import type { SupportTicket } from "@/lib/support"
import { formatExpectedDelivery, getOrderPageUrl, getOrderStatusLabel, getOrderStatusMessage } from "@/lib/tracking"
import type { EmailAttachment } from "@/lib/invoice-pdf"

type EmailPayload = {
  to: string
  subject: string
  html: string
  attachments?: EmailAttachment[]
}

type EmailResult = {
  sent: boolean
  reason?: string
  deliveredTo?: string
}

type CartReminderItem = {
  name: string
  club?: string
  season?: string
  size: string
  quantity: number
  unitPrice: number
  version?: string
  backPrint?: string
}

export async function sendEmail({ to, subject, html, attachments }: EmailPayload) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM || "terrace.fc <onboarding@resend.dev>"
  const deliveredTo = to.trim()

  if (!apiKey) {
    console.log(`[email skipped] ${subject} -> ${to}`)
    return { sent: false, reason: "RESEND_API_KEY is not configured." } satisfies EmailResult
  }

  try {
    const resend = new Resend(apiKey)

    // Ensure display name is properly double-quoted to satisfy RFC standards and Resend validations
    let formattedFrom = from
    if (from.includes("<") && from.includes(">")) {
      const match = from.match(/^([^<]+)\s*<([^>]+)>$/)
      if (match) {
        const displayName = match[1].trim()
        const emailAddress = match[2].trim()
        // Strip any existing quotes first, then add them back properly
        const cleanName = displayName.replace(/^"+|"+$/g, "")
        formattedFrom = `"${cleanName}" <${emailAddress}>`
      }
    }

    const adminCopy = getAdminNotificationEmail()
    const isAdminRecipient = adminCopy && deliveredTo.toLowerCase() === adminCopy.toLowerCase()
    const { data, error } = await resend.emails.send({
      from: formattedFrom,
      to: deliveredTo,
      subject,
      html,
      ...(attachments?.length ? { attachments } : {}),
    })

    if (error) {
      console.error(`[email failed] ${subject} -> ${deliveredTo}:`, error)
      return { sent: false, reason: error.message || "Email failed to send." } satisfies EmailResult
    }

    if (adminCopy && !isAdminRecipient) {
      const { error: adminCopyError } = await resend.emails.send({
        from: formattedFrom,
        to: adminCopy,
        subject,
        html,
        // The store copy must be identical to the customer email, including
        // the invoice on an order-confirmation email.
        ...(attachments?.length ? { attachments } : {}),
      })
      if (adminCopyError) console.error(`[admin email copy failed] ${subject} -> ${adminCopy}:`, adminCopyError)
    }

    return { sent: true, deliveredTo } satisfies EmailResult
  } catch (error) {
    console.error(`[email failed] ${subject} -> ${deliveredTo}:`, error)
    return { sent: false, reason: error instanceof Error ? error.message : "Email service is unavailable." } satisfies EmailResult
  }
}

export function getAdminNotificationEmail() {
  return String(
    process.env.ADMIN_NOTIFICATION_EMAIL ||
    process.env.ADMIN_ORDER_EMAIL ||
    process.env.RESEND_TEST_RECIPIENT ||
    "",
  ).trim()
}


export function loginNoticeEmailHtml(name: string) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#171717">
      ${brandLogoHtml()}
      <h1 style="font-size:26px;margin-bottom:8px">New terrace.fc login</h1>
      <p style="font-size:15px;line-height:1.5">Hi ${escapeHtml(name)}, your terrace.fc account was just logged in.</p>
      <p style="font-size:13px;color:#666">If this was you, no action is needed. If this was not you, reset your password immediately.</p>
    </div>
  `
}

export function emailOtpHtml(code: string) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#171717">
      ${brandLogoHtml()}
      <h1 style="font-size:26px;margin-bottom:8px">Your terrace.fc verification code</h1>
      <p style="font-size:15px;line-height:1.5">Use this one-time code to continue signing in:</p>
      <div style="margin:24px 0;padding:18px;border:1px solid #e5e5e5;border-radius:14px;text-align:center;background:#fafafa;font-size:34px;letter-spacing:10px;font-weight:900">${escapeHtml(code)}</div>
      <p style="font-size:13px;color:#666">This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>
    </div>
  `
}

export function abandonedCartEmailHtml({
  name,
  items,
  subtotal,
}: {
  name: string
  items: CartReminderItem[]
  subtotal: number
}) {
  const cartUrl = `${getSiteOrigin()}/checkout`
  const itemRows = items
    .map((item) => {
      const details = [
        item.club,
        item.season,
        `Size ${item.size}`,
        item.version,
        item.backPrint,
      ].filter(Boolean).join(" - ")

      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #eeeeee">
            <p style="font-size:14px;font-weight:900;margin:0 0 4px">${escapeHtml(item.name)}</p>
            <p style="font-size:12px;color:#666;margin:0">${escapeHtml(details)}</p>
          </td>
          <td style="padding:12px 0;border-bottom:1px solid #eeeeee;text-align:center;font-size:13px;font-weight:900">x${item.quantity}</td>
          <td style="padding:12px 0;border-bottom:1px solid #eeeeee;text-align:right;font-size:13px;font-weight:900">₹${(item.unitPrice * item.quantity).toLocaleString("en-IN")}</td>
        </tr>
      `
    })
    .join("")

  return `
    <div style="margin:0;background:#f5f5f5;padding:24px 12px;font-family:Arial,sans-serif;color:#171717">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:18px;overflow:hidden">
        <div style="background:#171717;color:#ffffff;padding:22px 24px">
          ${brandLogoHtml({ dark: true })}
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.6px;color:#cfcfcf;margin-top:6px">Still Thinking It Over?</div>
        </div>
        <div style="padding:24px">
          <p style="font-size:15px;line-height:1.6;margin:0 0 14px">Hi ${escapeHtml(name)},</p>
          <h1 style="font-size:28px;line-height:1.1;margin:0 0 10px">Your jerseys are still in your cart</h1>
          <p style="font-size:15px;line-height:1.6;margin:0 0 22px;color:#444">You left these terrace.fc picks behind. Checkout is ready whenever you want to complete the order.</p>
          <table style="width:100%;border-collapse:collapse;margin:0 0 20px">${itemRows}</table>
          <p style="font-size:18px;font-weight:900;text-align:right;margin:0 0 22px">Cart total: ₹${subtotal.toLocaleString("en-IN")}</p>
          <a href="${cartUrl}" style="display:block;text-align:center;background:#171717;color:#ffffff;text-decoration:none;border-radius:12px;padding:14px 18px;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:1px">Complete Checkout</a>
          <p style="font-size:13px;color:#666;margin:22px 0 0">If you already checked out, you can ignore this email.</p>
        </div>
      </div>
    </div>
  `
}

export function orderEmailHtml(order: StoreOrder) {
  const orderUrl = getOrderPageUrl(order.id)
  const awb = order.delhiveryWaybill || order.trackingNumber || order.shippingId || ""
  const orderedJerseys = order.items.map((item) => item.name).filter(Boolean).join(", ") || "your terrace.fc jersey"
  const deliveryDetails = awb ? `
          <div style="border-top:1px solid #e5e5e5;padding:14px 0 0;margin:14px 0 0">
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 8px">Delivery details</p>
            <div style="display:flex;justify-content:space-between;gap:16px;font-size:14px;line-height:1.5"><span style="color:#555">Courier</span><strong style="color:#171717">Delhivery</strong></div>
            <div style="display:flex;justify-content:space-between;gap:16px;margin-top:7px;font-size:14px;line-height:1.5"><span style="color:#555">AWB</span><strong style="color:#171717;word-break:break-all;text-align:right">${escapeHtml(awb)}</strong></div>
          </div>
  ` : ""
  const items = order.items.map((item) => {
    const imageUrl = getOrderItemImageUrl(item)
    const details = [item.club, item.season, `Size ${item.size}`, item.version ? formatEmailVersion(item.version) : "", `Qty ${item.quantity}`, getItemOptionLabel(item)]
      .filter(Boolean)
      .join(" · ")
    const itemTotal = item.price * item.quantity

    return `
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid #eeeeee;vertical-align:top;width:88px">
          <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.name)}" width="76" height="92" style="display:block;width:76px;height:92px;object-fit:cover;border-radius:12px;background:#f3f4f6;border:1px solid #e5e7eb" />
        </td>
        <td style="padding:14px 12px;border-bottom:1px solid #eeeeee;vertical-align:top">
          <p style="font-size:15px;font-weight:900;line-height:1.25;margin:0 0 6px;color:#171717">${escapeHtml(item.name)}</p>
          <p style="font-size:12px;line-height:1.5;margin:0;color:#666">${escapeHtml(details)}</p>
        </td>
        <td style="padding:14px 0;border-bottom:1px solid #eeeeee;vertical-align:top;text-align:right;white-space:nowrap;font-size:14px;font-weight:900;color:#171717">₹${itemTotal.toLocaleString("en-IN")}</td>
      </tr>
    `
  }).join("")

  return `
    <div style="margin:0;background:#f5f5f5;padding:24px 12px;font-family:Arial,sans-serif;color:#171717">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:18px;overflow:hidden">
        <div style="background:#171717;color:#ffffff;padding:22px 24px">
          ${brandLogoHtml({ dark: true })}
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.6px;color:#cfcfcf;margin-top:6px">Order Confirmation</div>
        </div>
        <div style="padding:24px">
          <p style="font-size:15px;line-height:1.6;margin:0 0 8px">Hi ${escapeHtml(order.address.name || "there")},</p>
          <h1 style="font-size:28px;line-height:1.1;margin:0 0 10px">Thank you for your purchase.</h1>
          <p style="font-size:15px;line-height:1.6;margin:0 0 22px;color:#444">Your order is confirmed. Thank you for your purchase of <strong style="font-size:15px;color:#171717">${escapeHtml(orderedJerseys)}</strong>. We’re getting your jersey ready, and your PDF invoice is attached for your records.</p>
          <div style="border:1px solid #e5e5e5;border-radius:16px;padding:16px 18px;margin:0 0 18px;background:#fafafa">
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 6px">Order Number</p>
            <p style="font-size:24px;font-weight:900;letter-spacing:1px;margin:0">${escapeHtml(getOrderDisplayId(order))}</p>
            ${deliveryDetails}
            <div style="border-top:1px solid #e5e5e5;margin-top:14px;padding-top:14px">
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 2px">Your items</p>
            <table role="presentation" style="width:100%;border-collapse:collapse">${items}</table>
            </div>
            <div style="border-top:1px solid #e5e5e5;margin-top:2px;padding-top:14px">
            <div style="display:flex;justify-content:space-between;margin:0 0 8px;font-size:13px;color:#555"><span>Subtotal</span><span>₹${order.subtotal.toLocaleString("en-IN")}</span></div>
            ${order.discount ? `<div style="display:flex;justify-content:space-between;margin:0 0 8px;font-size:13px;color:#047857"><span>Discount${order.couponCode ? ` (${escapeHtml(order.couponCode)})` : ""}</span><span>-₹${order.discount.toLocaleString("en-IN")}</span></div>` : ""}
            <div style="display:flex;justify-content:space-between;margin:0 0 8px;font-size:13px;color:#555"><span>Delivery</span><span>${order.deliveryCharge === 0 ? "FREE" : `₹${order.deliveryCharge.toLocaleString("en-IN")}`}</span></div>
            ${order.convenienceCharge ? `<div style="display:flex;justify-content:space-between;margin:0 0 8px;font-size:13px;color:#555"><span>Convenience</span><span>₹${order.convenienceCharge.toLocaleString("en-IN")}</span></div>` : ""}
            <div style="display:flex;justify-content:space-between;align-items:center;border-top:2px solid #171717;padding-top:12px;font-size:18px;font-weight:900">
              <span>Total</span><span>₹${order.total.toLocaleString("en-IN")}</span>
            </div>
            </div>
          </div>
          <a href="${orderUrl}" style="display:block;text-align:center;background:#171717;color:#ffffff;text-decoration:none;border-radius:12px;padding:15px 18px;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:1px">Track Order</a>
          <p style="font-size:13px;color:#666;line-height:1.6;margin:20px 0 0">We’ll email you again when your order moves through delivery. Thank you for supporting terrace.fc.</p>
        </div>
      </div>
    </div>
  `
}

function formatEmailVersion(version: string) {
  return version.charAt(0).toUpperCase() + version.slice(1)
}

function getOrderItemImageUrl(item: StoreOrder["items"][number]) {
  const image = item.image || kits.find((kit) => kit.id === item.id || kit.id === item.id - 10000)?.image || "/placeholder.svg"
  return image.startsWith("http") ? image : `${getSiteOrigin()}${image.startsWith("/") ? "" : "/"}${image}`
}

function getItemOptionLabel(item: StoreOrder["items"][number]) {
  const customization = item.customization
  if (customization?.patches) return `${customization.patchType || "Sleeve"} Patches`
  if (customization?.mode === "original") return "Original Player Name"
  if (customization?.enabled || customization?.mode === "custom") return `${customization.name || "Custom"} ${customization.number || ""}`.trim()
  return ""
}

export function adminOrderNotificationEmailHtml(order: StoreOrder) {
  const orderUrl = getOrderPageUrl(order.id)
  const adminUrl = getAdminOrdersUrl()
  const items = order.items
    .map((item) => `<li>${escapeHtml(item.name)} - ${escapeHtml(item.club)} - Size ${escapeHtml(item.size)} x${item.quantity}</li>`)
    .join("")
  const paymentLabel = order.status === "cod" ? "Cash on Delivery" : order.status === "paid" ? "Paid online" : "Test order"

  return `
    <div style="margin:0;background:#f5f5f5;padding:24px 12px;font-family:Arial,sans-serif;color:#171717">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:18px;overflow:hidden">
        <div style="background:#171717;color:#ffffff;padding:22px 24px">
          ${brandLogoHtml({ dark: true })}
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.6px;color:#cfcfcf;margin-top:6px">New Order Alert</div>
        </div>
        <div style="padding:24px">
          <h1 style="font-size:28px;line-height:1.1;margin:0 0 10px">New order received</h1>
          <p style="font-size:15px;line-height:1.6;margin:0 0 18px;color:#444">${escapeHtml(order.address.name)} placed order <strong>${escapeHtml(getOrderDisplayId(order))}</strong>.</p>
          <div style="border:1px solid #e5e5e5;border-radius:14px;padding:18px;margin:0 0 22px;background:#fafafa">
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 6px">Customer</p>
            <p style="font-size:15px;font-weight:900;margin:0 0 4px">${escapeHtml(order.address.name)}</p>
            <p style="font-size:13px;margin:0 0 14px;color:#444">${escapeHtml(order.address.phone)} - ${escapeHtml(order.address.email)}</p>
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 6px">Payment</p>
            <p style="font-size:15px;font-weight:900;margin:0 0 14px">${escapeHtml(paymentLabel)} - ₹${order.total.toLocaleString("en-IN")}</p>
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 6px">Items</p>
            <ul style="font-size:13px;line-height:1.7;margin:0;padding-left:18px">${items}</ul>
          </div>
          <a href="${adminUrl}" style="display:block;text-align:center;background:#171717;color:#ffffff;text-decoration:none;border-radius:12px;padding:14px 18px;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Open Admin Orders</a>
          <a href="${orderUrl}" style="display:block;text-align:center;background:#f3f4f6;color:#171717;text-decoration:none;border-radius:12px;padding:13px 18px;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:1px">View Order Page</a>
        </div>
      </div>
    </div>
  `
}

export function adminSupportNotificationEmailHtml({
  ticketId,
  customerName,
  customerEmail,
  subject,
  message,
  attachmentCount,
}: {
  ticketId: string
  customerName: string
  customerEmail: string
  subject: string
  message: string
  attachmentCount: number
}) {
  return `
    <div style="margin:0;background:#f5f5f5;padding:24px 12px;font-family:Arial,sans-serif;color:#171717">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:18px;overflow:hidden">
        <div style="background:#171717;color:#ffffff;padding:22px 24px">
          ${brandLogoHtml({ dark: true })}
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.6px;color:#cfcfcf;margin-top:6px">Support Alert</div>
        </div>
        <div style="padding:24px">
          <h1 style="font-size:28px;line-height:1.1;margin:0 0 10px">New support message</h1>
          <p style="font-size:15px;line-height:1.6;margin:0 0 18px;color:#444">${escapeHtml(customerName)} sent a support message.</p>
          <div style="border:1px solid #e5e5e5;border-radius:14px;padding:18px;margin:0 0 22px;background:#fafafa">
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 6px">Ticket</p>
            <p style="font-size:18px;font-weight:900;margin:0 0 14px">${escapeHtml(ticketId)}</p>
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 6px">Customer</p>
            <p style="font-size:14px;margin:0 0 14px">${escapeHtml(customerName)} - ${escapeHtml(customerEmail)}</p>
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 6px">Subject</p>
            <p style="font-size:15px;font-weight:900;margin:0 0 14px">${escapeHtml(subject)}</p>
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 6px">Message</p>
            <p style="font-size:14px;line-height:1.6;margin:0 0 14px">${escapeHtml(message)}</p>
            <p style="font-size:13px;color:#555;margin:0">Attachments: ${attachmentCount}</p>
          </div>
          <a href="${getAdminOrdersUrl()}" style="display:block;text-align:center;background:#171717;color:#ffffff;text-decoration:none;border-radius:12px;padding:14px 18px;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:1px">Open Admin Page</a>
        </div>
      </div>
    </div>
  `
}

export function adminJerseyRequestNotificationEmailHtml({
  id,
  name,
  email,
  clubOrCountry,
  playerName,
  number,
  year,
  notes,
  photo,
}: {
  id: string
  name: string
  email: string
  clubOrCountry: string
  playerName: string
  number: string
  year: string
  notes?: string
  photo?: { dataUrl?: string }
}) {
  return `
    <div style="margin:0;background:#f5f5f5;padding:24px 12px;font-family:Arial,sans-serif;color:#171717">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:18px;overflow:hidden">
        <div style="background:#171717;color:#ffffff;padding:22px 24px">
          ${brandLogoHtml({ dark: true })}
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.6px;color:#cfcfcf;margin-top:6px">Jersey Request</div>
        </div>
        <div style="padding:24px">
          <h1 style="font-size:28px;line-height:1.1;margin:0 0 10px">New jersey request</h1>
          <p style="font-size:15px;line-height:1.6;margin:0 0 18px;color:#444">${escapeHtml(name)} requested a jersey.</p>
          <div style="border:1px solid #e5e5e5;border-radius:14px;padding:18px;margin:0 0 22px;background:#fafafa">
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 6px">Request ID</p>
            <p style="font-size:18px;font-weight:900;margin:0 0 14px">${escapeHtml(id)}</p>
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 6px">Customer</p>
            <p style="font-size:14px;margin:0 0 14px">${escapeHtml(name)} - ${escapeHtml(email)}</p>
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 6px">Jersey</p>
            <p style="font-size:15px;font-weight:900;margin:0 0 8px">${escapeHtml(clubOrCountry)} - ${escapeHtml(playerName)}</p>
            <p style="font-size:14px;margin:0 0 14px">Number: ${escapeHtml(number || "Not provided")} | Year: ${escapeHtml(year)}</p>
            <p style="font-size:13px;color:#555;margin:0">${escapeHtml(notes || "No notes added.")}</p>
            <p style="font-size:13px;color:#555;margin:12px 0 0">Photo attached: ${photo.dataUrl ? "Yes, check the admin request page." : "No"}</p>
          </div>
          <a href="${getAdminOrdersUrl()}" style="display:block;text-align:center;background:#171717;color:#ffffff;text-decoration:none;border-radius:12px;padding:14px 18px;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:1px">Open Admin Requests</a>
        </div>
      </div>
    </div>
  `
}

export function adminJerseyRequestMessageEmailHtml(request: JerseyRequest, latestMessage: string) {
  return `
    <div style="margin:0;background:#f5f5f5;padding:24px 12px;font-family:Arial,sans-serif;color:#171717">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:18px;overflow:hidden">
        <div style="background:#171717;color:#ffffff;padding:22px 24px">
          ${brandLogoHtml({ dark: true })}
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.6px;color:#cfcfcf;margin-top:6px">Jersey Request Message</div>
        </div>
        <div style="padding:24px">
          <h1 style="font-size:28px;line-height:1.1;margin:0 0 10px">New message from ${escapeHtml(request.name)}</h1>
          <p style="font-size:15px;line-height:1.6;margin:0 0 18px;color:#444">${escapeHtml(request.clubOrCountry)} - ${escapeHtml(request.playerName)} (${escapeHtml(request.id)})</p>
          <div style="border:1px solid #e5e5e5;border-radius:14px;padding:18px;margin:0 0 22px;background:#fafafa">
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 6px">Customer</p>
            <p style="font-size:14px;margin:0 0 14px">${escapeHtml(request.name)} - ${escapeHtml(request.email)}</p>
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 6px">Message</p>
            <p style="font-size:14px;line-height:1.6;margin:0;color:#333">${escapeHtml(latestMessage)}</p>
          </div>
          <a href="${getAdminOrdersUrl()}" style="display:block;text-align:center;background:#171717;color:#ffffff;text-decoration:none;border-radius:12px;padding:14px 18px;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:1px">Open Admin Requests</a>
        </div>
      </div>
    </div>
  `
}

export function customerJerseyRequestMessageEmailHtml(request: JerseyRequest, latestMessage: string) {
  const profileUrl = `${getSiteOrigin()}/profile?tab=requests`
  return `
    <div style="margin:0;background:#f5f5f5;padding:24px 12px;font-family:Arial,sans-serif;color:#171717">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:18px;overflow:hidden">
        <div style="background:#171717;color:#ffffff;padding:22px 24px">
          ${brandLogoHtml({ dark: true })}
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.6px;color:#cfcfcf;margin-top:6px">Jersey Request Reply</div>
        </div>
        <div style="padding:24px">
          <p style="font-size:15px;line-height:1.6;margin:0 0 14px">Hi ${escapeHtml(request.name)},</p>
          <h1 style="font-size:28px;line-height:1.1;margin:0 0 10px">We replied to your jersey request</h1>
          <p style="font-size:15px;line-height:1.6;margin:0 0 18px;color:#444">${escapeHtml(request.clubOrCountry)} - ${escapeHtml(request.playerName)} (${escapeHtml(request.id)})</p>
          <div style="border:1px solid #e5e5e5;border-radius:14px;padding:18px;margin:0 0 22px;background:#fafafa">
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 6px">Reply</p>
            <p style="font-size:14px;line-height:1.6;margin:0;color:#333">${escapeHtml(latestMessage)}</p>
          </div>
          <a href="${profileUrl}" style="display:block;text-align:center;background:#171717;color:#ffffff;text-decoration:none;border-radius:12px;padding:14px 18px;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:1px">View Request Chat</a>
        </div>
      </div>
    </div>
  `
}

export function customerSupportUpdateEmailHtml(ticket: SupportTicket, latestMessage?: string) {
  const profileUrl = `${getSiteOrigin()}/profile?tab=support`
  const statusLabel = ticket.status === "closed" ? "Closed" : "Open"
  const message = latestMessage || (ticket.status === "closed" ? "Your support chat has been closed." : "Your support chat status was updated.")

  return `
    <div style="margin:0;background:#f5f5f5;padding:24px 12px;font-family:Arial,sans-serif;color:#171717">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:18px;overflow:hidden">
        <div style="background:#171717;color:#ffffff;padding:22px 24px">
          ${brandLogoHtml({ dark: true })}
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.6px;color:#cfcfcf;margin-top:6px">Support Update</div>
        </div>
        <div style="padding:24px">
          <p style="font-size:15px;line-height:1.6;margin:0 0 14px">Hi ${escapeHtml(ticket.customerName)},</p>
          <h1 style="font-size:28px;line-height:1.1;margin:0 0 10px">We updated your support chat</h1>
          <div style="border:1px solid #e5e5e5;border-radius:14px;padding:18px;margin:0 0 22px;background:#fafafa">
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 6px">Ticket</p>
            <p style="font-size:18px;font-weight:900;margin:0 0 14px">${escapeHtml(ticket.id)}</p>
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 6px">Subject</p>
            <p style="font-size:15px;font-weight:900;margin:0 0 14px">${escapeHtml(ticket.subject)}</p>
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 6px">Status</p>
            <p style="font-size:15px;font-weight:900;margin:0 0 14px">${escapeHtml(statusLabel)}</p>
            <p style="font-size:14px;line-height:1.6;margin:0;color:#444">${escapeHtml(message)}</p>
          </div>
          <a href="${profileUrl}" style="display:block;text-align:center;background:#171717;color:#ffffff;text-decoration:none;border-radius:12px;padding:14px 18px;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:1px">View Support</a>
          <p style="font-size:13px;color:#666;margin:22px 0 0">You can check your support chats anytime from your terrace.fc profile.</p>
        </div>
      </div>
    </div>
  `
}

export function customerJerseyRequestStatusEmailHtml(request: JerseyRequest) {
  const profileUrl = `${getSiteOrigin()}/profile?tab=requests`
  const statusLabel = request.status === "done" ? "Done" : request.status === "reviewed" ? "Reviewed" : "Received"
  const message = request.status === "done"
    ? "Your jersey request has been marked done."
    : request.status === "reviewed"
      ? "We reviewed your jersey request and are checking availability."
      : "Your jersey request has been received."

  return `
    <div style="margin:0;background:#f5f5f5;padding:24px 12px;font-family:Arial,sans-serif;color:#171717">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:18px;overflow:hidden">
        <div style="background:#171717;color:#ffffff;padding:22px 24px">
          ${brandLogoHtml({ dark: true })}
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.6px;color:#cfcfcf;margin-top:6px">Jersey Request Update</div>
        </div>
        <div style="padding:24px">
          <p style="font-size:15px;line-height:1.6;margin:0 0 14px">Hi ${escapeHtml(request.name)},</p>
          <h1 style="font-size:28px;line-height:1.1;margin:0 0 10px">${escapeHtml(statusLabel)}</h1>
          <p style="font-size:15px;line-height:1.6;margin:0 0 22px;color:#444">${escapeHtml(message)}</p>
          <div style="border:1px solid #e5e5e5;border-radius:14px;padding:18px;margin:0 0 22px;background:#fafafa">
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 6px">Request ID</p>
            <p style="font-size:18px;font-weight:900;margin:0 0 14px">${escapeHtml(request.id)}</p>
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 6px">Jersey</p>
            <p style="font-size:15px;font-weight:900;margin:0 0 8px">${escapeHtml(request.clubOrCountry)} - ${escapeHtml(request.playerName)}</p>
            <p style="font-size:14px;margin:0">Number: ${escapeHtml(request.number || "Not provided")} | Year: ${escapeHtml(request.year)}</p>
          </div>
          <a href="${profileUrl}" style="display:block;text-align:center;background:#171717;color:#ffffff;text-decoration:none;border-radius:12px;padding:14px 18px;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:1px">View Request</a>
          <p style="font-size:13px;color:#666;margin:22px 0 0">You can check your jersey requests anytime from your terrace.fc profile.</p>
        </div>
      </div>
    </div>
  `
}

export function shippingEmailHtml(order: StoreOrder) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#171717">
      ${brandLogoHtml()}
      <h1 style="font-size:28px;margin-bottom:8px">Your terrace.fc order has shipped</h1>
      <p style="font-size:15px;line-height:1.5">Hi ${escapeHtml(order.address.name)}, your order is on the way.</p>
      <div style="border:1px solid #ddd;border-radius:14px;padding:18px 22px;margin:24px 0">
        <p style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#777;margin:0 0 6px">Order Number</p>
        <p style="font-size:24px;font-weight:900;margin:0 0 16px">${escapeHtml(getOrderDisplayId(order))}</p>
        <p style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#777;margin:0 0 6px">Shipping ID</p>
        <p style="font-size:24px;font-weight:900;margin:0">${escapeHtml(order.shippingId || "Not provided")}</p>
      </div>
      <p style="font-size:14px;line-height:1.6">We will update your terrace.fc profile as the order moves through delivery.</p>
      <p style="font-size:13px;color:#666">Thank you for shopping with terrace.fc.</p>
    </div>
  `
}

export function orderStatusEmailHtml(order: StoreOrder) {
  const statusLabel = getOrderStatusLabel(order.fulfillmentStatus)
  const message = getOrderStatusMessage(order.fulfillmentStatus)
  const orderUrl = getOrderPageUrl(order.id)
  const customerName = order.address.name || "there"
  const awb = order.delhiveryWaybill || order.trackingNumber || order.shippingId || "Tracking number will appear here once available."
  const courier = order.delhiveryWaybill ? "Delhivery" : order.courierName || "Courier will appear here once assigned."

  return `
    <div style="margin:0;background:#f5f5f5;padding:24px 12px;font-family:Arial,sans-serif;color:#171717">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:18px;overflow:hidden">
        <div style="background:#171717;color:#ffffff;padding:22px 24px">
          ${brandLogoHtml({ dark: true })}
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.6px;color:#cfcfcf;margin-top:6px">Order Status Update</div>
        </div>
        <div style="padding:24px">
          <p style="font-size:15px;line-height:1.6;margin:0 0 14px">Hi ${escapeHtml(order.address.name)},</p>
          <h1 style="font-size:28px;line-height:1.1;margin:0 0 10px">${escapeHtml(customerName)}, your order is ${escapeHtml(statusLabel.toLowerCase())}.</h1>
          <p style="font-size:15px;line-height:1.6;margin:0 0 22px;color:#444">${escapeHtml(message)}</p>
          <div style="border:1px solid #e5e5e5;border-radius:14px;padding:18px;margin:0 0 22px;background:#fafafa">
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 6px">Order ID</p>
            <p style="font-size:22px;font-weight:900;margin:0 0 14px">${escapeHtml(getOrderDisplayId(order))}</p>
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 6px">Current Status</p>
            <p style="font-size:18px;font-weight:900;margin:0 0 14px">${escapeHtml(statusLabel)}</p>
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 6px">Delivery details</p>
            <div style="display:flex;justify-content:space-between;gap:16px;font-size:14px;line-height:1.5"><span style="color:#555">Courier</span><strong style="color:#171717">${escapeHtml(courier)}</strong></div>
            <div style="display:flex;justify-content:space-between;gap:16px;margin-top:7px;font-size:14px;line-height:1.5"><span style="color:#555">AWB</span><strong style="color:#171717;word-break:break-all;text-align:right">${escapeHtml(awb)}</strong></div>
            ${order.estimatedDelivery ? `<p style="font-size:14px;margin:10px 0 0;color:#333">Estimated delivery: ${escapeHtml(formatExpectedDelivery(order.estimatedDelivery))}</p>` : ""}
          </div>
          <a href="${orderUrl}" style="display:block;text-align:center;background:#171717;color:#ffffff;text-decoration:none;border-radius:12px;padding:14px 18px;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:1px">Track Order</a>
          <p style="font-size:13px;color:#666;margin:22px 0 0">You can check your order progress anytime using the tracking page.</p>
        </div>
      </div>
    </div>
  `
}

export function cancellationEmailHtml(order: StoreOrder) {
  const reason = order.cancellationNote.trim() || "Not specified"
  const isPrepaid = order.status === "paid"
  const items = order.items
    .map((item) => `<li>${escapeHtml(item.name)} - Size ${escapeHtml(item.size)} x${item.quantity}</li>`)
    .join("")

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#171717">
      ${brandLogoHtml()}
      <h1 style="font-size:28px;margin-bottom:8px;color:#dc2626">Your terrace.fc order has been cancelled</h1>
      <p style="font-size:15px;line-height:1.5">Hi ${escapeHtml(order.address.name)}, your order <strong>${escapeHtml(getOrderDisplayId(order))}</strong> has been cancelled.</p>
      <div style="border:1px solid #ddd;border-radius:14px;padding:18px 22px;margin:24px 0;background-color:#fef2f2;border-color:#fca5a5">
        <p style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#777;margin:0 0 6px">Order Number</p>
        <p style="font-size:24px;font-weight:900;margin:0 0 16px">${escapeHtml(getOrderDisplayId(order))}</p>
        <p style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#777;margin:0 0 6px">Cancellation Status</p>
        <p style="font-size:20px;font-weight:900;margin:0;color:#dc2626">CANCELLED & RESTOCKED</p>
      </div>
      <div style="border:1px solid #e5e5e5;border-radius:14px;padding:16px 18px;margin:0 0 20px;background:#fafafa">
        <p style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#777;margin:0 0 6px">Cancellation Reason</p>
        <p style="font-size:14px;line-height:1.6;margin:0;color:#333">${escapeHtml(reason)}</p>
      </div>
      <p style="font-size:14px;font-weight:900;margin-bottom:10px">Cancelled Items:</p>
      <ul style="font-size:14px;line-height:1.7;margin-bottom:20px">${items}</ul>
      ${isPrepaid ? `
        <p style="font-size:18px;font-weight:900;margin-top:22px">Refund amount: ₹${order.total.toLocaleString("en-IN")}</p>
        <p style="font-size:14px;line-height:1.6;color:#444">Because this was a prepaid order, your money will be credited within 5-6 business days.</p>
      ` : `
        <p style="font-size:14px;line-height:1.6;color:#444">No online refund is needed for this order.</p>
      `}
      <p style="font-size:13px;color:#666;margin-top:24px">If you have any questions or did not request this cancellation, please contact support.</p>
      <p style="font-size:13px;color:#666">Thank you for shopping with terrace.fc.</p>
    </div>
  `
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function brandLogoHtml(options?: { dark?: boolean; accent?: string }) {
  const dark = options?.dark ?? false
  const textColor = dark ? "#ffffff" : "#171717"
  const accent = options?.accent || "#e50914"

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 4px;border-collapse:collapse">
      <tr>
        <td style="padding:0;text-align:center;vertical-align:middle">
          <div style="font-size:24px;font-weight:900;letter-spacing:-0.5px;color:${textColor};line-height:1;text-align:center;white-space:nowrap">terrace<span style="color:${accent};letter-spacing:0">.</span><span style="letter-spacing:-0.5px">fc</span></div>
        </td>
      </tr>
    </table>
  `
}

function getAdminOrdersUrl() {
  return `${getSiteOrigin()}/admin`
}

function getSiteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL
  const origin = configured || "https://www.terracefc.com"
  return origin.replace(/\/$/, "")
}
