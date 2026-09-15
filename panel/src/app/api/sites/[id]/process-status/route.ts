import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { getProcessStatus } from "@/lib/restart"
import { checkSiteUpstream } from "@/lib/upstream-check"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * `GET /api/sites/[id]/process-status` — sitenin GERÇEK durumu: süreç
 * yöneticisine göre (systemd is-active / docker compose ps / pm2) + proxy
 * hedefinde bir şey dinliyor mu (TCP). DB'deki iyimser `status` alanı DEĞİL.
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
  if (!(await canManageSite(session.userId, site, "VIEW"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  const [process, upstream] = await Promise.all([getProcessStatus(site), checkSiteUpstream(site)])
  return NextResponse.json({ process, upstream, checkedAt: new Date().toISOString() })
}
