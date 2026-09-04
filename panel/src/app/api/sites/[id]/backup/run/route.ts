import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { BackupError } from "@/lib/backup"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { runBackupForSite } from "@/lib/run-backup"

interface RouteParams {
  params: Promise<{ id: string }>
}

/** `POST /api/sites/[id]/backup/run` — manuel "şimdi yedekle" tetikleyicisi. */
export async function POST(_request: Request, { params }: RouteParams) {
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

  try {
    const result = await runBackupForSite(site)
    const updated = await prisma.site.update({
      where: { id },
      data: {
        lastBackupAt: new Date(),
        lastBackupOk: true,
        lastBackupError: result.s3Error
          ? result.s3Error.includes("yükleme") || result.s3Error.includes("yapılandırma")
            ? result.s3Error
            : `Bulut depolamaya yükleme başarısız: ${result.s3Error}`
          : null,
      },
    })
    return NextResponse.json({ ...result, site: updated })
  } catch (error) {
    const message = error instanceof BackupError ? error.message : "Yedekleme başarısız oldu."
    const status = error instanceof BackupError ? error.status : 500
    const updated = await prisma.site.update({
      where: { id },
      data: { lastBackupAt: new Date(), lastBackupOk: false, lastBackupError: message },
    })
    return NextResponse.json({ error: message, site: updated }, { status })
  }
}
