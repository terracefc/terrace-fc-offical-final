import { orderEmailHtml, sendEmail } from "@/lib/email"
import { createInvoiceAttachment } from "@/lib/invoice-pdf"
import { getOrderDisplayId, type StoreOrder } from "@/lib/orders"

export async function sendOrderConfirmationEmails(order: StoreOrder) {
  const customerEmail = order.address?.email?.trim()
  const needsDelhiveryWaybill = String(order.address?.country || "India").trim().toLowerCase() === "india"
  const customerResult = needsDelhiveryWaybill && !order.delhiveryWaybill
    ? { sent: false, reason: "Customer confirmation is waiting for the Delhivery AWB." }
    : customerEmail
      ? await sendEmail({
          to: customerEmail,
          subject: `Order confirmed — terrace.fc ${getOrderDisplayId(order)}`,
          html: orderEmailHtml(order),
          attachments: [createInvoiceAttachment(order)],
        })
      : { sent: false, reason: "Customer email is missing." }

  // sendEmail() already delivers one matching copy of the customer message to
  // the configured store address. A second, separate admin notification made
  // a new order generate two emails for the store.
  const adminResult = {
    sent: customerResult.sent,
    ...(customerResult.sent ? {} : { reason: "The matching customer-email copy could not be sent." }),
  }

  return { customerResult, adminResult }
}
