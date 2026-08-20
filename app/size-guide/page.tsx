import Link from "next/link"
import { ArrowLeft, Ruler } from "lucide-react"

const fanRows = [
  { size: "S", chest: "36-37", length: "27" },
  { size: "M", chest: "38-39", length: "28" },
  { size: "L", chest: "40-41", length: "29" },
  { size: "XL", chest: "42-43", length: "29.5" },
  { size: "XXL", chest: "44-45", length: "30" },
]

const playerRows = [
  { size: "S", chest: "34-36", length: "26" },
  { size: "M", chest: "36-38", length: "27" },
  { size: "L", chest: "38-40", length: "28" },
  { size: "XL", chest: "40-42", length: "29" },
  { size: "XXL", chest: "42-44", length: "29.5" },
]

const kidsRows = [
  { size: "16", age: "1-2 Years", length: "14-16", width: "10-12" },
  { size: "18", age: "2-3 Years", length: "15-17", width: "11-13" },
  { size: "20", age: "3-4 Years", length: "16-18", width: "12-14" },
  { size: "22", age: "4-5 Years", length: "17-19", width: "13-15" },
  { size: "24", age: "5-6 Years", length: "18-20", width: "14-16" },
  { size: "26", age: "6-7 Years", length: "19-21", width: "15-17" },
  { size: "28", age: "7-8 Years", length: "20-22", width: "16-18" },
  { size: "30", age: "8-10 Years", length: "21-23", width: "17-19" },
  { size: "32", age: "10-12 Years", length: "22-24", width: "18-20" },
  { size: "34", age: "12-14 Years", length: "23-25", width: "19-21" },
]

export default function SizeGuidePage() {
  return (
    <main className="min-h-screen bg-[#080506] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/60 hover:text-red-300">
          <ArrowLeft className="h-4 w-4" />
          Home
        </Link>

        <section className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-600/20 text-red-200">
              <Ruler className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-red-300">Simple Fit Guide</p>
              <h1 className="text-outline-white text-4xl font-black uppercase tracking-normal sm:text-6xl">Size Guide</h1>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <AdultTable title="Fan / Master / Embroidered" subtitle="Regular supporter fit." rows={fanRows} />
            <AdultTable title="Player Version" subtitle="Tighter athletic fit." rows={playerRows} />
          </div>

          <div className="mt-6">
            <KidsTable />
          </div>
        </section>
      </div>
    </main>
  )
}

function AdultTable({ title, subtitle, rows }: { title: string; subtitle: string; rows: typeof fanRows }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/35">
      <div className="border-b border-white/10 p-4">
        <h2 className="font-black uppercase tracking-widest">{title}</h2>
        <p className="mt-1 text-xs font-bold text-white/60">{subtitle}</p>
      </div>
      <table className="w-full text-left text-sm">
        <thead className="bg-black text-white/70">
          <tr>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest">Size</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest">Chest</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest">Length</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.size} className="border-t border-white/10">
              <td className="px-4 py-3 font-black">{row.size}</td>
              <td className="px-4 py-3 text-white/70">{row.chest} in</td>
              <td className="px-4 py-3 text-white/70">{row.length} in</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function KidsTable() {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/35">
      <div className="border-b border-white/10 p-4">
        <h2 className="font-black uppercase tracking-widest">Kids Football Jerseys</h2>
        <p className="mt-1 text-xs font-bold text-white/60">Customers see the age. Admin/order uses the jersey size number.</p>
      </div>
      <table className="w-full min-w-[620px] text-left text-sm">
        <thead className="bg-black text-white/70">
          <tr>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest">Jersey Size</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest">Approx. Age</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest">Length</th>
            <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest">Width</th>
          </tr>
        </thead>
        <tbody>
          {kidsRows.map((row) => (
            <tr key={row.size} className="border-t border-white/10">
              <td className="px-4 py-3 font-black">{row.size}</td>
              <td className="px-4 py-3 text-white/70">{row.age}</td>
              <td className="px-4 py-3 text-white/70">{row.length} in</td>
              <td className="px-4 py-3 text-white/70">{row.width} in</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
