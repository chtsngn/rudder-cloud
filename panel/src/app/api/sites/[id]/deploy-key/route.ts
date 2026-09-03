import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import {
  GithubKeyError,
  deployHostAlias,
  generateDeployKey,
  removeDeployKey,
} from "@/lib/github-keys"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * `GET /api/sites/[id]/deploy-key` — mevcut deploy key'in PUBLIC bilgisini
 * döner (veritabanındaki önbellekten — bkz. schema.prisma → Aşama E notu).
 * Private key hiçbir zaman veritabanında tutulmadığı için burada da dönecek
 * bir şey yok.
 */
export async function GET(_request: Request, { params }: RouteParams) {
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

  if (!site.deployKeyName) {
    return NextResponse.json({ deployKey: null })
  }

  return NextResponse.json({
    deployKey: {
      keyName: site.deployKeyName,
      hostAlias: deployHostAlias(site.deployKeyName),
      publicKey: site.deployKeyPublicKey,
      fingerprint: site.deployKeyFingerprint,
      createdAt: site.deployKeyCreatedAt,
    },
  })
}

/**
 * `POST /api/sites/[id]/deploy-key` — yeni bir deploy key üretir (site
 * başına en fazla bir tane; zaten varsa 409 döner — script'in "zaten var,
 * yeniden üretilmiyor" davranışının API karşılığı, ama burada kullanıcının
 * bilinçli olarak önce silmesini istiyoruz ki elindeki GitHub Deploy Keys
 * kaydı sessizce geçersiz kalmasın).
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

  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    // gövde opsiyonel
  }
  const input = (body ?? {}) as Record<string, unknown>
  const autoAddToGithub = input.autoAddToGithub === true
  let owner = typeof input.owner === "string" ? input.owner.trim() : ""
  let repo = typeof input.repo === "string" ? input.repo.trim() : ""

  if (autoAddToGithub && (!owner || !repo) && site.repoUrl) {
    const match = site.repoUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/)
    if (match) {
      owner = match[1]
      repo = match[2]
    }
  }

  try {
    const info = await generateDeployKey(site.domain)
    await prisma.site.update({
      where: { id },
      data: {
        deployKeyName: info.keyName,
        deployKeyPublicKey: info.publicKey,
        deployKeyFingerprint: info.fingerprint,
        deployKeyCreatedAt: new Date(info.createdAt),
      },
    })
    await logAudit({
      userId: session.userId,
      action: "DEPLOY_KEY_CREATE",
      targetType: "Site",
      targetId: id,
      detail: site.domain,
    })

    let githubKey = null
    let githubError = null
    if (autoAddToGithub && owner && repo) {
      try {
        const { getDecryptedTokenForUser, addDeployKeyToGitHubRepo } = await import("@/lib/github-api")
        const token = await getDecryptedTokenForUser(session.userId)
        githubKey = await addDeployKeyToGitHubRepo(
          token,
          owner,
          repo,
          `Rudder Cloud (${site.domain})`,
          info.publicKey,
          true
        )
      } catch (ghErr) {
        githubError = ghErr instanceof Error ? ghErr.message : "GitHub'a otomatik eklenemedi."
      }
    }

    return NextResponse.json({
      deployKey: info,
      githubAdded: !!githubKey,
      githubKey,
      githubError,
    })
  } catch (error) {
    if (error instanceof GithubKeyError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("Deploy key üretilemedi:", error)
    return NextResponse.json({ error: "Deploy key üretilemedi." }, { status: 500 })
  }
}

/** `DELETE /api/sites/[id]/deploy-key` — anahtar dosyalarını ve SSH config
 * alias'ını siler, veritabanı alanlarını temizler. */
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

  await removeDeployKey(site.domain)
  await prisma.site.update({
    where: { id },
    data: {
      deployKeyName: null,
      deployKeyPublicKey: null,
      deployKeyFingerprint: null,
      deployKeyCreatedAt: null,
    },
  })

  await logAudit({
    userId: session.userId,
    action: "DEPLOY_KEY_DELETE",
    targetType: "Site",
    targetId: id,
    detail: site.domain,
  })

  return NextResponse.json({ ok: true })
}
