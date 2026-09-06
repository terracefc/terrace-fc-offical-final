export type NotificationSound = "success" | "error"

const soundSources: Record<NotificationSound, string> = {
  success: "/audio/order-success.wav",
  error: "/audio/error.wav",
}

export function playNotificationSound(sound: NotificationSound) {
  if (typeof window === "undefined") return

  const audio = new Audio(soundSources[sound])
  audio.volume = sound === "error" ? 0.62 : 0.7
  void audio.play().catch(() => {
    // Some browsers require a customer interaction before allowing sound.
  })
}
