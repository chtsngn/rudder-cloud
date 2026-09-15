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

const SHARED_PROCESS_TYPES = new Set(["NODEJS", "PYTHON", "REVERSE_PROXY", "DOCKER"])
const OWNED_TYPES = new Set(["STATIC", "PHP", "WORDPRESS"])

/**
 * `POST /api/sites/[id]/ensure-terminal-user` — bu değişiklikten ÖNCE
 * oluşturulmuş siteler için GERİYE DÖNÜK dedicated Linux kullanıcısı kurar.
 * Node.js/Python/Ters Proxy/Docker: "shared" model (klasör panel'de, grup
 * erişimi). Static/PHP/WordPress (2026-09-15): "owned" model — dosyalar
 * kullanıcıya devredilir, panel/nginx ACL ile erişir, PHP/WordPress için site
 * başına PHP-FPM havuzu kurulup vhost o sokete çevrilir (root'a ait dosyalar
 * yüzünden WordPress medya yükleme/güncellemenin kırılmasını da düzeltir).
 * `config.linuxUser` zaten varsa no-op.
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
  const shared = SHARED_PROCESS_TYPES.has(site.type)
  const owned = OWNED_TYPES.has(site.type)
  if (!shared && !owned) {
    return NextResponse.json({ error: "Bu site türü için dedicated kullanıcı desteklenmiyor." }, { status: 400 })
  }

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
      const phpVersion =
        site.type === "PHP" || site.type === "WORDPRESS"
          ? typeof cfg.phpVersion === "string" && cfg.phpVersion
            ? cfg.phpVersion
            : "8.3"
          : undefined
      await ensureSiteUser(site.domain, siteRoot, linuxUser, "owned", phpVersion)
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
