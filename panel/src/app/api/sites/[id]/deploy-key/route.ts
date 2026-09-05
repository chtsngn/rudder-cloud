import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import { getInstallationAccessToken } from "@/lib/github-app"
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
 * Bu sitenin bağlı olduğu GitHub App kurulumu için (varsa) bir installation
 * token döner — eskiden kullanıcının PAT'ından gelen `getDecryptedTokenForUser`
 * yerine (bkz. docs/ARCHITECTURE.md Aşama H). Site bir kuruluma bağlı
 * DEĞİLSE `null` döner; çağıranlar bunu "GitHub senkronizasyonu atlanıyor"
 * olarak ele alır — deploy key'in kendisi (sunucudaki SSH anahtar çifti)
 * bundan etkilenmez, yalnızca "GitHub'a otomatik ekle/kontrol et" kolaylığı
 * kullanılamaz.
 */
async function getBearerTokenForSite(site: { githubInstallationId: string | null }): Promise<string | null> {
  if (!site.githubInstallationId) return null
  const installation = await prisma.gitHubInstallation.findUnique({
    where: { id: site.githubInstallationId },
  })
  if (!installation) return null
  try {
    return await getInstallationAccessToken(installation.installationId)
  } catch {
    return null
  }
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
 * Sitenin deploy key bilgisini döner.
 * GitHub ile senkronizasyon:
 * 1. Kayıtlı repo (site.config.deployKeyRepo, query param veya site.repoUrl) üzerinde anahtar sorgulanır.
 * 2. Repo bilgisi bulunamazsa kullanıcının güncel depoları taranır.
 * 3. Eğer deploy key GitHub üzerinde silinmişse, yerel kayıt ve ~/.ssh dosyaları da
 *    otomatik olarak temizlenir (autoCleared: true döner).
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
  const siteConfig = (site.config && typeof site.config === "object" ? site.config : {}) as Record<string, unknown>
  const configRepoStr = typeof siteConfig.deployKeyRepo === "string" ? siteConfig.deployKeyRepo : null

  const repoInfo = (reqOwner && reqRepo)
    ? { owner: reqOwner, repo: reqRepo }
    : (configRepoStr ? parseOwnerRepo(configRepoStr) : parseOwnerRepo(site.repoUrl ?? ""))

  let githubStatus: "active" | "deleted_on_github" | "not_checked" = "not_checked"
  let githubKeyId: number | null = null

  try {
    const { listDeployKeysFromGitHubRepo } = await import("@/lib/github-api")
    const { listInstallationRepositories } = await import("@/lib/github-app")
    const installation = site.githubInstallationId
      ? await prisma.gitHubInstallation.findUnique({ where: { id: site.githubInstallationId } })
      : null
    const token = await getBearerTokenForSite(site)

    if (token) {
      const localNorm = normalizeKey(site.deployKeyPublicKey)

      // 1. Belirli bir repo biliniyorsa doğrudan o depoyu kontrol et
      if (repoInfo) {
        const remoteKeys = await listDeployKeysFromGitHubRepo(token, repoInfo.owner, repoInfo.repo)
        const matched = remoteKeys.find((rk) => normalizeKey(rk.key) === localNorm)

        if (matched) {
          githubStatus = "active"
          githubKeyId = matched.id
        } else {
          // Anahtar GitHub deposundan silinmiş!
          // Çift yönlü senkronizasyon: Yerel kaydı ve anahtar dosyalarını hemen temizle
          githubStatus = "deleted_on_github"
          await removeDeployKey(site.domain)
          await prisma.site.update({
            where: { id },
            data: {
              deployKeyName: null,
              deployKeyPublicKey: null,
              deployKeyFingerprint: null,
              deployKeyCreatedAt: null,
              config: {
                ...siteConfig,
                deployKeyRepo: null,
                deployKeyId: null,
              },
            },
          })

          await logAudit({
            userId: session.userId,
            action: "DEPLOY_KEY_SYNC_AUTO_CLEARED",
            targetType: "Site",
            targetId: id,
            detail: `${site.domain} (GitHub deposunda @${repoInfo.owner}/${repoInfo.repo} silindiği için yerel kayıt da kaldırıldı)`,
          })

          return NextResponse.json({
            deployKey: null,
            autoCleared: true,
            githubStatus: "deleted_on_github",
            message: "Deploy key GitHub deposundan silindiği için buradan da kaldırıldı.",
          })
        }
      } else if (installation) {
        // Repo henüz atanmamışsa bu sitenin bağlı olduğu kurulumun depolarını tara
        const installedRepos = await listInstallationRepositories(
          installation.installationId,
          installation.accountLogin
        ).catch(() => [])
        let foundRepo: { owner: string; repo: string } | null = null
        const reposToCheck = installedRepos.slice(0, 15)

        for (const r of reposToCheck) {
          try {
            const keys = await listDeployKeysFromGitHubRepo(token, r.owner, r.name)
            const matched = keys.find((k) => normalizeKey(k.key) === localNorm)
            if (matched) {
              foundRepo = { owner: r.owner, repo: r.name }
              githubStatus = "active"
              githubKeyId = matched.id
              // Bulunan depoyu sonraki hızlı kontroller için config'e kaydet
              await prisma.site.update({
                where: { id },
                data: {
                  config: {
                    ...siteConfig,
                    deployKeyRepo: `${r.owner}/${r.name}`,
                    deployKeyId: matched.id,
                  },
                },
              })
              break
            }
          } catch {
            // Sonraki depoyu denemeye devam et
          }
        }

        // Taranan depoların hiçbirinde anahtar yoksa silinmiş kabul et ve temizle
        if (!foundRepo && reposToCheck.length > 0) {
          githubStatus = "deleted_on_github"
          await removeDeployKey(site.domain)
          await prisma.site.update({
            where: { id },
            data: {
              deployKeyName: null,
              deployKeyPublicKey: null,
              deployKeyFingerprint: null,
              deployKeyCreatedAt: null,
              config: {
                ...siteConfig,
                deployKeyRepo: null,
                deployKeyId: null,
              },
            },
          })

          return NextResponse.json({
            deployKey: null,
            autoCleared: true,
            githubStatus: "deleted_on_github",
            message: "Deploy key GitHub depolarında bulunamadığı için buradan da kaldırıldı.",
          })
        }
      }
    }
  } catch {
    githubStatus = "not_checked"
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
      repo: configRepoStr || (repoInfo ? `${repoInfo.owner}/${repoInfo.repo}` : null),
    },
  })
}

/**
 * `POST /api/sites/[id]/deploy-key`
 *
 * Yeni bir deploy key üretir (`overwrite: true` ile).
 * `autoAddToGithub: true` ise bağlı GitHub deposuna anahtarı ekler ve
 * depoyu site.config.deployKeyRepo olarak kaydeder.
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

  const siteConfig = (site.config && typeof site.config === "object" ? site.config : {}) as Record<string, unknown>
  const configRepoStr = typeof siteConfig.deployKeyRepo === "string" ? siteConfig.deployKeyRepo : null

  let owner = typeof input.owner === "string" ? input.owner.trim() : ""
  let repo = typeof input.repo === "string" ? input.repo.trim() : ""

  if (!owner || !repo) {
    const parsed = configRepoStr ? parseOwnerRepo(configRepoStr) : parseOwnerRepo(site.repoUrl ?? "")
    if (parsed) {
      owner = parsed.owner
      repo = parsed.repo
    }
  }

  try {
    // overwrite: true sayesinde eski anahtar varsa temizlenip sıfırdan üretilir
    const info = await generateDeployKey(site.domain, true)
    
    let githubKey = null
    let githubError: string | null = null
    let attachedRepo: string | null = null

    if (autoAddToGithub && owner && repo) {
      try {
        const { addDeployKeyToGitHubRepo } = await import("@/lib/github-api")
        const token = await getBearerTokenForSite(site)
        if (!token) {
          throw new Error(
            "Bu site bir GitHub App kurulumuna bağlı değil — Deploy Key otomatik eklenemedi (elle GitHub'a ekleyebilirsiniz)."
          )
        }
        const keyTitle = customTitle || `Rudder Cloud Deploy Key (${site.domain})`
        
        githubKey = await addDeployKeyToGitHubRepo(
          token,
          owner,
          repo,
          keyTitle,
          info.publicKey,
          readOnly
        )
        attachedRepo = `${owner}/${repo}`
      } catch (ghErr) {
        githubError = ghErr instanceof Error ? ghErr.message : "GitHub'a otomatik eklenemedi."
      }
    }

    const assignedRepo = attachedRepo || (owner && repo ? `${owner}/${repo}` : configRepoStr)
    const newRepoUrl = site.repoUrl || (assignedRepo ? `git@${info.hostAlias}:${assignedRepo}.git` : null)

    await prisma.site.update({
      where: { id },
      data: {
        deployKeyName: info.keyName,
        deployKeyPublicKey: info.publicKey,
        deployKeyFingerprint: info.fingerprint,
        deployKeyCreatedAt: new Date(info.createdAt),
        repoUrl: newRepoUrl,
        config: {
          ...siteConfig,
          deployKeyRepo: assignedRepo,
          deployKeyId: githubKey?.id ?? null,
        },
      },
    })

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
        repo: assignedRepo,
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
 * Aynı zamanda bağlı depodan (GitHub API üzerinden) da kaldırır.
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
  const siteConfig = (site.config && typeof site.config === "object" ? site.config : {}) as Record<string, unknown>
  const configRepoStr = typeof siteConfig.deployKeyRepo === "string" ? siteConfig.deployKeyRepo : null

  const repoInfo = (reqOwner && reqRepo)
    ? { owner: reqOwner, repo: reqRepo }
    : (configRepoStr ? parseOwnerRepo(configRepoStr) : parseOwnerRepo(site.repoUrl ?? ""))

  let githubDeleted = false
  let githubError: string | null = null

  if (repoInfo && site.deployKeyPublicKey) {
    try {
      const { listDeployKeysFromGitHubRepo, deleteDeployKeyFromGitHubRepo } = await import(
        "@/lib/github-api"
      )
      const token = await getBearerTokenForSite(site)
      if (!token) {
        throw new Error("Bu site bir GitHub App kurulumuna bağlı değil.")
      }
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

  // Yerel sunucu dosyalarını, DB kaydını ve config bilgisini temizle
  await removeDeployKey(site.domain)
  await prisma.site.update({
    where: { id },
    data: {
      deployKeyName: null,
      deployKeyPublicKey: null,
      deployKeyFingerprint: null,
      deployKeyCreatedAt: null,
      config: {
        ...siteConfig,
        deployKeyRepo: null,
        deployKeyId: null,
      },
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
