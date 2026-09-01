import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { SiteFsError } from "@/lib/site-fs"
import { getEnvOverview } from "@/lib/site-env"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * `GET /api/sites/[id]/env` — sitenin kök dizinindeki `.env*` dosyalarını
 * ve (varsa) `.env` eksikse kopyalanabilecek örnek dosyayı listeler
 * (bkz. docs/ARCHITECTURE.md → Aşama C, `.env` yönetimi).
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

  try {
    const overview = await getEnvOverview(site)
    return NextResponse.json(overview)
  } catch (error) {
    if (error instanceof SiteFsError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error(".env taraması başarısız:", error)
    return NextResponse.json({ error: ".env dosyaları taranamadı." }, { status: 500 })
  }
}
