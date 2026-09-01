import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { ProvisionError, serviceAction, serviceStatus } from "@/lib/provision"
import { restartSite, RestartError } from "@/lib/restart"

interface RouteParams {
  params: Promise<{ id: string }>
}

/** systemd tarafından da yönetilebilen tipler — start/stop yalnızca bunlarda ve
 * yalnızca processManager SYSTEMD iken anlamlı (bkz. src/lib/restart.ts). */
const MANAGED_TYPES = new Set(["NODEJS", "PYTHON"])
const VALID_ACTIONS = new Set(["start", "stop", "restart"])

/** systemd `is-active` çıktısını DB'nin SiteStatus enum'ına eşler. */
function systemdStatusToDbStatus(status: string): "ACTIVE" | "STOPPED" | "FAILED" {
  if (status === "active") return "ACTIVE"
  if (status === "failed") return "FAILED"
  return "STOPPED"
}

/**
 * `POST /api/sites/[id]/action` — body: { action: "start" | "stop" | "restart" }
 * Node.js/Python siteler için geçerlidir. `start`/`stop` yalnızca
 * `processManager: SYSTEMD` iken çalışır (panelin kendi oluşturduğu systemd
 * birimi üzerinden); `restart` her `processManager` için `restartSite()`
 * üzerinden doğru yola yönlendirilir (bkz. docs/ARCHITECTURE.md → Aşama B).
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
  if (!MANAGED_TYPES.has(site.type)) {
    return NextResponse.json(
      { error: "Bu site türü için süreç yönetimi desteklenmiyor." },
      { status: 400 }
    )
  }
  if (!(await canManageSite(session.userId, site, "RESTART"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 })
  }

  const { action } = (body ?? {}) as { action?: unknown }
  if (typeof action !== "string" || !VALID_ACTIONS.has(action)) {
    return NextResponse.json(
      { error: "Geçerli bir eylem gereklidir (start, stop, restart)." },
      { status: 400 }
    )
  }

  if (action !== "restart" && site.processManager !== "SYSTEMD") {
    return NextResponse.json(
      {
        error:
          "start/stop yalnızca panelin kendi yönettiği (SYSTEMD) süreçlerde desteklenir — bu site başka bir araçla yönetiliyor, yalnızca restart kullanılabilir.",
      },
      { status: 400 }
    )
  }

  let dbStatus: "ACTIVE" | "STOPPED" | "FAILED" = "ACTIVE"

  if (site.processManager === "SYSTEMD") {
    try {
      await serviceAction(site.domain, action as "start" | "stop" | "restart")
    } catch (error) {
      const message =
        error instanceof ProvisionError ? error.message : "Servis eylemi çalıştırılamadı."
      return NextResponse.json({ error: message }, { status: 500 })
    }
    try {
      const status = await serviceStatus(site.domain)
      dbStatus = systemdStatusToDbStatus(status)
    } catch (error) {
      console.error(`Servis durumu okunamadı (${site.domain}):`, error)
    }
  } else {
    // action === "restart" garanti (yukarıdaki kontrol sayesinde)
    try {
      await restartSite(site)
    } catch (error) {
      const message = error instanceof RestartError ? error.message : "Yeniden başlatma başarısız."
      return NextResponse.json({ error: message }, { status: 500 })
    }
    // docker-compose/pm2/custom script'in gerçek durumunu sorgulamanın genel
    // bir yolu yok — restart komutu hata vermeden döndüyse iyimser olarak
    // ACTIVE işaretliyoruz (best-effort, bu projedeki diğer senkron akışlarla
    // tutarlı).
  }

  const updated = await prisma.site.update({ where: { id }, data: { status: dbStatus } })
  await logAudit({
    userId: session.userId,
    action: `SITE_${action.toUpperCase()}`,
    targetType: "Site",
    targetId: id,
    detail: site.domain,
  })
  return NextResponse.json(updated)
}
