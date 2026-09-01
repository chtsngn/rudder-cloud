import { Readable } from "node:stream"

import { getSession } from "@/lib/auth"
import { BackupError, openBackupReadStream } from "@/lib/backup"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

interface RouteParams {
  params: Promise<{ id: string }>
}

function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/** `GET /api/sites/[id]/backup/download?file=` — bir yedek dosyasını indirir. */
export async function GET(request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session) return errorResponse("Yetkisiz erişim.", 401)

  const { id } = await params
  const site = await prisma.site.findUnique({ where: { id } })
  if (!site) return errorResponse("Site bulunamadı.", 404)
  if (!(await canManageSite(session.userId, site, "MANAGE_BACKUPS"))) {
    return errorResponse("Bu işlem için yetkiniz yok.", 403)
  }

  const fileName = new URL(request.url).searchParams.get("file")
  if (!fileName) return errorResponse("Dosya belirtilmedi.", 400)

  try {
    const { stream, size } = await openBackupReadStream(site.domain, fileName)
    const webStream = Readable.toWeb(stream) as ReadableStream
    return new Response(webStream, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Length": String(size),
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      },
    })
  } catch (error) {
    if (error instanceof BackupError) return errorResponse(error.message, error.status)
    console.error("Yedek indirilemedi:", error)
    return errorResponse("Yedek indirilemedi.", 500)
  }
}
