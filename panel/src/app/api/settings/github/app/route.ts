import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import { getWebhookSecret, resolveRequestOrigin, setWebhookSecret } from "@/lib/github-app"
import { isSuperAdmin } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

/**
 * `GET /api/settings/github/app` — GitHub App bağlantı durumu + kurulumlar
 * (installations) listesi. Sırlar (private key, client secret, webhook
 * secret) buradan ASLA dönmez — yalnızca App adı/slug/kurulum hesap adları
 * gibi hassas olmayan bilgiler. Yönetim (App oluşturma/kurma/kaldırma)
 * SUPER_ADMIN-only kalır (aşağıdaki POST/DELETE), ama bu GET herhangi bir
 * oturum açmış kullanıcıya açık — MEMBER'lar da (kendi sitelerinde deploy
 * key/repo seçimi için, bkz. site-github-keys-card.tsx) "bağlı mı" bilgisine
 * ihtiyaç duyar; eskiden PAT akışında da bu kontrol yalnızca `getSession()`
 * seviyesindeydi.
 */
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }

  const config = await prisma.gitHubAppConfig.findUnique({
    where: { id: "panel" },
    include: { installations: { orderBy: { createdAt: "asc" } } },
  })

  const origin = resolveRequestOrigin(await headers()) ?? ""
  const webhookUrl = `${origin}/api/hooks/github`

  if (!config) {
    return NextResponse.json({ configured: false, app: null, installations: [], webhookUrl, webhookSecretConfigured: false })
  }

  return NextResponse.json({
    configured: true,
    webhookUrl,
    webhookSecretConfigured: (await getWebhookSecret()).length > 0,
    app: {
      slug: config.slug,
      name: config.name,
      htmlUrl: config.htmlUrl,
      ownerLogin: config.ownerLogin,
      ownerAvatarUrl: config.ownerAvatarUrl,
    },
    installations: config.installations.map((inst) => ({
      id: inst.id,
      installationId: inst.installationId,
      accountLogin: inst.accountLogin,
      accountAvatarUrl: inst.accountAvatarUrl,
      accountType: inst.accountType,
      repositorySelection: inst.repositorySelection,
      createdAt: inst.createdAt,
    })),
  })
}

/**
 * `DELETE /api/settings/github/app` — App bağlantısını panelden kaldırır
 * (`GitHubAppConfig` silinir, `GitHubInstallation` satırları cascade ile
 * gider). Panel domain kaldırmayla AYNI felsefe: yalnızca YEREL bağlantıyı
 * kaldırır, GitHub'daki App'in kendisine DOKUNMAZ — admin App'i GitHub'dan
 * silmek isterse bunu kendi GitHub Ayarları'ndan yapmalıdır.
 */
export async function DELETE() {
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  const existing = await prisma.gitHubAppConfig.findUnique({ where: { id: "panel" } })
  if (!existing) {
    return NextResponse.json({ ok: true })
  }

  await prisma.gitHubAppConfig.delete({ where: { id: "panel" } })

  await logAudit({
    userId: session.userId,
    action: "GITHUB_APP_DISCONNECTED",
    targetType: "GITHUB_APP",
    targetId: existing.appId,
    detail: `GitHub App bağlantısı panelden kaldırıldı: ${existing.slug}`,
  })

  return NextResponse.json({ ok: true })
}

/**
 * `PATCH /api/settings/github/app` — body: { webhookSecret } — push webhook'u
 * için secret'ı elle ayarlar (manifest akışı webhook'suz oluşturulmuş eski
 * App'ler için: GitHub → App ayarları → Webhook URL + secret girildikten sonra
 * aynı secret buraya yazılır).
 */
export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 })
  }
  const secret = typeof (body as Record<string, unknown>)?.webhookSecret === "string" ? ((body as Record<string, string>).webhookSecret).trim() : ""
  if (secret.length < 8 || secret.length > 200) {
    return NextResponse.json({ error: "Webhook secret 8-200 karakter olmalı." }, { status: 400 })
  }
  try {
    await setWebhookSecret(secret)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Kaydedilemedi." }, { status: 400 })
  }
  void logAudit({ userId: session.userId, action: "GITHUB_WEBHOOK_SECRET_SET", targetType: "GITHUB_APP" })
  return NextResponse.json({ ok: true })
}
