import type { Metadata } from "next"
import "./globals.css"
import { AbandonedCartReminder } from "@/components/abandoned-cart-reminder"
import { CustomerSessionSync } from "@/components/customer-session-sync"
import { PhotoLoadGate } from "@/components/photo-load-gate"
import { StoreAnalytics } from "@/components/store-analytics"
import { Toaster } from "@/components/ui/sonner"
import { StoreProvider } from "@/lib/store-context"
import { ConfirmDialogHost } from "@/components/confirm-dialog-host"
import { NotificationSoundEffects } from "@/components/notification-sound-effects"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { SupportFloatingButton } from "@/components/support-floating-button"

export const metadata: Metadata = {
  metadataBase: new URL("https://terracefc.com"),
  title: "Football Jerseys & Retro Kits | terrace.fc",
  description: "Shop football jerseys, retro football kits and new-season club shirts at terrace.fc. Premium fan and player jersey options, delivered across India.",
  keywords: ["football jerseys", "football jersey", "retro football jerseys", "club jerseys", "Real Madrid jersey", "Manchester United jersey", "football kits India", "terrace fc"],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "terrace.fc",
    title: "Football Jerseys & Retro Kits | terrace.fc",
    description: "New-season football jerseys and retro kits, delivered across India.",
    images: [{ url: "/kits/2026-27/real-madrid-away-2026-27-campaign.png", width: 1672, height: 936, alt: "Real Madrid 2026-27 football jerseys" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Football Jerseys & Retro Kits | terrace.fc",
    description: "New-season football jerseys and retro kits, delivered across India.",
    images: ["/kits/2026-27/real-madrid-away-2026-27-campaign.png"],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "terrace.fc",
              url: "https://terracefc.com",
              description: "Football jerseys, retro football kits and new-season club shirts.",
            }),
          }}
        />
        <StoreProvider>
          <PhotoLoadGate>
            <CustomerSessionSync />
            {children}
            <StoreAnalytics />
            <AbandonedCartReminder />
          </PhotoLoadGate>
          <Toaster />
          <NotificationSoundEffects />
          <ConfirmDialogHost />
        </StoreProvider>
        <SupportFloatingButton />
        <SpeedInsights />
      </body>
    </html>
  )
}
