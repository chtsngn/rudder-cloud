import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { deployHookUrl, hashDeployHookToken, isValidDeployHookTokenFormat } from "@/lib/deploy-hook"
import { resolveRequestOrigin } from "@/lib/github-app"
import { prisma } from "@/lib/prisma"
import { startDeployJob, waitForJob, type StartJobOutcome } from "@/lib/site-jobs"

interface RouteParams {
  params: Promise<{ token: string }>
}

// Oturumsuz, PUBLIC uç nokta — kimlik doğrulama YALNIZCA URL'deki token
// (bkz. src/lib/deploy-hook.ts). middleware matcher'ında bilinçli olarak YOK.
export const runtime = "nodejs"

/**
 * `POST /api/hooks/deploy/<token>[?wait=1]` — CI/CD tetikleyicisi. Varsayılan:
 * deploy arka plan işi olarak başlatılır, 202 `{ ok, jobId, statusUrl }` döner
 * (uzun build'lerde CI zaman aşımı yaşamasın); durum `statusUrl`'den yoklanır.
 * Sitede iş sürüyorsa deploy takip işi olarak kuyruğa girer (bekleyen deploy
 * varsa ona katılır) ve o işin jobId'si döner — istek düşmez.
 *
 * `?wait=1`: deploy bitene kadar bekler, sonucu eski biçim ve kodlarla döner.
 * Cloudflare Tunnel arkasında ~100 sn'yi aşan deploy'da proxy 524 döner (deploy
 * sürer); bu durumda `statusUrl` yoklaması önerilir.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { token } = await params
  if (!isValidDeployHookTokenFormat(token)) {
    return NextResponse.json({ error: "Geçersiz token." }, { status: 404 })
  }
  const site = await prisma.site.findFirst({
    where: { deployHookTokenHash: hashDeployHookToken(token) },
    select: { id: true, domain: true },
  })
  if (!site) {
    return NextResponse.json({ error: "Geçersiz token." }, { status: 404 })
  }

  const wait = new URL(request.url).searchParams.get("wait") === "1"
  void logAudit({ userId: null, actor: "deploy-hook", action: "SITE_DEPLOY_HOOK_TRIGGERED", targetType: "Site", targetId: site.id, detail: site.domain })

  let outcome: StartJobOutcome
  try {
    outcome = await startDeployJob({ siteId: site.id, domain: site.domain, trigger: "hook", action: "deploy", force: true })
  } catch (error) {
    console.error(`[deploy-hook] ${site.domain}: ${error instanceof Error ? error.message : String(error)}`)
    return NextResponse.json({ ok: false, site: site.domain, error: "Deploy işi başlatılamadı." }, { status: 500 })
  }
  if (outcome.status === "rejected" || outcome.status === "skipped") {
    // Hook için çakışma kararı her zaman kuyruğa alma/katılmadır; buraya düşmemeli.
    return NextResponse.json({ ok: false, site: site.domain, error: "Deploy kuyruğa alınamadı.", activeJob: outcome.activeJob }, { status: 409 })
  }
  const jobId = outcome.job.id
  // Mutlak adres (hook URL'i gibi kurulur); origin çözülemezse yol kalır.
  const statusUrl = `${deployHookUrl(resolveRequestOrigin(request.headers) ?? "", token)}/jobs/${jobId}`

  if (!wait) {
    return NextResponse.json(
      { ok: true, accepted: true, site: site.domain, jobId, statusUrl, queued: outcome.status !== "started" },
      { status: 202 }
    )
  }

  const job = await waitForJob(jobId)
  if (!job) {
    return NextResponse.json({ ok: false, site: site.domain, jobId, statusUrl, error: "Deploy işi izlenemedi." }, { status: 500 })
  }
  const result = job.result ?? {}
  if (job.status === "succeeded") {
    return NextResponse.json({ ok: true, site: site.domain, jobId, statusUrl, ...result, output: job.output })
  }
  // Eski davranış: deploy tamamlanıp yeniden başlatma/sağlık kontrolü başarısızsa
  // 200 + ok:false; hat yarıda koptuysa 500.
  const status = job.status === "failed" && result.deployed === true ? 200 : 500
  return NextResponse.json(
    { ok: false, site: site.domain, jobId, statusUrl, ...result, error: job.error, output: job.output },
    { status }
  )
}
