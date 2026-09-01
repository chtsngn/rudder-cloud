import { Readable } from "node:stream"

import { getSession } from "@/lib/auth"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { createZipStream, openReadStream, SiteFsError, statEntry } from "@/lib/site-fs"

interface RouteParams {
  params: Promise<{ id: string }>
}

function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/**
 * `GET /api/sites/[id]/files/download?paths=a,b,c` — tek bir dosya seçiliyse
 * ham içeriği; birden fazla öğe ya da tek bir KLASÖR seçiliyse `archiver` ile
 * akış halinde (belleğe almadan) bir zip döndürür (bkz. site-fs.ts).
 */
export async function GET(request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session) return errorResponse("Yetkisiz erişim.", 401)

  const { id } = await params
  const site = await prisma.site.findUnique({ where: { id } })
  if (!site) return errorResponse("Site bulunamadı.", 404)
  if (!(await canManageSite(session.userId, site, "VIEW"))) {
    return errorResponse("Bu işlem için yetkiniz yok.", 403)
  }

  const raw = new URL(request.url).searchParams.get("paths") ?? ""
  const paths = raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  if (paths.length === 0) {
    return errorResponse("İndirilecek öğe seçilmedi.", 400)
  }

  try {
    if (paths.length === 1) {
      const info = await statEntry(site, paths[0])
      if (info.type === "file") {
        const { stream, size, name } = await openReadStream(site, paths[0])
        const webStream = Readable.toWeb(stream) as ReadableStream
        return new Response(webStream, {
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Length": String(size),
            "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}"`,
          },
        })
      }
    }

    const zipStream = await createZipStream(site, paths)
    const webStream = Readable.toWeb(zipStream) as ReadableStream
    const zipName = paths.length === 1 ? `${paths[0].split("/").pop()}.zip` : `${site.domain}-dosyalar.zip`
    return new Response(webStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(zipName)}"`,
      },
    })
  } catch (error) {
    if (error instanceof SiteFsError) {
      return errorResponse(error.message, error.status)
    }
    console.error("İndirme başarısız:", error)
    return errorResponse("İndirme başarısız oldu.", 500)
  }
}
