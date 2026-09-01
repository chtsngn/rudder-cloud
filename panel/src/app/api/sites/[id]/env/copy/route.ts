import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { SiteFsError } from "@/lib/site-fs"
import { copyEnvFromExample } from "@/lib/site-env"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * `POST /api/sites/[id]/env/copy` — body: { from: ".env.example" | ".env.sample" }.
 * `.env` yoksa örnekten tek tuşla kopyalar; `.env` zaten varsa üzerine YAZMAZ.
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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 })
  }
  const from = (body as Record<string, unknown> | null)?.from
  if (typeof from !== "string") {
    return NextResponse.json({ error: "Kaynak dosya belirtilmedi." }, { status: 400 })
  }

  try {
    const entry = await copyEnvFromExample(site, from)
    return NextResponse.json({ entry })
  } catch (error) {
    if (error instanceof SiteFsError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error(".env kopyalanamadı:", error)
    return NextResponse.json({ error: ".env kopyalanamadı." }, { status: 500 })
  }
}
