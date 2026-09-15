import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { checkDomainDns } from "@/lib/dns-check"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

interface RouteParams {
  params: Promise<{ id: string }>
}

/** `GET /api/sites/[id]/dns-check` — alan adı bu sunucuya (ya da Cloudflare'a) çözümleniyor mu? */
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

  const cfg = (site.config ?? {}) as Record<string, unknown>
  const www = cfg.www === true || cfg.www === "true"
  return NextResponse.json(await checkDomainDns(site.domain, www))
}
