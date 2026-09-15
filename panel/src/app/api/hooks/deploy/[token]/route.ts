import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { DeployError, deploySite, toDeployable } from "@/lib/deploy"
import { hashDeployHookToken, isValidDeployHookTokenFormat } from "@/lib/deploy-hook"
import { prisma } from "@/lib/prisma"

interface RouteParams {
  params: Promise<{ token: string }>
}

// Oturumsuz, PUBLIC uç nokta — kimlik doğrulama YALNIZCA URL'deki token
// (bkz. src/lib/deploy-hook.ts). middleware matcher'ında bilinçli olarak YOK.
export const runtime = "nodejs"

/**
 * `POST /api/hooks/deploy/<token>[?wait=1]` — CI/CD tetikleyicisi. Varsayılan:
 * deploy arka planda başlatılır, 202 döner (uzun build'lerde CI zaman aşımı
 * yaşamasın). `?wait=1`: deploy bitene kadar bekler, sonucu döner.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { token } = await params
  if (!isValidDeployHookTokenFormat(token)) {
    return NextResponse.json({ error: "Geçersiz token." }, { status: 404 })
  }
  const site = await prisma.site.findFirst({
    where: { deployHookTokenHash: hashDeployHookToken(token) },
    include: { githubInstallation: true },
  })
  if (!site) {
    return NextResponse.json({ error: "Geçersiz token." }, { status: 404 })
  }

  const wait = new URL(request.url).searchParams.get("wait") === "1"
  void logAudit({ userId: null, actor: "deploy-hook", action: "SITE_DEPLOY_HOOK_TRIGGERED", targetType: "Site", targetId: site.id, detail: site.domain })

  const run = deploySite(toDeployable(site), { force: true, trigger: "hook" })
  if (!wait) {
    run.catch((error) => {
      console.error(`[deploy-hook] ${site.domain}: ${error instanceof Error ? error.message : String(error)}`)
    })
    return NextResponse.json({ accepted: true, site: site.domain }, { status: 202 })
  }

  try {
    const result = await run
    return NextResponse.json({ ok: result.restartError === null, site: site.domain, ...result })
  } catch (error) {
    const message = error instanceof DeployError ? error.message : "Deploy başarısız oldu."
    const status = error instanceof DeployError && error.stage === "busy" ? 409 : 500
    return NextResponse.json({ ok: false, site: site.domain, error: message, output: error instanceof DeployError ? error.output : "" }, { status })
  }
}
