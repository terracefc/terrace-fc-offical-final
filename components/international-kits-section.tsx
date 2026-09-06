import Image from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

const internationalKits = [
  {
    title: "Spain Heritage",
    subtitle: "Retro national classic",
    image: "/homepage-international-spain.png",
    href: "/collection?club=Spain",
    position: "center",
  },
  {
    title: "Portugal Home",
    subtitle: "World Cup red",
    image: "/international-kit-portugal-red.png",
    href: "/collection?club=Portugal",
    position: "center",
  },
  {
    title: "Portugal Away",
    subtitle: "Clean away shirt",
    image: "/international-kit-portugal-away.png",
    href: "/collection?club=Portugal",
    position: "center top",
  },
  {
    title: "Argentina Away",
    subtitle: "Black collector kit",
    image: "/international-kit-argentina-black.png",
    href: "/collection?club=Argentina",
    position: "center 48%",
    zoom: "scale-[1.08]",
  },
]

export function InternationalKitsSection() {
  return (
    <section className="homepage-reveal bg-[#110607] py-10 text-white sm:py-20">
      <div className="mb-6 px-4 sm:mb-8 sm:px-8 lg:px-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-red-300 sm:text-xs sm:tracking-[0.35em]">Best of International Kits</p>
            <h2 className="text-outline-white mt-2 text-3xl font-black uppercase tracking-[0.02em] sm:text-6xl lg:text-7xl">
              International
            </h2>
          </div>
          <Link
            href="/collection?category=world-cup"
            className="inline-flex h-10 w-fit items-center gap-2 border border-red-400/70 px-3 text-[10px] font-black uppercase tracking-widest text-red-100 hover:bg-red-600 hover:text-white sm:h-11 sm:px-4 sm:text-xs"
          >
            Shop International
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="grid gap-2 px-2 sm:grid-cols-2 md:grid-cols-4 md:px-4">
        {internationalKits.map((kit) => (
          <Link
            key={kit.title}
            href={kit.href}
            className="group relative aspect-[4/5] overflow-hidden bg-black text-white"
          >
            <Image
              src={kit.image}
              alt={kit.title}
              fill
              sizes="(max-width: 768px) 100vw, 40vw"
              quality={100}
              className={`object-cover transition-transform duration-700 ${kit.zoom ?? "scale-100"} group-hover:scale-[1.12]`}
              style={{ objectPosition: kit.position }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/10 to-black/75" />
            <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-7">
              <p className="text-[9px] font-black uppercase tracking-[0.22em] text-white/75 sm:text-[10px] sm:tracking-[0.3em]">{kit.subtitle}</p>
              <h3 className="text-outline-white mt-1 text-2xl font-black uppercase tracking-[0.02em] sm:mt-2 sm:text-4xl">{kit.title}</h3>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
