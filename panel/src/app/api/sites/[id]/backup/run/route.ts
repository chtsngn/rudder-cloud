import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { busyMessage, jobActor, startBackupJob, JOB_START_FAILED_MESSAGE, jobStartFailed } from "@/lib/site-jobs"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * `POST /api/sites/[id]/backup/run` — manuel "şimdi yedekle" tetikleyicisi.
 *
 * 2026-11: döküm + bulut yüklemesi dakikalar sürebildiği için arka plan işi
 * (kind `backup`): 202 `{ jobId, job }`; sitede iş sürüyorsa 409
 * `{ error, activeJob }`. Sonuç (`fileName`, `sizeBytes`, `uploadedToS3`,
 * `s3Error`) işin `result`'ında; `Site.lastBackup*` eskisi gibi yazılır.
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
  if (!(await canManageSite(session.userId, site, "MANAGE_BACKUPS"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  const outcome = await startBackupJob({
    siteId: id,
    domain: site.domain,
    trigger: "manual",
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
