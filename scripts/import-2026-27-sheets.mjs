import sharp from "sharp"
import fs from "node:fs/promises"
import path from "node:path"

const generated = "/Users/ITAdmin/.codex/generated_images/019f8035-52d1-7a53-9c5d-d31e8daec714"
const output = path.resolve("public/kits/2026-27")

const sheets = [
  ["exec-930860c9-1f98-4c9c-a0a9-58db4f691681.png", ["real-madrid-louis-vuitton-concept"]],
  ["exec-d85c2e51-8982-40a3-80b9-ebec17c9ce2a.png", ["chelsea-oracle-concept"]],
  ["exec-c45a73e8-3039-469a-85f0-990c5132959c.png", ["manchester-city-black-gold-concept"]],
  ["exec-5aa11c77-8470-4f86-967f-4ec6de5d0320.png", ["ac-milan-home-2026-27", "aston-villa-home-2026-27"]],
  ["exec-388dfa11-f56a-490b-bb0c-3ac0a758cfb7.png", ["barcelona-cross-concept", "bayern-munich-home-2026-27"]],
  ["exec-b4c727ce-f897-485a-9e8e-471388deed83.png", ["borussia-dortmund-vodafone-concept", "psg-home-2026-27"]],
  ["exec-08d4083f-6a6a-4692-ab8a-0da44653ad69.png", ["ac-milan-black-third-2026-27", "psg-white-away-2026-27"]],
  ["exec-c9cd5588-e1fd-4832-ba36-52648da1a5d5.png", ["manchester-united-white-concept", "real-madrid-magenta-away-2026-27"]],
  ["exec-ea6cc924-8fee-4d9a-9d53-e475d5cbf7a6.png", ["manchester-united-blue-away-2026-27", "manchester-city-white-away-2026-27"]],
  ["exec-0d60d5c5-20e3-4c90-bab0-2636d1e92545.png", ["arsenal-home-2026-27", "barcelona-home-2026-27-new"]],
  ["exec-dc0e5dd6-cfd0-4183-ad7a-c6c1f5ff832d.png", ["newcastle-home-2026-27", "ac-milan-white-away-2026-27"]],
  ["exec-f7fb4725-2112-4c5a-972a-baeff6167104.png", ["bayern-munich-white-away-2026-27", "tottenham-home-2026-27"]],
  ["exec-e953878a-984b-487a-b48d-d4eb1e6ec953.png", ["arsenal-gold-away-2026-27", "manchester-city-home-2026-27-new"]],
  ["exec-6482d7e3-c63f-49b8-8f3b-820a19ec5ce2.png", ["celtic-home-2026-27", "arsenal-green-third-2026-27"]],
  ["exec-3e6f57a0-af7f-4089-8fda-6c60607c5b88.png", ["real-madrid-tonal-white-concept", "arsenal-navy-away-2026-27"]],
  ["exec-daf05b0e-a070-4ad2-b650-62034cb29357.png", ["liverpool-white-away-2026-27", "real-madrid-home-long-sleeve-2026-27"]],
  ["exec-ef4bc2ef-7c10-4ec9-92fb-d7db95768868.png", ["real-madrid-magenta-long-sleeve-2026-27", "liverpool-red-long-sleeve-2026-27"]],
  ["exec-bb3bb293-6aa7-476c-a533-d3759e2d32e5.png", ["arsenal-navy-long-sleeve-2026-27"]],
]

await fs.mkdir(output, { recursive: true })

for (const [file, slugs] of sheets) {
  const source = path.join(generated, file)
  const meta = await sharp(source).metadata()
  const width = meta.width
  const height = meta.height
  const rowHeight = Math.floor(height / slugs.length)
  const halfWidth = Math.floor(width / 2)

  for (let row = 0; row < slugs.length; row += 1) {
    const top = row * rowHeight
    const cropHeight = row === slugs.length - 1 ? height - top : rowHeight
    for (const [side, left, cropWidth] of [
      ["front", 0, halfWidth],
      ["back", halfWidth, width - halfWidth],
    ]) {
      await sharp(source)
        .extract({ left, top, width: cropWidth, height: cropHeight })
        .resize(1400, 1400, { fit: "contain", background: "#ffffff" })
        .webp({ quality: 94, effort: 6 })
        .toFile(path.join(output, `${slugs[row]}-${side}.webp`))
    }
  }
}

console.log(`Imported ${sheets.reduce((sum, [, slugs]) => sum + slugs.length, 0)} jersey pairs.`)
