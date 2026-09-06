export const CONFIRM_ACTION_EVENT = "terrace-confirm-action"

export type ConfirmActionRequest = {
  id: string
  message: string
  resolve: (confirmed: boolean) => void
}

export function confirmAction(message: string) {
  if (typeof window === "undefined") return Promise.resolve(false)

  return new Promise<boolean>((resolve) => {
    const id = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
    window.dispatchEvent(
      new CustomEvent<ConfirmActionRequest>(CONFIRM_ACTION_EVENT, {
        detail: { id, message, resolve },
      }),
    )
  })
}
