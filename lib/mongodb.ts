import { MongoClient, ServerApiVersion, type Collection, type Db } from "mongodb"

const uri = process.env.MONGODB_URI || ""
const dbName = process.env.MONGODB_DB || "terracefc"

export const isMongoConfigured = Boolean(uri)

let clientPromise: Promise<MongoClient> | null = null

export function getMongoClient() {
  if (!isMongoConfigured) return null

  if (!clientPromise) {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 10000,
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    })
    clientPromise = client.connect()
  }

  return clientPromise
}

export async function getMongoDb(): Promise<Db | null> {
  const client = await getMongoClient()
  return client ? client.db(dbName) : null
}

export async function getMongoCollection<T extends Record<string, unknown>>(name: string): Promise<Collection<T> | null> {
  const db = await getMongoDb()
  return db ? db.collection<T>(name) : null
}

export async function readMongoSingleton<T>(collectionName: string, id: string, fallback: T) {
  try {
    const collection = await getMongoCollection<{ _id: string; value?: T; updatedAt?: string }>(collectionName)
    if (!collection) return { value: fallback, configured: false as const, error: "MongoDB is not configured." }
    const document = await collection.findOne({ _id: id })
    return { value: document?.value ?? fallback, configured: true as const, error: null }
  } catch (error) {
    return { value: fallback, configured: true as const, error: error instanceof Error ? error.message : "MongoDB could not be read." }
  }
}

export async function writeMongoSingleton<T>(collectionName: string, id: string, value: T) {
  try {
    const collection = await getMongoCollection<{ _id: string; value?: T; updatedAt?: string }>(collectionName)
    if (!collection) return { ok: false, error: "MongoDB is not configured." }
    await collection.updateOne(
      { _id: id },
      { $set: { value, updatedAt: new Date().toISOString() } },
      { upsert: true },
    )
    return { ok: true, error: null }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "MongoDB could not be saved." }
  }
}
