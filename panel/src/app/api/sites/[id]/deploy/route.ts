import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { busyMessage, jobActor, startDeployJob, JOB_START_FAILED_MESSAGE, jobStartFailed } from "@/lib/site-jobs"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * `POST /api/sites/[id]/deploy` — "Deploy Et": deploy hattını ZORLAYARAK
 * çalıştırır: repo varsa pull, ardından HEAD değişmese bile deployCommand +
 * yeniden başlatma (Docker Compose'da `up -d --build`). Repo olmayan sitede
 * yalnızca deployCommand + yeniden başlatma. (bkz. src/lib/deploy.ts)
 *
 * 2026-11: deploy arka plan işi olarak başlar, yanıt hemen döner (Cloudflare
 * ~100 sn'de isteği kesiyordu): 202 `{ jobId, job }`; sitede iş sürüyorsa 409
 * `{ error, activeJob }`. Durum: `GET /api/sites/[id]/jobs/[jobId]`.
 */
export async function POST(_request: Request, { params }: RouteParams) {
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

  const outcome = await startDeployJob({
    siteId: id,
    domain: site.domain,
    trigger: "manual",
    action: "deploy",
    force: true,
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
