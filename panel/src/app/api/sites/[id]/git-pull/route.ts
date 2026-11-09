import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { GIT_PULL_UNSUPPORTED_MESSAGE, isGitPullSupported } from "@/lib/git"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { busyMessage, jobActor, startDeployJob, JOB_START_FAILED_MESSAGE, jobStartFailed } from "@/lib/site-jobs"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * `POST /api/sites/[id]/git-pull` — "Şimdi Pull Et": deploy hattını ZORLAMADAN
 * çalıştırır (HEAD değiştiyse deployCommand + yeniden başlatma; değişmediyse
 * hiçbir şey). Zorlamak için bkz. `/deploy`.
 *
 * 2026-11: arka plan işi — 202 `{ jobId, job }` / 409 `{ error, activeJob }`.
 * Değişiklik yoksa iş `succeeded` biter, `result.deployed = false`.
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
  if (!isGitPullSupported(site.type)) {
    return NextResponse.json({ error: GIT_PULL_UNSUPPORTED_MESSAGE }, { status: 400 })
  }
  if (!site.repoUrl) {
    return NextResponse.json({ error: "Bu site için repo adresi tanımlı değil." }, { status: 400 })
  }

  const outcome = await startDeployJob({
    siteId: id,
    domain: site.domain,
    trigger: "manual",
    action: "pull",
    force: false,
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
