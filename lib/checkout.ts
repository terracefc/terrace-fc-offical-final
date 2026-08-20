export const FREE_SHIPPING_ITEM_COUNT = 2
export const FREE_SHIPPING_THRESHOLD = 1199
export const DELIVERY_CHARGE = 100
export const INTERNATIONAL_SHIPPING_USD = 10
export const INTERNATIONAL_FREE_MASTER_COUNT = 5

export function calculateDeliveryCharge(subtotal: number, itemCount = 0) {
  if (subtotal <= 0) return 0
  return DELIVERY_CHARGE
}
