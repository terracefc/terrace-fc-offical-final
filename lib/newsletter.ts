export type NewsletterSubscriber = {
  email: string
  createdAt: string
  source?: string
}

const NEWSLETTER_KEY = "terrace_newsletter_subscribers"

export function readLocalNewsletterSubscribers() {
  if (typeof window === "undefined") return [] as NewsletterSubscriber[]
  try {
    const stored = window.localStorage.getItem(NEWSLETTER_KEY)
    if (!stored) return []
    return normalizeNewsletterSubscribers(JSON.parse(stored))
  } catch {
    return []
  }
}

export function saveLocalNewsletterSubscriber(email: string) {
  if (typeof window === "undefined") return
  const normalizedEmail = email.trim().toLowerCase()
  const existing = readLocalNewsletterSubscribers()
  const next = [
    { email: normalizedEmail, createdAt: new Date().toISOString(), source: "footer" },
    ...existing.filter((subscriber) => subscriber.email !== normalizedEmail),
  ]
  window.localStorage.setItem(NEWSLETTER_KEY, JSON.stringify(next))
}

export function normalizeNewsletterSubscribers(value: unknown) {
  if (!Array.isArray(value)) return [] as NewsletterSubscriber[]
  const subscribers: NewsletterSubscriber[] = []

  value.forEach((item) => {
    if (!item || typeof item !== "object") return
      const subscriber = item as Partial<NewsletterSubscriber>
      const email = String(subscriber.email || "").trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(email)) return
    subscribers.push({
        email,
        createdAt: subscriber.createdAt || new Date().toISOString(),
        source: subscriber.source || "footer",
    })
  })

  return subscribers
}
