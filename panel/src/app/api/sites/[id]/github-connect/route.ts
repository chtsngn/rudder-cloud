import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import { GitError, gitPullOrClone, isGitPullSupported, isValidGitBranch } from "@/lib/git"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { RestartError, restartSite } from "@/lib/restart"

interface RouteParams {
  params: Promise<{ id: string }>
}

const REPO_FULL_NAME_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/

/**
 * `POST /api/sites/[id]/github-connect` — bu siteyi, bağlı bir GitHub App
 * kurulumundaki (installation) GitHub'ın izin verdiği bir depoya bağlar VE
 * hemen ardından ilk kurulumu (`gitPullOrClone` — `.git` yoksa clone)
 * sitenin kendi kök dizinine (bkz. `resolveSiteWorkdir`) yapar — "repoyu
 * domaine bağlayınca kök klasöre kurulum yapması" tam olarak bu iki adımı
 * TEK bir işlemde birleştiriyor. Eskiden (bkz. site-github-keys-card.tsx)
 * bir depo SEÇMEK yalnızca deploy-key kartındaki yerel state'i güncelliyordu
 * — `Site.repoUrl`'e hiç yazmıyordu, kullanıcı SSH URL'ini elle "Git &
 * Dağıtım" alanına kopyalamak ZORUNDAYDI. Bu route o kopukluğu gideriyor.
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
    return NextResponse.json(
      {
        error:
          "Bu site türü için GitHub'a bağlama desteklenmiyor (yalnızca Node.js/Python/Ters Proxy).",
      },
      { status: 400 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 })
  }
  const input = (body ?? {}) as Record<string, unknown>
  // `installationId` burada GitHub'ın KENDİ (sayısal) installation ID'si —
  // repo listeleme uç noktasının (`/api/settings/github/repos`) her depoyla
  // birlikte zaten döndürdüğü değer, istemcinin ayrıca bizim iç `cuid`'imizi
  // bilmesine gerek yok (bkz. GitHubInstallation.installationId @unique).
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
  })

  await logAudit({
    userId: session.userId,
    action: "SITE_GITHUB_REPO_CONNECTED",
    targetType: "Site",
    targetId: id,
    detail: `${site.domain} -> @${repoFullName} (${branch})`,
  })

  try {
    const result = await gitPullOrClone({
      ...updated,
      repoUrl,
      githubInstallationId: installation.installationId,
    })
    const afterPull = await prisma.site.update({
      where: { id },
      data: { lastPullAt: new Date(), lastPullOk: true, lastPullError: null },
    })

    let restartError: string | null = null
    if (result.changed) {
      try {
        await restartSite(afterPull)
      } catch (error) {
        restartError =
          error instanceof RestartError ? error.message : "Yeniden başlatma başarısız oldu."
      }
    }

    return NextResponse.json({
      ...afterPull,
      pullChanged: result.changed,
      pullCommit: result.commit,
      restartError,
    })
  } catch (error) {
    // Bağlantı (repoUrl/repo bilgisi) KALICI kalır — yalnızca ilk klonlama
    // başarısız oldu; kullanıcı "Şimdi Pull Et" ile tekrar deneyebilir
    // (SSL'in ayrı, tekrar denenebilir bir alt-durum olmasıyla aynı desen).
    const message = error instanceof GitError ? error.message : "İlk kurulum (git clone) başarısız oldu."
    const afterPull = await prisma.site.update({
      where: { id },
      data: { lastPullAt: new Date(), lastPullOk: false, lastPullError: message },
    })
    return NextResponse.json({ error: message, site: afterPull }, { status: 500 })
  }
}

/**
 * `DELETE /api/sites/[id]/github-connect` — siteyi GitHub App kurulumundan
 * ayırır (`githubInstallationId`/`githubRepoFullName` temizlenir). `repoUrl`/
 * `gitBranch`'e KASITLI dokunulmaz — zaten klonlanmış kod ve auto-pull ayarı
 * olduğu gibi kalır, yalnızca sonraki pull'lar artık installation token
 * YERİNE düz `repoUrl` (genel depo veya elle eklenmiş bir SSH deploy key)
 * ile denenir. Tamamen kaldırmak isteyen `PATCH .../route.ts` ile ayrıca
 * `repoUrl: null` gönderebilir.
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
