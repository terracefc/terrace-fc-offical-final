export type JerseyRequestMessage = {
  id: string
  sender: "customer" | "admin"
  senderName: string
  text: string
  createdAt: string
}

export type JerseyRequestPhoto = {
  id: string
  name: string
  type: string
  size: number
  dataUrl: string
}

export type JerseyRequest = {
  id: string
  name: string
  email: string
  clubOrCountry: string
  playerName: string
  number: string
  year: string
  notes?: string
  photo?: JerseyRequestPhoto
  status: "new" | "reviewed" | "done"
  createdAt: string
  updatedAt: string
  messages?: JerseyRequestMessage[]
}

export function createJerseyRequestId() {
  return `REQ-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${Math.floor(1000 + Math.random() * 9000)}`
}

export function normalizeJerseyRequests(value: unknown): JerseyRequest[] {
  if (!Array.isArray(value)) return []

  return value.filter((request): request is JerseyRequest => {
    return !!request && typeof request === "object" && typeof (request as JerseyRequest).id === "string"
  }).map((request) => ({
    ...request,
    status: request.status === "done" || request.status === "reviewed" ? request.status : "new",
    messages: Array.isArray(request.messages) ? request.messages : [],
  }))
}
