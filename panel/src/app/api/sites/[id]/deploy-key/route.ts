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

function parseOwnerRepo(urlOrSlug: string): { owner: string; repo: string } | null {
  if (!urlOrSlug) return null
  const clean = urlOrSlug.trim()
  const slugMatch = clean.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/)
  if (slugMatch) return { owner: slugMatch[1], repo: slugMatch[2] }

  const httpsMatch = clean.match(/github\.com\/([^/]+)\/([^/.]+)(\.git)?/)
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] }

  const sshMatch = clean.match(/github\.com[:/]([^/]+)\/([^/.]+)(\.git)?/)
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] }

  return null
}

function normalizeKey(key: string): string {
  const parts = key.trim().split(/\s+/)
  return parts.length >= 2 ? parts[1] : parts[0]
}

/**
 * `GET /api/sites/[id]/deploy-key`
 *
 * Sitenin deploy key bilgisini döner. Eğer bağlı bir GitHub hesabı varsa
 * ve sitenin repoUrl'si biliniyorsa, anahtarın GitHub deposundaki durumunu da
 * canlı kontrol eder. Eğer anahtar GitHub'dan silinmişse, otomatik olarak yerel
 * kaydı da temizleyerek senkronize eder.
 */
export async function GET(request: Request, { params }: RouteParams) {
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

  if (!site.deployKeyName || !site.deployKeyPublicKey) {
    return NextResponse.json({ deployKey: null })
  }

  const url = new URL(request.url)
  const reqOwner = url.searchParams.get("owner")
  const reqRepo = url.searchParams.get("repo")
  const repoInfo = (reqOwner && reqRepo)
    ? { owner: reqOwner, repo: reqRepo }
    : parseOwnerRepo(site.repoUrl ?? "")

  let githubStatus: "active" | "deleted_on_github" | "not_checked" = "not_checked"
  let githubKeyId: number | null = null

  if (repoInfo) {
    try {
      const { getDecryptedTokenForUser, listDeployKeysFromGitHubRepo } = await import("@/lib/github-api")
      const token = await getDecryptedTokenForUser(session.userId)
      const remoteKeys = await listDeployKeysFromGitHubRepo(token, repoInfo.owner, repoInfo.repo)
      
      const localNorm = normalizeKey(site.deployKeyPublicKey)
      const matched = remoteKeys.find((rk) => normalizeKey(rk.key) === localNorm)

      if (matched) {
        githubStatus = "active"
        githubKeyId = matched.id
      } else {
        // Anahtar GitHub deposundan kullanıcı tarafından silinmiş!
        // Çift yönlü senkronizasyon: Yerel kaydı ve anahtar dosyalarını da temizle
        githubStatus = "deleted_on_github"
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
          action: "DEPLOY_KEY_SYNC_AUTO_CLEARED",
          targetType: "Site",
          targetId: id,
          detail: `${site.domain} (GitHub deposunda @${repoInfo.owner}/${repoInfo.repo} bulunamadığı için otomatik temizlendi)`,
        })

        return NextResponse.json({
          deployKey: null,
          autoCleared: true,
          githubStatus: "deleted_on_github",
          message: "Deploy key GitHub deposundan silindiği için panelde de temizlendi.",
        })
      }
    } catch {
      githubStatus = "not_checked"
    }
  }

  return NextResponse.json({
    deployKey: {
      keyName: site.deployKeyName,
      hostAlias: deployHostAlias(site.deployKeyName),
      publicKey: site.deployKeyPublicKey,
      fingerprint: site.deployKeyFingerprint,
      createdAt: site.deployKeyCreatedAt,
      githubStatus,
      githubKeyId,
    },
  })
}

/**
 * `POST /api/sites/[id]/deploy-key`
 *
 * Yeni bir deploy key üretir. Mevcut bir anahtar varsa `overwrite: true` ile
 * güvenle yenisiyle değiştirir (409 hatası vermez). `autoAddToGithub: true` ise
 * bağlı kullanıcının GitHub token'ı ile anahtarı doğrudan depoya ekler.
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
  const autoAddToGithub = input.autoAddToGithub !== false
  const customTitle = typeof input.title === "string" ? input.title.trim() : ""
  const readOnly = input.readOnly !== false

  let owner = typeof input.owner === "string" ? input.owner.trim() : ""
  let repo = typeof input.repo === "string" ? input.repo.trim() : ""

  if (!owner || !repo) {
    const parsed = parseOwnerRepo(site.repoUrl ?? "")
    if (parsed) {
      owner = parsed.owner
      repo = parsed.repo
    }
  }

  try {
    // overwrite: true sayesinde eski anahtar varsa temizlenip sıfırdan üretilir
    const info = await generateDeployKey(site.domain, true)
    
    await prisma.site.update({
      where: { id },
      data: {
        deployKeyName: info.keyName,
        deployKeyPublicKey: info.publicKey,
        deployKeyFingerprint: info.fingerprint,
        deployKeyCreatedAt: new Date(info.createdAt),
      },
    })

    let githubKey = null
    let githubError: string | null = null

    if (autoAddToGithub && owner && repo) {
      try {
        const { getDecryptedTokenForUser, addDeployKeyToGitHubRepo } = await import("@/lib/github-api")
        const token = await getDecryptedTokenForUser(session.userId)
        const keyTitle = customTitle || `Rudder Cloud Deploy Key (${site.domain})`
        
        githubKey = await addDeployKeyToGitHubRepo(
          token,
          owner,
          repo,
          keyTitle,
          info.publicKey,
          readOnly
        )
      } catch (ghErr) {
        githubError = ghErr instanceof Error ? ghErr.message : "GitHub'a otomatik eklenemedi."
      }
    }

    await logAudit({
      userId: session.userId,
      action: "DEPLOY_KEY_CREATE",
      targetType: "Site",
      targetId: id,
      detail: `${site.domain}${githubKey ? ` (GitHub: @${owner}/${repo})` : ""}`,
    })

    return NextResponse.json({
      ok: true,
      deployKey: {
        ...info,
        githubStatus: githubKey ? "active" : "not_checked",
        githubKeyId: githubKey?.id ?? null,
      },
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

/**
 * `DELETE /api/sites/[id]/deploy-key`
 *
 * Deploy key'i yerel sunucudan (`~/.ssh/` ve DB) siler.
 * Aynı zamanda kullanıcı bağlı bir GitHub hesabına ve depoya sahipse,
 * anahtarı GitHub API üzerinden depodan da otomatik olarak kaldırır.
 */
export async function DELETE(request: Request, { params }: RouteParams) {
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

  const url = new URL(request.url)
  const reqOwner = url.searchParams.get("owner")
  const reqRepo = url.searchParams.get("repo")
  const repoInfo = (reqOwner && reqRepo)
    ? { owner: reqOwner, repo: reqRepo }
    : parseOwnerRepo(site.repoUrl ?? "")

  let githubDeleted = false
  let githubError: string | null = null

  if (repoInfo && site.deployKeyPublicKey) {
    try {
      const {
        getDecryptedTokenForUser,
        listDeployKeysFromGitHubRepo,
        deleteDeployKeyFromGitHubRepo,
      } = await import("@/lib/github-api")
      const token = await getDecryptedTokenForUser(session.userId)
      const remoteKeys = await listDeployKeysFromGitHubRepo(token, repoInfo.owner, repoInfo.repo)
      const localNorm = normalizeKey(site.deployKeyPublicKey)
      const matchingKey = remoteKeys.find((rk) => normalizeKey(rk.key) === localNorm)

      if (matchingKey) {
        await deleteDeployKeyFromGitHubRepo(token, repoInfo.owner, repoInfo.repo, matchingKey.id)
        githubDeleted = true
      }
    } catch (e) {
      githubError = e instanceof Error ? e.message : "GitHub'dan silinemedi."
      console.warn("GitHub deploy key silinirken uyarı:", e)
    }
  }

  // Yerel sunucu dosyalarını ve DB kaydını sil
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
    detail: `${site.domain}${githubDeleted ? " (GitHub deposundan da silindi)" : ""}`,
  })

  return NextResponse.json({
    ok: true,
    githubDeleted,
    githubError,
  })
}
