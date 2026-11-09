import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { getJob } from "@/lib/site-jobs"

interface RouteParams {
  params: Promise<{ id: string; jobId: string }>
}

/**
 * `GET /api/sites/[id]/jobs/[jobId]` — tek işin durumu ve canlı çıktısı:
 * `{ job, serverNow }`. Önce bellek (canlı), yoksa veritabanı; iş bu siteye
 * ait değilse 404.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }

  const { id, jobId } = await params
  const site = await prisma.site.findUnique({ where: { id }, select: { id: true } })
  if (!site) {
    return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 })
  }
  if (!(await canManageSite(session.userId, site, "VIEW"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  const job = await getJob(id, jobId)
  if (!job) {
    return NextResponse.json({ error: "İş bulunamadı." }, { status: 404 })
  }
  return NextResponse.json({ job, serverNow: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } })
}
