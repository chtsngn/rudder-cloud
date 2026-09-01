import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { readTextFile, SiteFsError, writeTextFile } from "@/lib/site-fs"

interface RouteParams {
  params: Promise<{ id: string }>
}

/** `GET /api/sites/[id]/files/content?path=` — bir metin dosyasının içeriğini okur (Monaco için). */
export async function GET(request: Request, { params }: RouteParams) {
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

  const relPath = new URL(request.url).searchParams.get("path")
  if (!relPath) {
    return NextResponse.json({ error: "Yol belirtilmedi." }, { status: 400 })
  }

  try {
    const { content, size } = await readTextFile(site, relPath)
    return NextResponse.json({ path: relPath, content, size })
  } catch (error) {
    if (error instanceof SiteFsError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("Dosya okunamadı:", error)
    return NextResponse.json({ error: "Dosya okunamadı." }, { status: 500 })
  }
}

/** `PUT /api/sites/[id]/files/content?path=` — body: { content }. Monaco'daki "Kaydet". */
export async function PUT(request: Request, { params }: RouteParams) {
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

  const relPath = new URL(request.url).searchParams.get("path")
  if (!relPath) {
    return NextResponse.json({ error: "Yol belirtilmedi." }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 })
  }
  const content = (body as Record<string, unknown> | null)?.content
  if (typeof content !== "string") {
    return NextResponse.json({ error: "Geçersiz içerik." }, { status: 400 })
  }

  try {
    await writeTextFile(site, relPath, content)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof SiteFsError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("Dosya yazılamadı:", error)
    return NextResponse.json({ error: "Dosya yazılamadı." }, { status: 500 })
  }
}
