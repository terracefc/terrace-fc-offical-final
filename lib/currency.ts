export type DisplayCurrency = "INR" | "USD"

export const USD_TO_INR_RATE = Number(process.env.NEXT_PUBLIC_USD_TO_INR_RATE || 83)

export function formatMoney(amountInr: number, currency: DisplayCurrency = "INR") {
  const amount = Number(amountInr || 0)
  return `₹${Math.round(amount).toLocaleString("en-IN")}`
}
