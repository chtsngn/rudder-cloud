import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
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

  if (!config) {
    return NextResponse.json({ configured: false, app: null, installations: [] })
  }

  return NextResponse.json({
    configured: true,
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
