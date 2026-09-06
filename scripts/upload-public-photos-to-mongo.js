const fs = require("fs")
const path = require("path")
const { MongoClient, GridFSBucket, ServerApiVersion } = require("mongodb")

const root = process.cwd()
const publicDir = path.join(root, "public")
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".jfif"])

loadEnvFile(path.join(root, ".env.local"))
loadEnvFile(path.join(root, ".env"))

const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB || "terracefc"

if (!uri) {
  console.error("MONGODB_URI is missing.")
  process.exit(1)
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue
    const index = trimmed.indexOf("=")
    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim()
    if (key && process.env[key] === undefined) process.env[key] = value
  }
}

function getFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return getFiles(fullPath)
    if (!entry.isFile()) return []
    return imageExtensions.has(path.extname(entry.name).toLowerCase()) ? [fullPath] : []
  })
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === ".svg") return "image/svg+xml"
  if (ext === ".jpg" || ext === ".jpeg" || ext === ".jfif") return "image/jpeg"
  if (ext === ".webp") return "image/webp"
  if (ext === ".gif") return "image/gif"
  return "image/png"
}

function uploadFile(bucket, filePath, publicPath) {
  return new Promise((resolve, reject) => {
    const stat = fs.statSync(filePath)
    const readStream = fs.createReadStream(filePath)
    const uploadStream = bucket.openUploadStream(publicPath, {
      contentType: contentTypeFor(filePath),
      metadata: {
        publicPath,
        source: "public",
        byteLength: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        uploadedAt: new Date().toISOString(),
      },
    })

    readStream.on("error", reject)
    uploadStream.on("error", reject)
    uploadStream.on("finish", resolve)
    readStream.pipe(uploadStream)
  })
}

async function main() {
  const files = getFiles(publicDir)
  const totalBytes = files.reduce((sum, file) => sum + fs.statSync(file).size, 0)
  console.log(`Found ${files.length} public image files (${(totalBytes / 1024 / 1024).toFixed(2)} MB).`)

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 30000,
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  })

  await client.connect()
  const db = client.db(dbName)
  const bucket = new GridFSBucket(db, { bucketName: "public_photos" })
  const filesCollection = db.collection("public_photos.files")

  let uploaded = 0
  let skipped = 0

  for (const file of files) {
    const publicPath = "/" + path.relative(publicDir, file).replace(/\\/g, "/")
    const size = fs.statSync(file).size
    const existing = await filesCollection.findOne({ filename: publicPath, "metadata.byteLength": size })
    if (existing) {
      skipped += 1
      continue
    }

    const oldFiles = await filesCollection.find({ filename: publicPath }).project({ _id: 1 }).toArray()
    for (const oldFile of oldFiles) {
      await bucket.delete(oldFile._id).catch(() => null)
    }

    await uploadFile(bucket, file, publicPath)
    uploaded += 1
    if (uploaded % 25 === 0) console.log(`Uploaded ${uploaded}/${files.length}...`)
  }

  await db.collection("app_storage").updateOne(
    { _id: "public_photos_manifest" },
    {
      $set: {
        value: {
          count: files.length,
          totalBytes,
          totalMb: Number((totalBytes / 1024 / 1024).toFixed(2)),
          updatedAt: new Date().toISOString(),
        },
      },
    },
    { upsert: true },
  )

  const storedCount = await filesCollection.countDocuments({})
  const stored = await filesCollection.aggregate([{ $group: { _id: null, bytes: { $sum: "$length" } } }]).toArray()
  const storedBytes = stored[0]?.bytes || 0

  console.log(JSON.stringify({
    ok: true,
    uploaded,
    skipped,
    storedCount,
    storedMb: Number((storedBytes / 1024 / 1024).toFixed(2)),
  }, null, 2))

  await client.close()
}

main().catch(async (error) => {
  console.error(error)
  process.exit(1)
})
