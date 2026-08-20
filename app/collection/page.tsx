import { Suspense } from "react"
import { Header } from "@/components/header"
import { FeaturedKits } from "@/components/featured-kits"
import { Footer } from "@/components/footer"
import { CartDrawer } from "@/components/cart-drawer"
import { SearchModal } from "@/components/search-modal"

export default function CollectionPage() {
  return (
    <main className="min-h-screen bg-[#080506] text-white">
      <Header />
      <div className="pt-20">
        <Suspense fallback={<div className="min-h-[70svh] bg-[#080506]" />}>
          <FeaturedKits />
        </Suspense>
      </div>
      <Footer />

      <CartDrawer />
      <SearchModal />
    </main>
  )
}
