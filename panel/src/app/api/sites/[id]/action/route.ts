import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { getProcessStatus, restartSite, RestartError } from "@/lib/restart"
import { busyJob, busyMessage, jobActor, startRestartJob, JOB_START_FAILED_MESSAGE, jobStartFailed } from "@/lib/site-jobs"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * `POST /api/sites/[id]/action` — body: { action: "restart" }. Süreç
 * yöneticisine göre `restartSite()` (PM2 → root pm2, CUSTOM_SCRIPT → betik,
 * DOCKER_COMPOSE → compose restart). Compose'da başlat/durdur
 * `/api/sites/[id]/docker-compose` üzerinden. (v1.4.0: systemd'li
 * Node.js/Python türleriyle birlikte start/stop kaldırıldı.)
 *
 * 2026-11: `start` de kabul edilir (`restart` ile aynı işlem — yeniden başlatma
 * durmuş süreci de başlatır). CUSTOM_SCRIPT'te betik süresi sınırsız olabilir:
 * arka plan işi (kind `restart`) → 202 `{ jobId, job }`. Diğer yöneticilerde
 * yanıt eskisi gibi senkron. Sitede iş sürerken 409 `{ error, activeJob }`.
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
  if (action !== "restart" && action !== "start") {
    return NextResponse.json(
      { error: "Yalnızca restart desteklenir — Docker Compose'da başlat/durdur için compose kontrollerini kullanın." },
      { status: 400 }
    )
  }
  if (site.processManager === "NONE") {
    return NextResponse.json(
      { error: "Bu sitenin süreç yöneticisi 'Yok' — Git & Dağıtım sekmesinden bir yöntem seçin (Docker Compose, PM2, özel betik)." },
      { status: 400 }
    )
  }

  if (site.processManager === "CUSTOM_SCRIPT") {
    const outcome = await startRestartJob({
      siteId: id,
      domain: site.domain,
      action,
      actorId: session.userId,
      actor: await jobActor(session.userId, "manual"),
    }).catch(jobStartFailed)
    if (!outcome) {
      return NextResponse.json({ error: JOB_START_FAILED_MESSAGE }, { status: 500 })
    }
    if (outcome.status === "rejected" || outcome.status === "skipped") {
      return NextResponse.json({ error: busyMessage(outcome.activeJob), activeJob: outcome.activeJob }, { status: 409 })
    }
    return NextResponse.json({ jobId: outcome.job.id, job: outcome.job }, { status: 202 })
  }

  const busy = busyJob(id)
  if (busy) {
    return NextResponse.json({ error: busyMessage(busy), activeJob: busy }, { status: 409 })
  }

  try {
    await restartSite(site)
  } catch (error) {
    const message = error instanceof RestartError ? error.message : "Yeniden başlatma başarısız."
    return NextResponse.json({ error: message }, { status: 500 })
  }
  const status = await getProcessStatus(site)
  const dbStatus = status.state === "failed" ? "FAILED" : status.state === "stopped" ? "STOPPED" : "ACTIVE"

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
