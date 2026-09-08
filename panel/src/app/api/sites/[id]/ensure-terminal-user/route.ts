import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import { isSuperAdmin } from "@/lib/permissions"
import { autoLinuxUserFor, ensureSiteUser, ProvisionError } from "@/lib/provision"
import { prisma } from "@/lib/prisma"
import { resolveSiteWorkdir } from "@/lib/site-paths"

interface RouteParams {
  params: Promise<{ id: string }>
}

const SHARED_PROCESS_TYPES = new Set(["NODEJS", "PYTHON", "REVERSE_PROXY", "DOCKER"])

/**
 * `POST /api/sites/[id]/ensure-terminal-user` — bu değişiklikten ÖNCE
 * oluşturulmuş Node.js/Python/Ters Proxy/Docker siteleri için GERİYE DÖNÜK
 * dedicated bir Linux kullanıcısı kurar (bkz. docs/ARCHITECTURE.md
 * 2026-09-08 güncellemesi). Yeni siteler bunu zaten oluşturma anında otomatik
 * alıyor (bkz. /api/sites route.ts -> autoLinuxUserFor) — bu uç nokta SADECE
 * `config.linuxUser` henüz yoksa devreye giriyor, zaten varsa no-op döner.
 * STATIC/PHP/WORDPRESS'e KASITLI kapalı: onların kendi (tam sahiplik devri
 * ile çalışan, buradan FARKLI) dedicated-kullanıcı akışı zaten var.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  const { id } = await params
  const site = await prisma.site.findUnique({ where: { id } })
  if (!site) {
    return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 })
  }
  if (!SHARED_PROCESS_TYPES.has(site.type)) {
    return NextResponse.json(
      { error: "Bu site türü için ayrı bir terminal kullanıcısı gerekmiyor." },
      { status: 400 }
    )
  }

  const cfg = site.config && typeof site.config === "object" ? (site.config as Record<string, unknown>) : {}
  const existing = typeof cfg.linuxUser === "string" ? cfg.linuxUser.trim() : ""
  if (existing) {
    return NextResponse.json(site)
  }

  const workdir = resolveSiteWorkdir(site)
  if (!workdir) {
    return NextResponse.json({ error: "Çalışma dizini belirlenemedi." }, { status: 400 })
  }
  const linuxUser = autoLinuxUserFor(site.domain)

  try {
    await ensureSiteUser(site.domain, workdir, linuxUser)
  } catch (error) {
    const message = error instanceof ProvisionError ? error.message : "Kullanıcı oluşturulamadı."
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const updated = await prisma.site.update({
    where: { id },
    data: { config: { ...cfg, linuxUser } },
  })

  await logAudit({
    userId: session.userId,
    action: "SITE_TERMINAL_USER_CREATED",
    targetType: "Site",
    targetId: id,
    detail: `${site.domain} -> ${linuxUser}`,
  })

  return NextResponse.json(updated)
}
