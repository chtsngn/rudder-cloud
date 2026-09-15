import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { ProvisionError, serviceAction, serviceStatus } from "@/lib/provision"
import { getProcessStatus, restartSite, RestartError } from "@/lib/restart"

interface RouteParams {
  params: Promise<{ id: string }>
}

/** systemd tarafından yönetilebilen tipler — start/stop yalnızca bunlarda ve
 * yalnızca processManager SYSTEMD iken anlamlı. */
const MANAGED_TYPES = new Set(["NODEJS", "PYTHON"])
const VALID_ACTIONS = new Set(["start", "stop", "restart"])

function systemdStatusToDbStatus(status: string): "ACTIVE" | "STOPPED" | "FAILED" {
  if (status === "active") return "ACTIVE"
  if (status === "failed") return "FAILED"
  return "STOPPED"
}

/**
 * `POST /api/sites/[id]/action` — body: { action: "start" | "stop" | "restart" }.
 * `start`/`stop`: yalnızca Node.js/Python + SYSTEMD. `restart`: her tip ve her
 * süreç yöneticisi için `restartSite()` (PM2 → root pm2, CUSTOM_SCRIPT → betik,
 * DOCKER_COMPOSE → compose restart, NONE → hiçbir şey). (2026-09-15: eskiden
 * Ters Proxy/Docker sitelerinde restart hiç mümkün değildi.)
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
    return NextResponse.json({ error: "Geçerli bir eylem gereklidir (start, stop, restart)." }, { status: 400 })
  }

  const systemdManaged = MANAGED_TYPES.has(site.type) && site.processManager === "SYSTEMD"
  if (action !== "restart" && !systemdManaged) {
    return NextResponse.json(
      { error: "start/stop yalnızca panelin kendi yönettiği (systemd) Node.js/Python süreçlerinde desteklenir — bu site için restart ya da Docker Compose kontrollerini kullanın." },
      { status: 400 }
    )
  }
  if (action === "restart" && site.processManager === "NONE") {
    return NextResponse.json(
      { error: "Bu sitenin süreç yöneticisi 'Yok' — Git & Dağıtım sekmesinden bir yöntem seçin (Docker Compose, PM2, systemd, özel betik)." },
      { status: 400 }
    )
  }

  let dbStatus: "ACTIVE" | "STOPPED" | "FAILED" = "ACTIVE"
  if (systemdManaged) {
    try {
      await serviceAction(site.domain, action as "start" | "stop" | "restart")
    } catch (error) {
      const message = error instanceof ProvisionError ? error.message : "Servis eylemi çalıştırılamadı."
      return NextResponse.json({ error: message }, { status: 500 })
    }
    try {
      dbStatus = systemdStatusToDbStatus(await serviceStatus(site.domain))
    } catch (error) {
      console.error(`Servis durumu okunamadı (${site.domain}):`, error)
    }
  } else {
    try {
      await restartSite(site)
    } catch (error) {
      const message = error instanceof RestartError ? error.message : "Yeniden başlatma başarısız."
      return NextResponse.json({ error: message }, { status: 500 })
    }
    const status = await getProcessStatus(site)
    dbStatus = status.state === "failed" ? "FAILED" : status.state === "stopped" ? "STOPPED" : "ACTIVE"
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
