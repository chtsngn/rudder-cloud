import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { activeJob, recentJobs } from "@/lib/site-jobs"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * `GET /api/sites/[id]/jobs` — sitenin arka plan işleri (bkz.
 * src/lib/site-jobs.ts): `{ active, recent, serverNow }`. `active` çalışan iş
 * (yoksa null); `recent` en yeni 5 iş, yeniden eskiye (çalışan/bekleyen dahil).
 * `serverNow`: arayüz geçen süreyi sunucu saatine göre hesaplasın diye.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }

  const { id } = await params
  const site = await prisma.site.findUnique({ where: { id }, select: { id: true } })
  if (!site) {
    return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 })
  }
  if (!(await canManageSite(session.userId, site, "VIEW"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  const recent = await recentJobs(id, 5)
  return NextResponse.json(
    { active: activeJob(id), recent, serverNow: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  )
}
