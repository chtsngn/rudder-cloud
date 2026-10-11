import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import { isSuperAdmin } from "@/lib/permissions"
import { autoLinuxUserFor, defaultSiteRoot, ensureSiteUser, ProvisionError } from "@/lib/provision"
import { prisma } from "@/lib/prisma"
import { resolveSiteWorkdir } from "@/lib/site-paths"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * `POST /api/sites/[id]/ensure-terminal-user` — bu değişiklikten ÖNCE
 * oluşturulmuş siteler için GERİYE DÖNÜK dedicated Linux kullanıcısı kurar.
 * Uygulama: "shared" model (klasör panel'de, grup erişimi). Statik
 * (2026-09-15): "owned" model — dosyalar kullanıcıya devredilir, panel/nginx
 * ACL ile erişir. `config.linuxUser` zaten varsa no-op.
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
  const shared = site.type === "REVERSE_PROXY"

  const cfg = site.config && typeof site.config === "object" ? (site.config as Record<string, unknown>) : {}
  const existing = typeof cfg.linuxUser === "string" ? cfg.linuxUser.trim() : ""
  if (existing) {
    return NextResponse.json(site)
  }

  const linuxUser = autoLinuxUserFor(site.domain)
  try {
    if (shared) {
      const workdir = resolveSiteWorkdir(site)
      if (!workdir) return NextResponse.json({ error: "Çalışma dizini belirlenemedi." }, { status: 400 })
      await ensureSiteUser(site.domain, workdir, linuxUser, "shared")
    } else {
      const siteRoot = typeof cfg.siteRoot === "string" && cfg.siteRoot ? cfg.siteRoot : defaultSiteRoot(site.domain)
      await ensureSiteUser(site.domain, siteRoot, linuxUser, "owned")
    }
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
    detail: `${site.domain} -> ${linuxUser} (${shared ? "shared" : "owned"})`,
  })

  return NextResponse.json(updated)
}
