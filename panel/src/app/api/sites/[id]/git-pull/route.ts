import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { DeployError, deploySite, toDeployable } from "@/lib/deploy"
import { GIT_PULL_UNSUPPORTED_MESSAGE, isGitPullSupported } from "@/lib/git"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * `POST /api/sites/[id]/git-pull` — "Şimdi Pull Et": deploy hattını ZORLAMADAN
 * çalıştırır (HEAD değiştiyse deployCommand + yeniden başlatma; değişmediyse
 * hiçbir şey). Zorlamak için bkz. `/deploy`.
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
  if (!isGitPullSupported(site.type)) {
    return NextResponse.json({ error: GIT_PULL_UNSUPPORTED_MESSAGE }, { status: 400 })
  }
  if (!site.repoUrl) {
    return NextResponse.json({ error: "Bu site için repo adresi tanımlı değil." }, { status: 400 })
  }

  try {
    const result = await deploySite(toDeployable(site), { trigger: "pull" })
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
    const message = error instanceof DeployError ? error.message : "git pull başarısız oldu."
    const status = error instanceof DeployError && error.stage === "busy" ? 409 : 500
    const updated = await prisma.site.findUnique({ where: { id } })
    return NextResponse.json(
      { error: message, site: updated, deployOutput: error instanceof DeployError ? error.output : "" },
      { status }
    )
  }
}
