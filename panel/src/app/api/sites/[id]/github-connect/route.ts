import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import { DeployError, deploySite, toDeployable } from "@/lib/deploy"
import { GIT_PULL_UNSUPPORTED_MESSAGE, isGitPullSupported, isValidGitBranch } from "@/lib/git"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

interface RouteParams {
  params: Promise<{ id: string }>
}

const REPO_FULL_NAME_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/

/**
 * `POST /api/sites/[id]/github-connect` — siteyi bir GitHub App kurulumundaki
 * depoya bağlar VE hemen deploy hattını çalıştırır (klon → deployCommand →
 * yeniden başlatma; bkz. src/lib/deploy.ts). Body: { installationId,
 * repoFullName, branch? }.
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
  if (!(await canManageSite(session.userId, site, "MANAGE_DEPLOY_KEYS"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }
  if (!isGitPullSupported(site.type)) {
    return NextResponse.json({ error: GIT_PULL_UNSUPPORTED_MESSAGE }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 })
  }
  const input = (body ?? {}) as Record<string, unknown>
  const installationId = typeof input.installationId === "string" ? input.installationId.trim() : ""
  const repoFullName = typeof input.repoFullName === "string" ? input.repoFullName.trim() : ""
  const branch = typeof input.branch === "string" && input.branch.trim() ? input.branch.trim() : "main"

  if (!installationId || !repoFullName) {
    return NextResponse.json({ error: "installationId ve repoFullName zorunludur." }, { status: 400 })
  }
  if (!REPO_FULL_NAME_RE.test(repoFullName)) {
    return NextResponse.json({ error: "Geçersiz depo adı (owner/repo bekleniyor)." }, { status: 400 })
  }
  if (!isValidGitBranch(branch)) {
    return NextResponse.json({ error: "Geçersiz git branch." }, { status: 400 })
  }

  const installation = await prisma.gitHubInstallation.findUnique({ where: { installationId } })
  if (!installation) {
    return NextResponse.json({ error: "GitHub kurulumu bulunamadı." }, { status: 404 })
  }

  const repoUrl = `https://github.com/${repoFullName}.git`

  const updated = await prisma.site.update({
    where: { id },
    data: {
      repoUrl,
      gitBranch: branch,
      githubInstallationId: installation.id,
      githubRepoFullName: repoFullName,
    },
    include: { githubInstallation: true },
  })

  await logAudit({
    userId: session.userId,
    action: "SITE_GITHUB_REPO_CONNECTED",
    targetType: "Site",
    targetId: id,
    detail: `${site.domain} -> @${repoFullName} (${branch})`,
  })

  try {
    const result = await deploySite(toDeployable(updated), { force: true, trigger: "connect" })
    const after = await prisma.site.findUnique({ where: { id } })
    return NextResponse.json({
      ...after,
      pullChanged: result.changed,
      pullCommit: result.commit,
      restartError: result.restartError,
      deployOutput: result.output,
    })
  } catch (error) {
    // Bağlantı KALICI kalır — yalnızca ilk deploy başarısız oldu; kullanıcı
    // "Deploy Et" ile tekrar deneyebilir.
    const message = error instanceof DeployError ? error.message : "İlk kurulum (git clone) başarısız oldu."
    const after = await prisma.site.findUnique({ where: { id } })
    return NextResponse.json(
      { error: message, site: after, deployOutput: error instanceof DeployError ? error.output : "" },
      { status: 500 }
    )
  }
}

/**
 * `DELETE /api/sites/[id]/github-connect` — GitHub App bağlantısını kaldırır;
 * `repoUrl`/`gitBranch` KASITLI korunur (klonlanmış kod ve auto-pull ayarı
 * olduğu gibi kalır; sonraki pull'lar düz repo adresiyle denenir).
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }

  const { id } = await params
  const site = await prisma.site.findUnique({ where: { id } })
  if (!site) {
    return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 })
  }
  if (!(await canManageSite(session.userId, site, "MANAGE_DEPLOY_KEYS"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  const updated = await prisma.site.update({
    where: { id },
    data: { githubInstallationId: null, githubRepoFullName: null },
  })

  await logAudit({
    userId: session.userId,
    action: "SITE_GITHUB_REPO_DISCONNECTED",
    targetType: "Site",
    targetId: id,
    detail: site.domain,
  })

  return NextResponse.json(updated)
}
