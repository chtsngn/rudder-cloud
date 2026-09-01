import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { MAX_UPLOAD_BYTES, SiteFsError, writeUploadedFile } from "@/lib/site-fs"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * `POST /api/sites/[id]/files/upload?path=<hedef dizin>` — multipart form-data,
 * `files` alanı altında bir veya daha fazla dosya. Panel'in kendi nginx
 * vhost'unda `client_max_body_size` bu sınırla eşleşecek şekilde
 * yükseltildi (bkz. install.sh).
 */
export async function POST(request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }

  const { id } = await params
  const site = await prisma.site.findUnique({ where: { id } })
  if (!site) {
    return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 })
  }
  if (!(await canManageSite(session.userId, site, "EDIT_FILES"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  const targetDir = new URL(request.url).searchParams.get("path") ?? ""

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: "Geçersiz yükleme isteği." }, { status: 400 })
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File)
  if (files.length === 0) {
    return NextResponse.json({ error: "Yüklenecek dosya bulunamadı." }, { status: 400 })
  }

  const uploaded: unknown[] = []
  const errors: { name: string; error: string }[] = []

  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      errors.push({
        name: file.name,
        error: `Çok büyük (azami ${MAX_UPLOAD_BYTES / 1024 / 1024}MB).`,
      })
      continue
    }
    try {
      const buf = Buffer.from(await file.arrayBuffer())
      const entry = await writeUploadedFile(site, targetDir, file.name, buf)
      uploaded.push(entry)
    } catch (error) {
      const message = error instanceof SiteFsError ? error.message : "Yüklenemedi."
      errors.push({ name: file.name, error: message })
    }
  }

  return NextResponse.json({ uploaded, errors }, { status: errors.length > 0 && uploaded.length === 0 ? 400 : 200 })
}
