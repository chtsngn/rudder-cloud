import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import { DeployError, deploySite, toDeployable } from "@/lib/deploy"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * `POST /api/sites/[id]/deploy` — "Deploy Et": deploy hattını ZORLAYARAK
 * çalıştırır: repo varsa pull, ardından HEAD değişmese bile deployCommand +
 * yeniden başlatma (Docker Compose'da `up -d --build`). Repo olmayan sitede
 * yalnızca deployCommand + yeniden başlatma. (bkz. src/lib/deploy.ts)
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }

  const { id } = await params
  const site = await prisma.site.findUnique({ where: { id }, include: { githubInstallation: true } })
  if (!site) {
    return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 })
  }
  if (!(await canManageSite(session.userId, site, "RESTART"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  try {
    const result = await deploySite(toDeployable(site), { force: true, trigger: "manual" })
    void logAudit({
      userId: session.userId,
      action: "SITE_DEPLOY",
      targetType: "Site",
      targetId: id,
      detail: `${site.domain}${result.commit ? ` @${result.commit.slice(0, 7)}` : ""}${result.restartError ? ` (restart hatası: ${result.restartError})` : ""}`,
    })
    const updated = await prisma.site.findUnique({ where: { id } })
    return NextResponse.json({
      ...updated,
      pullChanged: result.changed,
      pullCommit: result.commit,
      deployed: result.deployed,
      restartError: result.restartError,
      deployOutput: result.output,
    })
  } catch (error) {
    const message = error instanceof DeployError ? error.message : "Deploy başarısız oldu."
    const status = error instanceof DeployError && error.stage === "busy" ? 409 : 500
    void logAudit({ userId: session.userId, action: "SITE_DEPLOY_FAILED", targetType: "Site", targetId: id, detail: `${site.domain}: ${message}` })
    const updated = await prisma.site.findUnique({ where: { id } })
    return NextResponse.json(
      { error: message, site: updated, deployOutput: error instanceof DeployError ? error.output : "" },
      { status }
    )
  }
}
