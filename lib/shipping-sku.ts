export function getShippingSku(item: {
  id: number
  size: string
  version?: string
  customization?: {
    enabled?: boolean
    mode?: string
    name?: string
  }
}) {
  const id = Number.isFinite(Number(item.id)) ? Math.max(0, Math.floor(Number(item.id))) : 0
  const size = String(item.size || "M").trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "M"
  const backCode = getBackCode(item)
  return ["TFC", String(id).padStart(3, "0"), size, getVersionCode(item), backCode].filter(Boolean).join("-")
}

function getVersionCode(item: { version?: string }) {
  switch (String(item.version || "fan").toLowerCase()) {
    case "player":
      return "PLY"
    case "embroidery":
      return "EMB"
    case "fan":
    default:
      return "FAN"
  }
}

function getBackCode(item: { customization?: { enabled?: boolean; mode?: string; name?: string } }) {
  const mode = String(item.customization?.mode || "").toLowerCase()
  if (item.customization?.enabled || mode === "custom") return `CUS-${getCustomNameCode(item.customization?.name)}`
  if (mode === "plain") return "PLN"
  if (mode === "standard" || mode === "std") return "STD"
  return ""
}

function getCustomNameCode(name = "") {
  const cleanName = name.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
  return (cleanName || "NAM").slice(0, 3).padEnd(3, "X")
}
