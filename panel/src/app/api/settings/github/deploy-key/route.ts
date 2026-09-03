import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import {
  GitHubApiError,
  addDeployKeyToGitHubRepo,
  getDecryptedTokenForUser,
} from "@/lib/github-api"
import {
  generateDeployKey,
  removeDeployKey,
  slugifyDomain,
} from "@/lib/github-keys"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

/**
 * `POST /api/settings/github/deploy-key`
 *
 * Bağlı GitHub kullanıcısı üzerinden:
 * 1. Sunucuda ed25519 deploy key üretir ve `~/.ssh/config`'e host alias ekler.
 * 2. GitHub REST API üzerinden ilgili depoya Deploy Key olarak anında ekler (`POST /repos/{owner}/{repo}/keys`).
 * 3. (Opsiyonel) Bir site seçildiyse sitenin veritabanı kaydını günceller.
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }

  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 })
  }

  const input = (body ?? {}) as Record<string, unknown>
  const owner = typeof input.owner === "string" ? input.owner.trim() : ""
  const repo = typeof input.repo === "string" ? input.repo.trim() : ""
  const siteId = typeof input.siteId === "string" ? input.siteId.trim() : undefined
  const customTitle = typeof input.title === "string" ? input.title.trim() : ""
  const readOnly = input.readOnly !== false // Varsayılan: salt-okunur (true)

  if (!owner || !repo) {
    return NextResponse.json(
      { error: "Depo sahibi (owner) ve depo adı (repo) zorunludur." },
      { status: 400 }
    )
  }

  // 1. Kullanıcının GitHub token'ını çöz
  let token: string
  try {
    token = await getDecryptedTokenForUser(session.userId)
  } catch (error) {
    if (error instanceof GitHubApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "GitHub hesabı bağlı değil." }, { status: 400 })
  }

  // 2. Eğer bir site ile ilişkilendirilecekse siteyi ve yetkileri kontrol et
  let siteTag = `${owner}-${repo}`
  let siteRecord = null
  if (siteId) {
    siteRecord = await prisma.site.findUnique({ where: { id: siteId } })
    if (!siteRecord) {
      return NextResponse.json({ error: "Belirtilen site bulunamadı." }, { status: 404 })
    }
    if (!(await canManageSite(session.userId, siteRecord, "MANAGE_DEPLOY_KEYS"))) {
      return NextResponse.json({ error: "Bu sitede anahtar yönetme yetkiniz yok." }, { status: 403 })
    }
    siteTag = siteRecord.domain
  }

  // 3. Sunucuda ed25519 deploy key üret
  let generated
  try {
    generated = await generateDeployKey(siteTag)
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Deploy key üretilemedi."
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  // 4. GitHub API üzerinden depoya aktar
  const keyTitle =
    customTitle ||
    (siteRecord
      ? `Rudder Cloud Deploy Key (${siteRecord.domain})`
      : `Rudder Cloud Deploy Key (${owner}/${repo})`)

  try {
    const ghKey = await addDeployKeyToGitHubRepo(
      token,
      owner,
      repo,
      keyTitle,
      generated.publicKey,
      readOnly
    )

    // 5. Site ile ilişkilendirildiyse veritabanına kaydet
    if (siteRecord) {
      await prisma.site.update({
        where: { id: siteRecord.id },
        data: {
          deployKeyName: generated.keyName,
          deployKeyPublicKey: generated.publicKey,
          deployKeyFingerprint: generated.fingerprint,
          deployKeyCreatedAt: new Date(generated.createdAt),
        },
      })
    }

    // 6. Denetim günlüğüne yaz
    await logAudit({
      userId: session.userId,
      action: "DEPLOY_KEY_CREATED_GITHUB",
      targetType: siteRecord ? "SITE" : "GITHUB_REPO",
      targetId: siteRecord ? siteRecord.id : `${owner}/${repo}`,
      detail: `GitHub deposu ${owner}/${repo} için Deploy Key (${generated.fingerprint}) üretildi ve GitHub'a eklendi.`,
    })

    const suggestedSshUrl = `git@${generated.hostAlias}:${owner}/${repo}.git`

    return NextResponse.json({
      ok: true,
      deployKey: {
        keyName: generated.keyName,
        hostAlias: generated.hostAlias,
        publicKey: generated.publicKey,
        fingerprint: generated.fingerprint,
        createdAt: generated.createdAt,
        suggestedSshUrl,
      },
      githubKey: {
        id: ghKey.id,
        title: ghKey.title,
        verified: ghKey.verified,
        createdAt: ghKey.createdAt,
        readOnly: ghKey.readOnly,
      },
    })
  } catch (error) {
    // GitHub tarafında ekleme başarısız olduysa sunucuda üretilen geçici dosyayı temizle
    try {
      await removeDeployKey(siteTag)
    } catch {
      // yok say
    }

    if (error instanceof GitHubApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("GitHub deploy key eklenemedi:", error)
    return NextResponse.json({ error: "GitHub'a deploy key eklenemedi." }, { status: 500 })
  }
}
