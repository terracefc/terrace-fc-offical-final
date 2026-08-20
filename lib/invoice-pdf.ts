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

// Every attachment is composed from the specific customer's order details.
export function createInvoicePdf(order: StoreOrder) {
  const invoiceNumber = `INV-${getOrderDisplayId(order)}`
  const awb = order.delhiveryWaybill || order.trackingNumber || order.shippingId || "Not assigned"
  const items = order.items.slice(0, 7)
  const patchSummary = getInvoicePatchSummary(order)
  const stream: string[] = []
  const left = 42
  const right = 553
  const width = right - left

  stream.push(strokeRect(28, 28, 539, 786, 1.2))
  // Keep the email attachment at the same visual scale as the website's
  // print invoice (CSS pixels converted to PDF points), rather than using
  // larger, heavier PDF-only typography.
  stream.push(text(left, 780, "terrace", 20, "bold"))
  stream.push(redText(111.5, 780, ".", 20, "bold"))
  stream.push(text(117.2, 780, "fc", 20, "bold"))
  stream.push(text(440, 780, "INVOICE", 20, "bold"))
  stream.push(text(416, 758, `Invoice no: ${invoiceNumber}`, 9, "bold"))
  stream.push(text(416, 743, `Order ID: ${getOrderDisplayId(order)}`, 9, "bold"))
  stream.push(line(left, 730, right, 730, 1.4))

  stream.push(strokeRect(left, 642, 245, 72, 0.8), strokeRect(308, 642, 245, 72, 0.8))
  stream.push(text(left + 10, 697, "CUSTOMER", 8, "bold", 0.3))
  stream.push(text(left + 10, 677, truncate(order.address.name || "Customer", 34), 13, "bold"))
  stream.push(text(left + 10, 659, `Phone: ${truncate(order.address.phone || "-", 28)}`, 9.5))
  stream.push(text(left + 10, 645, `Email: ${truncate(order.address.email || "-", 34)}`, 9.5))
  stream.push(text(318, 697, "DELIVERY", 8, "bold", 0.3))
  stream.push(text(318, 677, "Courier: Delhivery", 9.5, "bold"))
  stream.push(text(318, 659, `AWB: ${truncate(awb, 28)}`, 9.5, "bold"))
  stream.push(text(318, 645, `Order date: ${formatInvoiceDate(order.createdAt)}`, 9))

  const tableTop = 620
  const columns = { item: left, size: 346, qty: 407, price: 458, end: right }
  stream.push(fillRect(left, tableTop - 24, width, 24, 0.93))
  stream.push(strokeRect(left, tableTop - 24, width, 24, 0.8))
  stream.push(line(columns.size, tableTop, columns.size, tableTop - 24, 0.8), line(columns.qty, tableTop, columns.qty, tableTop - 24, 0.8), line(columns.price, tableTop, columns.price, tableTop - 24, 0.8))
  stream.push(text(left + 8, tableTop - 16, "JERSEY", 8, "bold", 0.2))
  stream.push(text(columns.size + 15, tableTop - 16, "SIZE", 8, "bold", 0.2))
  stream.push(text(columns.qty + 15, tableTop - 16, "QTY", 8, "bold", 0.2))
  stream.push(text(columns.price + 50, tableTop - 16, "PRICE", 8, "bold", 0.2))

  let rowTop = tableTop - 24
  for (const item of items) {
    const rowHeight = 33
    const rowBottom = rowTop - rowHeight
    stream.push(strokeRect(left, rowBottom, width, rowHeight, 0.55))
    stream.push(line(columns.size, rowTop, columns.size, rowBottom, 0.55), line(columns.qty, rowTop, columns.qty, rowBottom, 0.55), line(columns.price, rowTop, columns.price, rowBottom, 0.55))
    stream.push(text(left + 8, rowTop - 14, truncate(`${item.name}${item.club ? ` - ${item.club}` : ""}`, 47), 9.5, "bold"))
    stream.push(text(left + 8, rowTop - 26, truncate([item.season, getItemOptions(item)].filter(Boolean).join(" | "), 60), 7.5, "normal", 0, 0.35))
    stream.push(centeredText(columns.size, columns.qty, rowTop - 20, item.size || "-", 9.5))
    stream.push(centeredText(columns.qty, columns.price, rowTop - 20, String(item.quantity || 1), 9.5))
    stream.push(rightText(columns.end - 8, rowTop - 20, formatCurrency(getInvoiceItemPriceWithoutPatches(item) * item.quantity), 9.5, "bold"))
    rowTop = rowBottom
  }
  if (!items.length) {
    const rowBottom = rowTop - 33
    stream.push(strokeRect(left, rowBottom, width, 33, 0.55), text(left + 8, rowTop - 20, "Order item", 9.5))
    rowTop = rowBottom
  }

  const totalRows: Array<[string, string]> = [
    [patchSummary.total ? "Jersey subtotal" : "Subtotal", formatCurrency(Math.max(0, order.subtotal - patchSummary.total))],
    ...(patchSummary.total ? [[patchSummary.label, formatCurrency(patchSummary.total)] as [string, string]] : []),
    ...(order.discount ? [[`Discount${order.couponCode ? ` (${order.couponCode})` : ""}`, `-${formatCurrency(order.discount)}`] as [string, string]] : []),
    ["Delivery charges", order.deliveryCharge === 0 ? "FREE" : formatCurrency(order.deliveryCharge)],
    ...(order.convenienceCharge ? [["Convenience charge", formatCurrency(order.convenienceCharge)] as [string, string]] : []),
  ]
  const summaryWidth = 245
  const summaryLeft = right - summaryWidth
  let summaryTop = rowTop - 12
  for (const [label, value] of totalRows) {
    stream.push(strokeRect(summaryLeft, summaryTop - 20, summaryWidth, 20, 0.55))
    stream.push(text(summaryLeft + 9, summaryTop - 14, label, 9.5))
    stream.push(rightText(right - 9, summaryTop - 14, value, 9.5, "bold"))
    summaryTop -= 20
  }
  stream.push(strokeRect(summaryLeft, summaryTop - 27, summaryWidth, 27, 0.8))
  stream.push(text(summaryLeft + 9, summaryTop - 19, "Total", 13, "bold"))
  stream.push(rightText(right - 9, summaryTop - 19, formatCurrency(order.total), 13, "bold"))

  // The handwriting rests directly on the signature line.
  const signatureX = 381
  const signatureLineY = 78
  stream.push("q", "150 0 0 32 382 80 cm", "/Signature Do", "Q")
  // Draw the line after the white signature image so it remains complete end-to-end.
  stream.push(line(signatureX - 4, signatureLineY, 536, signatureLineY, 1))
  stream.push(centeredText(signatureX - 4, 536, 61, "Authorised signature", 9.5, "bold", 0.25))
  stream.push(text(left, 45, "terracefc.com", 7, "bold", 0.15))
  stream.push(text(163, 45, "8147338142", 7, "bold", 0.15))

  return buildPdf(`${stream.join("\n")}\n`)
}

function buildPdf(content: string) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /Signature 7 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
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
    const entry = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`, "ascii"), Buffer.isBuffer(object) ? object : Buffer.from(object, "ascii"), Buffer.from("\nendobj\n", "ascii")])
    parts.push(entry)
    offset += entry.length
  })
  const xrefOffset = offset
  const xref = ["xref", `0 ${objects.length + 1}`, "0000000000 65535 f ", ...offsets.slice(1).map((item) => `${String(item).padStart(10, "0")} 00000 n `)].join("\n")
  return Buffer.concat([...parts, Buffer.from(`${xref}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`, "ascii")])
}

function text(x: number, y: number, value: string, size: number, weight: "normal" | "bold" = "normal", charSpace = 0, gray = 0) {
  return `BT /F${weight === "bold" ? 2 : 1} ${size} Tf ${gray} g ${charSpace} Tc ${x} ${y} Td (${escapePdfText(value)}) Tj ET`
}

function redText(x: number, y: number, value: string, size: number, weight: "normal" | "bold" = "normal") {
  return `BT /F${weight === "bold" ? 2 : 1} ${size} Tf 0.937 0.137 0.235 rg ${x} ${y} Td (${escapePdfText(value)}) Tj ET`
}

function centeredText(left: number, right: number, y: number, value: string, size: number, weight: "normal" | "bold" = "normal", charSpace = 0) {
  const estimatedWidth = value.length * size * (weight === "bold" ? 0.57 : 0.5)
  return text(left + Math.max(0, (right - left - estimatedWidth) / 2), y, value, size, weight, charSpace)
}

function rightText(x: number, y: number, value: string, size: number, weight: "normal" | "bold" = "normal") {
  const estimatedWidth = value.length * size * (weight === "bold" ? 0.57 : 0.5)
  return text(x - estimatedWidth, y, value, size, weight)
}

function line(x1: number, y1: number, x2: number, y2: number, width = 0.6) {
  return `q 0 G ${width} w ${x1} ${y1} m ${x2} ${y2} l S Q`
}

function strokeRect(x: number, y: number, width: number, height: number, lineWidth = 0.6) {
  return `q 0 G ${lineWidth} w ${x} ${y} ${width} ${height} re S Q`
}

function fillRect(x: number, y: number, width: number, height: number, gray: number) {
  return `q ${gray} g ${x} ${y} ${width} ${height} re f Q`
}

function getItemOptions(item: StoreOrder["items"][number]) {
  const customization = item.customization
  if (customization?.patches) return `${customization.patchType || "Sleeve"} patches`
  if (customization?.mode === "original") return "Original player name"
  if (customization?.enabled || customization?.mode === "custom") return `${customization.name || "Custom"} ${customization.number || ""}`.trim()
  return ""
}

function getInvoiceItemPriceWithoutPatches(item: StoreOrder["items"][number]) {
  return Math.max(0, Number(item.price || 0) - (item.customization?.patches ? 200 : 0))
}

function getInvoicePatchSummary(order: StoreOrder) {
  const patchedItems = order.items.filter((item) => item.customization?.patches)
  const total = patchedItems.reduce((sum, item) => sum + 200 * Math.max(1, Number(item.quantity || 1)), 0)
  const patchTypes = Array.from(new Set(patchedItems.map((item) => item.customization?.patchType?.trim()).filter(Boolean)))

  return {
    total,
    label: `Patches${patchTypes.length ? ` (${patchTypes.join(", ")})` : ""}`,
  }
}

function formatCurrency(value: number) {
  return `INR ${Math.max(0, Number(value || 0)).toLocaleString("en-IN")}`
}

function truncate(value: string, length: number) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim()
  return normalized.length > length ? `${normalized.slice(0, Math.max(0, length - 3))}...` : normalized
}

function escapePdfText(value: string) {
  return String(value || "").replace(/[^\x20-\x7E]/g, "?").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
}

function formatInvoiceDate(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-IN") : "-"
}
