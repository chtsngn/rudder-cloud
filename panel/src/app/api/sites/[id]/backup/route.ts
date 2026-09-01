import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { BackupError, deleteBackupFile, listBackups } from "@/lib/backup"
import { detectSiteDatabase, type DetectedDatabase } from "@/lib/db-detect"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

interface RouteParams {
  params: Promise<{ id: string }>
}

const MIN_INTERVAL_SECONDS = 300 // 5 dakika — auto-pull'un aksine yedekleme çok daha ağır bir işlem
const MAX_INTERVAL_SECONDS = 30 * 24 * 60 * 60 // 30 gün

/**
 * `user`/`password`/`connectionUri` ASLA istemciye dönmez — `detectSiteDatabase`
 * bunları yalnızca sunucu tarafında dump komutlarını çalıştırmak için taşır
 * (bkz. `run-backup.ts`). Arayüz yalnızca "hangi motor, hangi host/db, hangi
 * dosyadan bulundu" bilgisini gösterir.
 */
function toPublicDetected(detected: DetectedDatabase) {
  return {
    engine: detected.engine,
    host: detected.host,
    port: detected.port,
    database: detected.database,
    source: detected.source,
  }
}

/**
 * `GET /api/sites/[id]/backup` — algılanan veritabanı bilgisi + mevcut
 * zamanlama ayarları + yerel yedek dosyaları listesi (bkz.
 * docs/ARCHITECTURE.md → Aşama D).
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }

  const { id } = await params
  const site = await prisma.site.findUnique({ where: { id } })
  if (!site) {
    return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 })
  }
  if (!(await canManageSite(session.userId, site, "MANAGE_BACKUPS"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  const [detected, backups] = await Promise.all([
    detectSiteDatabase(site).catch(() => null),
    listBackups(site.domain),
  ])

  return NextResponse.json({
    detected: detected ? toPublicDetected(detected) : null,
    backups,
    schedule: {
      backupEnabled: site.backupEnabled,
      backupIntervalSeconds: site.backupIntervalSeconds,
      backupRetentionCount: site.backupRetentionCount,
      backupUploadToS3: site.backupUploadToS3,
      s3ConfigId: site.s3ConfigId,
      lastBackupAt: site.lastBackupAt,
      lastBackupOk: site.lastBackupOk,
      lastBackupError: site.lastBackupError,
    },
  })
}

/** `PATCH /api/sites/[id]/backup` — zamanlama ayarlarını günceller (git-pull PATCH'iyle aynı desen). */
export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }

  const { id } = await params
  const site = await prisma.site.findUnique({ where: { id } })
  if (!site) {
    return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 })
  }
  if (!(await canManageSite(session.userId, site, "MANAGE_BACKUPS"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 })
  }
  const input = (body ?? {}) as Record<string, unknown>
  const data: Record<string, unknown> = {}

  if ("backupEnabled" in input) {
    data.backupEnabled = Boolean(input.backupEnabled)
  }

  if ("backupIntervalSeconds" in input) {
    const n = typeof input.backupIntervalSeconds === "number" ? input.backupIntervalSeconds : Number.NaN
    if (!Number.isInteger(n) || n < MIN_INTERVAL_SECONDS || n > MAX_INTERVAL_SECONDS) {
      return NextResponse.json(
        { error: `Yedekleme aralığı ${MIN_INTERVAL_SECONDS}-${MAX_INTERVAL_SECONDS} saniye arasında olmalı.` },
        { status: 400 }
      )
    }
    data.backupIntervalSeconds = n
  }

  if ("backupRetentionCount" in input) {
    const n = typeof input.backupRetentionCount === "number" ? input.backupRetentionCount : Number.NaN
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      return NextResponse.json({ error: "Saklanacak yedek sayısı 1-100 arasında olmalı." }, { status: 400 })
    }
    data.backupRetentionCount = n
  }

  if ("backupUploadToS3" in input) {
    data.backupUploadToS3 = Boolean(input.backupUploadToS3)
  }

  if ("s3ConfigId" in input) {
    const value = input.s3ConfigId
    if (value === null || value === "") {
      data.s3ConfigId = null
    } else if (typeof value === "string") {
      const exists = await prisma.s3Config.findUnique({ where: { id: value } })
      if (!exists) {
        return NextResponse.json({ error: "Seçili S3 yapılandırması bulunamadı." }, { status: 400 })
      }
      data.s3ConfigId = value
    } else {
      return NextResponse.json({ error: "Geçersiz S3 yapılandırması." }, { status: 400 })
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Güncellenecek bir alan gönderilmedi." }, { status: 400 })
  }

  const updated = await prisma.site.update({ where: { id }, data })
  return NextResponse.json(updated)
}

/** `DELETE /api/sites/[id]/backup?file=` — tek bir yedek dosyasını elle siler. */
export async function DELETE(request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }

  const { id } = await params
  const site = await prisma.site.findUnique({ where: { id } })
  if (!site) {
    return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 })
  }
  if (!(await canManageSite(session.userId, site, "MANAGE_BACKUPS"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  const fileName = new URL(request.url).searchParams.get("file")
  if (!fileName) {
    return NextResponse.json({ error: "Silinecek dosya belirtilmedi." }, { status: 400 })
  }

  try {
    await deleteBackupFile(site.domain, fileName)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof BackupError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("Yedek silinemedi:", error)
    return NextResponse.json({ error: "Yedek silinemedi." }, { status: 500 })
  }
}
