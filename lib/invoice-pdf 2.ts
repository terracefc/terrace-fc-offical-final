import { getOrderDisplayId, type StoreOrder } from "@/lib/orders"
import { INVOICE_SIGNATURE_FLATE_BASE64, INVOICE_SIGNATURE_HEIGHT, INVOICE_SIGNATURE_WIDTH } from "@/lib/invoice-signature"

export type EmailAttachment = {
  filename: string
  content: Buffer
  contentType: string
}

export function createInvoiceAttachment(order: StoreOrder): EmailAttachment {
  return {
    filename: `terrace-fc-invoice-${getOrderDisplayId(order)}.pdf`,
    content: createInvoicePdf(order),
    contentType: "application/pdf",
  }
}

export function createInvoicePdf(order: StoreOrder) {
  const lines = [
    { text: "terrace.fc", size: 22, gap: 30 },
    { text: "TAX INVOICE", size: 13, gap: 20 },
    { text: `Invoice: ${getOrderDisplayId(order)}`, size: 11 },
    { text: `Order date: ${formatInvoiceDate(order.createdAt)}`, size: 10, gap: 16 },
    { text: "BILL TO", size: 10, gap: 14 },
    { text: order.address.name || "Customer", size: 10 },
    { text: order.address.email || "", size: 10 },
    { text: order.address.phone || "", size: 10 },
    { text: [order.address.houseNumber, order.address.address, order.address.city, order.address.state, order.address.pincode].filter(Boolean).join(", "), size: 10, gap: 18 },
    { text: "ITEMS", size: 10, gap: 14 },
    ...order.items.slice(0, 9).flatMap((item) => [
      { text: `${item.name} | ${item.club} | Size ${item.size} | Qty ${item.quantity}${formatItemOptions(item)}`, size: 10 },
      { text: `INR ${(item.price * item.quantity).toLocaleString("en-IN")}`, size: 10, gap: 10 },
    ]),
    { text: "ORDER SUMMARY", size: 10, gap: 14 },
    { text: `Subtotal: INR ${order.subtotal.toLocaleString("en-IN")}`, size: 10 },
    ...(order.discount ? [{ text: `Discount: -INR ${order.discount.toLocaleString("en-IN")}`, size: 10 }] : []),
    { text: `Delivery: ${order.deliveryCharge === 0 ? "FREE" : `INR ${order.deliveryCharge.toLocaleString("en-IN")}`}`, size: 10 },
    ...(order.convenienceCharge ? [{ text: `Convenience: INR ${order.convenienceCharge.toLocaleString("en-IN")}`, size: 10 }] : []),
    { text: `TOTAL: INR ${order.total.toLocaleString("en-IN")}`, size: 12, gap: 22 },
    { text: `Order status: Confirmed`, size: 10 },
    { text: "Courier: Delhivery", size: 10 },
    ...(order.delhiveryWaybill || order.trackingNumber || order.shippingId ? [{ text: `AWB: ${order.delhiveryWaybill || order.trackingNumber || order.shippingId}`, size: 10 }] : []),
    { text: "Thank you for shopping with terrace.fc.", size: 10 },
  ]

  const stream = ["BT", "/F1 11 Tf", "50 795 Td"]
  for (const line of lines) {
    stream.push(`/F1 ${line.size} Tf`)
    stream.push(`(${escapePdfText(line.text)}) Tj`)
    stream.push(`0 -${line.gap || 14} Td`)
  }
  stream.push("ET")

  stream.push("q", "1 w", "365 54 m", "535 54 l", "S", "Q")
  stream.push("BT", "/F1 10 Tf", "393 40 Td", "(Authorised signature) Tj", "ET")
  stream.push("q", "170 0 0 36 365 65 cm", "/Signature Do", "Q")
  const content = `${stream.join("\n")}\n`
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> /XObject << /Signature 6 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}endstream`,
    Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${INVOICE_SIGNATURE_WIDTH} /Height ${INVOICE_SIGNATURE_HEIGHT} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${Buffer.from(INVOICE_SIGNATURE_FLATE_BASE64, "base64").length} >>\nstream\n`, "ascii"),
      Buffer.from(INVOICE_SIGNATURE_FLATE_BASE64, "base64"),
      Buffer.from("\nendstream", "ascii"),
    ]),
  ]

  const parts = [Buffer.from("%PDF-1.4\n", "ascii")]
  const offsets = [0]
  let offset = parts[0].length
  objects.forEach((object, index) => {
    offsets.push(offset)
    const entry = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`, "ascii"),
      Buffer.isBuffer(object) ? object : Buffer.from(object, "ascii"),
      Buffer.from("\nendobj\n", "ascii"),
    ])
    parts.push(entry)
    offset += entry.length
  })
  const xrefOffset = offset
  const xref = ["xref", `0 ${objects.length + 1}`, "0000000000 65535 f ", ...offsets.slice(1).map((item) => `${String(item).padStart(10, "0")} 00000 n `)].join("\n")
  const trailer = `\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.concat([...parts, Buffer.from(`${xref}${trailer}`, "ascii")])
}

function formatItemOptions(item: StoreOrder["items"][number]) {
  const customization = item.customization
  const options: string[] = []
  if (customization?.mode === "original") options.push("Original player name")
  if (customization?.enabled || customization?.mode === "custom") {
    options.push(`Custom: ${customization.name || "Name"} ${customization.number || "00"}`)
  }
  if (customization?.patches) options.push(`${customization.patchType || "Sleeve"} patches`)
  return options.length ? ` | ${options.join(" | ")}` : ""
}

function escapePdfText(value: string) {
  return String(value || "")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
}

function formatInvoiceDate(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString("en-IN") : ""
}
