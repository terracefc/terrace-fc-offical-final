import { Header } from "@/components/header"
import { Hero } from "@/components/hero"
import { InternationalKitsSection } from "@/components/international-kits-section"
import { NewDropsSection } from "@/components/new-drops-section"
import { FeaturedCategories } from "@/components/featured-categories"
import { Newsletter } from "@/components/newsletter"
import { Footer } from "@/components/footer"
import { CartDrawer } from "@/components/cart-drawer"
import { SearchModal } from "@/components/search-modal"

export default function Home() {
  return (
    <main className="min-h-screen">
      <Header />
      <Hero />
      <InternationalKitsSection />
      <NewDropsSection />
      <FeaturedCategories />
      <Newsletter />
      <Footer />
      
      {/* Dynamic Overlays */}
      <CartDrawer />
      <SearchModal />
    </main>
  )
}
