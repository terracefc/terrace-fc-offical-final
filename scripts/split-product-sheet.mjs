import fs from "node:fs"
import { createRequire } from "node:module"

const runtimeRequire = createRequire("/Users/ITAdmin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json")
const sharp = runtimeRequire("sharp")

const [source, slug] = process.argv.slice(2)
if (!source || !slug) {
  throw new Error("Usage: node scripts/split-product-sheet.mjs <sheet> <slug>")
}

const outputDirectory = "public/kits/new-club-drop"
fs.mkdirSync(outputDirectory, { recursive: true })

const sourceBuffer = fs.readFileSync(source)
const metadata = await sharp(sourceBuffer).metadata()
const width = metadata.width || 0
const height = metadata.height || 0
if (!width || !height || width !== height * 2 || width % 2 !== 0) {
  throw new Error(`Expected an exact 2:1 sheet, received ${width}x${height}.`)
}

for (const [side, left] of [["front", 0], ["back", width / 2]]) {
  const half = await sharp(sourceBuffer)
    .extract({ left, top: 0, width: width / 2, height })
    .toBuffer()
  const cropped = await sharp(half)
    .trim({ background: "#ffffff", threshold: 12 })
    .toBuffer()

  const normalized = await sharp(cropped)
    .resize(760, 760, { fit: "contain", background: "#ffffff" })
    .toBuffer()

  await sharp({
    create: { width: 887, height: 887, channels: 3, background: "#ffffff" },
  })
    .composite([{ input: normalized, gravity: "centre" }])
    .webp({ quality: 92 })
    .toFile(`${outputDirectory}/${slug}-${side}.webp`)
}

console.log(`Created ${slug}-front.webp and ${slug}-back.webp`)
