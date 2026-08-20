import type { Kit } from "@/lib/data"
import { isEmbroideryOnlyKit } from "@/lib/pricing"

const EMBROIDERY_ID_OFFSET = 10000

export function getDisplayKitImages(kit: Kit, inventory: Kit[]) {
  const sourceKit = isEmbroideryOnlyKit(kit)
    ? inventory.find((item) => item.id === kit.id - EMBROIDERY_ID_OFFSET)
    : null

  return {
    image: sourceKit?.image || kit.image,
    backImage: sourceKit?.backImage || sourceKit?.image || kit.backImage || kit.image,
  }
}
