import fs from "node:fs/promises"
import path from "node:path"

const projectRoot = path.resolve(import.meta.dirname, "..")
const exportRoot = "/Users/ITAdmin/Downloads/Terrace FC Jersey Photo Backup"
const inventoryUrl = "https://www.terracefc.com/api/inventory"

const clean = (value) => String(value || "Unknown")
  .replace(/[\/:*?"<>|]/g, "-")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 150)

async function materialize(assetUrl, target) {
  if (!assetUrl) return false
  const relative = assetUrl.split("?")[0].replace(/^\//, "")
  const local = path.join(projectRoot, "public", relative)
  try {
    await fs.copyFile(local, target)
    return true
  } catch {}

  const response = await fetch(new URL(assetUrl, "https://www.terracefc.com"))
  if (!response.ok) return false
  await fs.writeFile(target, Buffer.from(await response.arrayBuffer()))
  return true
}

await fs.mkdir(exportRoot, { recursive: true })
const response = await fetch(inventoryUrl)
if (!response.ok) throw new Error(`Inventory request failed: ${response.status}`)
const { kits } = await response.json()
const manifest = []

for (const kit of kits.filter((item) => item.productType !== "f1")) {
  const label = clean(`${kit.club} - ${kit.name} - ${kit.season}`)
  const folder = path.join(exportRoot, label)
  await fs.mkdir(folder, { recursive: true })

  for (const [side, asset] of [["Front", kit.image], ["Back", kit.backImage || kit.image]]) {
    if (!asset) continue
    const extension = path.extname(asset.split("?")[0]) || ".webp"
    await materialize(asset, path.join(folder, `${label} - ${side}${extension}`))
  }

  const details = [
    `Product: ${kit.name}`,
    `Club/Country: ${kit.club}`,
    `Season: ${kit.season}`,
    `Description: ${kit.description || ""}`,
    `Website ID: ${kit.id}`,
    `Current front asset: ${kit.image || ""}`,
    `Current back asset: ${kit.backImage || ""}`,
  ].join("\n")
  await fs.writeFile(path.join(folder, "Description.txt"), `${details}\n`)
  manifest.push(details)
}

const standardized = path.join(projectRoot, "public/kits/processed/standardized-source")
try {
  await fs.cp(standardized, path.join(exportRoot, "Original standardized source archive"), { recursive: true })
} catch {}

await fs.writeFile(path.join(exportRoot, "Catalogue manifest.txt"), `${manifest.join("\n\n---\n\n")}\n`)
console.log(`Exported ${manifest.length} products to ${exportRoot}`)
