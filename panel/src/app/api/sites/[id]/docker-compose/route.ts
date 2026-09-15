import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import {
  DOCKER_COMPOSE_ACTIONS,
  dockerComposeControl,
  getProcessStatus,
  RestartError,
  type DockerComposeControlAction,
} from "@/lib/restart"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * `POST /api/sites/[id]/docker-compose` — body: { action: "up" | "down" |
 * "restart" | "rebuild" | "pull" }. Yalnızca `processManager: DOCKER_COMPOSE`.
 * `rebuild` = `up -d --build --remove-orphans` (kod/compose/image değişikliği
 * için); `restart` mevcut konteynerleri yeniden başlatır. Yanıt: güncel site +
 * komut çıktısı + gerçek konteyner durumu.
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
  if (site.processManager !== "DOCKER_COMPOSE") {
    return NextResponse.json(
      { error: "Bu site Docker Compose ile yönetilmiyor (Git & Dağıtım'dan süreç yöneticisini değiştirin)." },
      { status: 400 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 })
  }
  const { action } = (body ?? {}) as { action?: unknown }
  if (typeof action !== "string" || !DOCKER_COMPOSE_ACTIONS.includes(action as DockerComposeControlAction)) {
    return NextResponse.json({ error: "Geçerli bir eylem gereklidir (up, down, restart, rebuild, pull)." }, { status: 400 })
  }

  let output = ""
  try {
    output = await dockerComposeControl(site, action as DockerComposeControlAction)
  } catch (error) {
    const message = error instanceof RestartError ? error.message : "Docker Compose eylemi başarısız oldu."
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const process = await getProcessStatus(site)
  const updated = await prisma.site.update({
    where: { id },
    data: { status: action === "down" ? "STOPPED" : process.state === "failed" ? "FAILED" : "ACTIVE" },
  })
  await logAudit({
    userId: session.userId,
    action: `SITE_DOCKER_COMPOSE_${action.toUpperCase()}`,
    targetType: "Site",
    targetId: id,
    detail: site.domain,
  })
  return NextResponse.json({ ...updated, output, process })
}
