import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { templateForExtension } from "@/lib/file-templates"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { createFile, createFolder, deleteEntry, listDirectory, SiteFsError, transferEntry } from "@/lib/site-fs"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Dosya yöneticisi (Aşama C) — bu route DİZİN listeleme (GET), dosya/klasör
 * oluşturma (POST; ad iç içe olabilir: `src/app.js`), yeniden adlandırma /
 * taşıma / kopyalama (PATCH) ve silme (DELETE) içindir.
 * Dosya İÇERİĞİ okuma/yazma `./content`, yükleme `./upload`, zip/ham
 * indirme `./download` altında (bkz. docs/ARCHITECTURE.md → Aşama C).
 */
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

  const relPath = new URL(request.url).searchParams.get("path") ?? ""

  try {
    const entries = await listDirectory(site, relPath)
    return NextResponse.json({ path: relPath.replace(/^\/+/, ""), entries })
  } catch (error) {
    if (error instanceof SiteFsError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("Dizin listelenemedi:", error)
    return NextResponse.json({ error: "Dizin listelenemedi." }, { status: 500 })
  }
}

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
  const input = (body ?? {}) as Record<string, unknown>
  const parentPath = typeof input.path === "string" ? input.path : ""
  const name = typeof input.name === "string" ? input.name.trim() : ""
  const kind = input.kind === "folder" ? "folder" : input.kind === "file" ? "file" : null

  if (!name || !kind) {
    return NextResponse.json({ error: "Ad ve tür (dosya/klasör) gereklidir." }, { status: 400 })
  }

  try {
    if (kind === "folder") {
      const entry = await createFolder(site, parentPath, name)
      return NextResponse.json({ entry }, { status: 201 })
    }

    let content = ""
    if (typeof input.template === "string" && input.template) {
      const tpl = templateForExtension(input.template)
      if (tpl) content = tpl.content
    }
    const entry = await createFile(site, parentPath, name, content)
    return NextResponse.json({ entry }, { status: 201 })
  } catch (error) {
    if (error instanceof SiteFsError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("Dosya/klasör oluşturulamadı:", error)
    return NextResponse.json({ error: "Oluşturulamadı." }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }

  const { id } = await params
  const site = await prisma.site.findUnique({ where: { id } })
  if (!site) {
    return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 })
  }
  if (!(await canManageSite(session.userId, site, "DELETE"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  const relPath = new URL(request.url).searchParams.get("path")
  if (!relPath) {
    return NextResponse.json({ error: "Silinecek yol belirtilmedi." }, { status: 400 })
  }

  try {
    await deleteEntry(site, relPath)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof SiteFsError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("Silinemedi:", error)
    return NextResponse.json({ error: "Silinemedi." }, { status: 500 })
  }
}

/**
 * `PATCH /api/sites/[id]/files` — body: `{ from, to, mode?: "move" | "copy" }`.
 * `to` site köküne göre TAM hedef yoldur (yeniden adlandırma = aynı klasörde
 * yeni ad). Hedef varsa üzerine yazılmaz (409).
 */
export async function PATCH(request: Request, { params }: RouteParams) {
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
  const input = (body ?? {}) as Record<string, unknown>
  const from = typeof input.from === "string" ? input.from : ""
  const to = typeof input.to === "string" ? input.to.trim() : ""
  const mode = input.mode === "copy" ? "copy" : "move"
  if (!from || !to) {
    return NextResponse.json({ error: "Kaynak ve hedef yol gereklidir." }, { status: 400 })
  }

  try {
    const entry = await transferEntry(site, from, to, mode)
    return NextResponse.json({ entry })
  } catch (error) {
    if (error instanceof SiteFsError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("Taşıma/kopyalama başarısız:", error)
    return NextResponse.json({ error: "İşlem başarısız oldu." }, { status: 500 })
  }
}
