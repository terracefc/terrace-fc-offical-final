import { getOrderDisplayId, type StoreOrder } from "@/lib/orders"
import { formatExpectedDelivery, getOrderPageUrl, getOrderStatusLabel, getOrderStatusMessage } from "@/lib/tracking"
import { getRedeliveryUrl } from "@/lib/redelivery"

export function orderStatusEmailHtml(order: StoreOrder) {
  const statusLabel = getOrderStatusLabel(order.fulfillmentStatus)
  const message = getOrderStatusMessage(order.fulfillmentStatus)
  const orderUrl = getOrderPageUrl(order.id)
  const customerName = order.address.name || "there"
  const timestamp = new Date().toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  })

  return `
    <div style="margin:0;background:#f5f5f5;padding:24px 12px;font-family:Arial,sans-serif;color:#171717">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:18px;overflow:hidden">
        <div style="background:#171717;color:#ffffff;padding:22px 24px">
          ${brandLogoHtml()}
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.6px;color:#cfcfcf;margin-top:6px">Order Status Update</div>
        </div>
        <div style="padding:24px">
          <p style="font-size:15px;line-height:1.6;margin:0 0 14px">Hi ${escapeHtml(order.address.name)},</p>
          <h1 style="font-size:28px;line-height:1.1;margin:0 0 10px">${escapeHtml(customerName)}, your order progress: ${escapeHtml(statusLabel)}</h1>
          <p style="font-size:15px;line-height:1.6;margin:0 0 22px;color:#444">${escapeHtml(message)}</p>
          <div style="border:1px solid #e5e5e5;border-radius:14px;padding:18px;margin:0 0 22px;background:#fafafa">
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 6px">Order ID</p>
            <p style="font-size:22px;font-weight:900;margin:0 0 14px">${escapeHtml(getOrderDisplayId(order))}</p>
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 6px">Current Status</p>
            <p style="font-size:18px;font-weight:900;margin:0 0 14px">${escapeHtml(statusLabel)}</p>
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 6px">Tracking</p>
            <p style="font-size:14px;margin:0;color:#333">${escapeHtml(order.trackingNumber || order.shippingId || "Tracking number will appear here once available.")}</p>
            <p style="font-size:14px;margin:6px 0 0;color:#333">${escapeHtml(order.courierName || "Courier will appear here once assigned.")}</p>
            ${order.estimatedDelivery ? `<p style="font-size:14px;margin:10px 0 0;color:#333">Estimated delivery: ${escapeHtml(formatExpectedDelivery(order.estimatedDelivery))}</p>` : ""}
          </div>
          <a href="${orderUrl}" style="display:block;text-align:center;background:#171717;color:#ffffff;text-decoration:none;border-radius:12px;padding:14px 18px;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:1px">View Order</a>
          <p style="font-size:12px;color:#777;margin:18px 0 0">Updated automatically at ${escapeHtml(timestamp)}.</p>
          <p style="font-size:13px;color:#666;margin:22px 0 0">Track your order anytime using your order page.</p>
        </div>
      </div>
    </div>
  `
}

export function orderStatusEmailSubject(order: StoreOrder) {
  const customerName = order.address.name || "there"
  return `${customerName}, your order progress: ${getOrderStatusLabel(order.fulfillmentStatus)} - ${getOrderDisplayId(order)}`
}

export function failedShipmentEmailHtml(order: StoreOrder) {
  const recoveryUrl = getRedeliveryUrl(order.id, order.address.email)
  return `
    <div style="margin:0;background:#f5f5f5;padding:24px 12px;font-family:Arial,sans-serif;color:#171717">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:18px;overflow:hidden">
        <div style="background:#171717;color:#ffffff;padding:22px 24px">
          ${brandLogoHtml()}
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.6px;color:#cfcfcf;margin-top:6px">Delivery Needs Attention</div>
        </div>
        <div style="padding:24px">
          <p style="font-size:15px;line-height:1.6;margin:0 0 14px">Hi ${escapeHtml(order.address.name)},</p>
          <h1 style="font-size:28px;line-height:1.1;margin:0 0 10px">We could not deliver your jersey</h1>
          <p style="font-size:15px;line-height:1.6;margin:0 0 20px;color:#444">Confirm the delivery address or enter a different one. We will calculate the current Shiprocket re-shipping fee before payment.</p>
          <div style="border:1px solid #e5e5e5;border-radius:14px;padding:18px;margin:0 0 22px;background:#fafafa">
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 6px">Order ID</p>
            <p style="font-size:20px;font-weight:900;margin:0 0 14px">${escapeHtml(getOrderDisplayId(order))}</p>
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#777;margin:0 0 6px">Tracking ID</p>
            <p style="font-size:14px;font-weight:900;margin:0">${escapeHtml(order.trackingNumber || order.shippingId || "Not available")}</p>
          </div>
          <a href="${recoveryUrl}" style="display:block;text-align:center;background:#171717;color:#ffffff;text-decoration:none;border-radius:12px;padding:15px 18px;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:1px">Get My Jersey Back</a>
          <p style="font-size:12px;color:#777;margin:18px 0 0">This secure link expires in 30 days.</p>
        </div>
      </div>
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

function brandLogoHtml() {
  return `
    <div style="display:flex;align-items:center;gap:10px;margin:0 0 4px">
      <img src="${getSiteOrigin()}/terrace-fc-icon.png" alt="terrace.fc" width="42" height="42" style="display:block;width:42px;height:42px;border-radius:10px;border:0" />
      <div style="font-size:24px;font-weight:900;letter-spacing:-0.5px;color:#ffffff;line-height:1;white-space:nowrap">terrace<span style="color:#e50914;letter-spacing:0">.</span><span style="letter-spacing:-0.5px">fc</span></div>
    </div>
  `
}

function getSiteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL
  const origin = configured || "https://www.terracefc.com"
  return origin.replace(/\/$/, "")
}
