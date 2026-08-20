import { NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { readFile } from "fs/promises"
import path from "path"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"
import { isAdminRequest } from "@/lib/admin-auth"

const BUCKET = "jersey-photos"

export const dynamic = "force-dynamic"

type UploadBody = {
  image?: string
  previousUrl?: string
  kitId?: number | string
  side?: string
}

export async function GET(request: Request) {
  const sourceUrl = new URL(request.url).searchParams.get("url") || ""
  if (!sourceUrl) {
    return NextResponse.json({ error: "Image URL is required." }, { status: 400 })
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(sourceUrl, request.url)
  } catch {
    return NextResponse.json({ error: "A valid image URL is required." }, { status: 400 })
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return NextResponse.json({ error: "Only web image URLs can be edited." }, { status: 400 })
  }

  const requestOrigin = new URL(request.url).origin
  const safePublicImage = isSafePublicEditableImage(parsedUrl, requestOrigin)
  if (!safePublicImage && !isAdmin(request)) {
    return NextResponse.json({ error: "Admin access is required." }, { status: 401 })
  }

  if (parsedUrl.origin === requestOrigin) {
    const localImage = await readPublicImage(parsedUrl.pathname)
    if (localImage) {
      return NextResponse.json({
        ok: true,
        dataUrl: `data:${localImage.contentType};base64,${localImage.buffer.toString("base64")}`,
      })
    }
  }

  const imageResponse = await fetch(parsedUrl, { cache: "no-store" }).catch(() => null)
  if (!imageResponse?.ok) {
    return NextResponse.json({ error: "Could not load this image for editing." }, { status: 400 })
  }

  const contentType = normalizeImageContentType(
    imageResponse.headers.get("content-type") || "",
    parsedUrl.pathname,
  )
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "This file is not an editable image." }, { status: 400 })
  }

  const buffer = Buffer.from(await imageResponse.arrayBuffer())
  return NextResponse.json({
    ok: true,
    dataUrl: `data:${contentType};base64,${buffer.toString("base64")}`,
  })
}

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Admin access is required." }, { status: 401 })
  }

  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return NextResponse.json({ error: "Supabase Storage is not configured." }, { status: 500 })
  }

  const body = await request.json().catch(() => null) as UploadBody | null
  const parsed = parseDataUrl(body?.image || "")

  if (!parsed) {
    return NextResponse.json({ error: "A valid image is required." }, { status: 400 })
  }

  const bucketReady = await ensureBucket()
  if (bucketReady.error) {
    return NextResponse.json({ error: bucketReady.error }, { status: 500 })
  }

  const kitId = sanitizePathPart(String(body?.kitId || "new"))
  const side = sanitizePathPart(body?.side || "front")
  const extension = extensionFromMime(parsed.contentType)
  const path = `kits/${kitId}/${side}-${Date.now()}-${randomUUID()}.${extension}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, parsed.buffer, {
      cacheControl: "31536000",
      contentType: parsed.contentType,
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message || "Could not upload image." }, { status: 500 })
  }

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)
  const previousPath = getStoragePathFromPublicUrl(body?.previousUrl || "")
  let deletedPrevious = false

  if (previousPath && previousPath !== path) {
    const { error } = await supabaseAdmin.storage.from(BUCKET).remove([previousPath])
    deletedPrevious = !error
  }

  return NextResponse.json({
    ok: true,
    publicUrl: data.publicUrl,
    path,
    deletedPrevious,
  })
}

export async function DELETE(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Admin access is required." }, { status: 401 })
  }

  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return NextResponse.json({ error: "Supabase Storage is not configured." }, { status: 500 })
  }

  const body = await request.json().catch(() => null) as { url?: string } | null
  const path = getStoragePathFromPublicUrl(body?.url || "")
  if (!path) return NextResponse.json({ ok: true, skipped: true })

  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([path])
  if (error) return NextResponse.json({ error: error.message || "Could not delete image." }, { status: 500 })

  return NextResponse.json({ ok: true })
}

function parseDataUrl(source: string) {
  const match = source.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!match) return null

  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  }
}

async function ensureBucket() {
  if (!supabaseAdmin) return { error: "Supabase Storage is not configured." }

  const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets()
  if (listError) return { error: listError.message || "Could not read Storage buckets." }

  const existing = buckets?.find((bucket) => bucket.name === BUCKET)
  if (existing) {
    if (!(existing as { public?: boolean }).public) {
      const { error } = await supabaseAdmin.storage.updateBucket(BUCKET, { public: true })
      return { error: error?.message || null }
    }
    return { error: null }
  }

  const { error } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  })

  return { error: error?.message || null }
}

function getStoragePathFromPublicUrl(publicUrl: string) {
  if (!publicUrl) return ""

  try {
    const url = new URL(publicUrl)
    const marker = `/storage/v1/object/public/${BUCKET}/`
    const index = url.pathname.indexOf(marker)
    if (index === -1) return ""

    return decodeURIComponent(url.pathname.slice(index + marker.length))
  } catch {
    return ""
  }
}

function extensionFromMime(mime: string) {
  if (mime === "image/jpeg") return "jpg"
  if (mime === "image/png") return "png"
  if (mime === "image/gif") return "gif"
  return "webp"
}

function normalizeImageContentType(contentType: string, pathname: string) {
  const cleanType = contentType.split(";")[0].trim().toLowerCase()
  if (cleanType.startsWith("image/")) return cleanType

  const extension = pathname.split(".").pop()?.toLowerCase()
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg"
  if (extension === "png") return "image/png"
  if (extension === "gif") return "image/gif"
  if (extension === "svg") return "image/svg+xml"
  if (extension === "webp") return "image/webp"

  return cleanType
}

async function readPublicImage(pathname: string) {
  const decodedPath = decodeURIComponent(pathname)
  if (!decodedPath.startsWith("/kits/") && !decodedPath.startsWith("/placeholder")) return null

  const publicRoot = path.join(process.cwd(), "public")
  const filePath = path.normalize(path.join(publicRoot, decodedPath))
  if (!filePath.startsWith(publicRoot)) return null

  const contentType = normalizeImageContentType("", decodedPath)
  if (!contentType.startsWith("image/")) return null

  try {
    const buffer = await readFile(filePath)
    return { buffer, contentType }
  } catch {
    return null
  }
}

function isSafePublicEditableImage(url: URL, requestOrigin: string) {
  if (url.origin === requestOrigin) {
    return (
      url.pathname.startsWith("/kits/") ||
      url.pathname.startsWith("/placeholder") ||
      url.pathname.startsWith("/_next/image")
    )
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  if (!supabaseUrl) return false

  try {
    const supabaseOrigin = new URL(supabaseUrl).origin
    return url.origin === supabaseOrigin && url.pathname.includes(`/storage/v1/object/public/${BUCKET}/`)
  } catch {
    return false
  }
}

function sanitizePathPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "item"
}

function isAdmin(request: Request) {
  return isAdminRequest(request)
}
