import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import { isSuperAdmin, type SitePermission } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

interface RouteParams {
  params: Promise<{ id: string; userId: string }>
}

const VALID_PERMISSIONS = new Set<SitePermission>([
  "VIEW",
  "EDIT_FILES",
  "RESTART",
  "DELETE",
  "MANAGE_BACKUPS",
  "MANAGE_DEPLOY_KEYS",
  "TERMINAL",
])

/**
 * `PUT /api/sites/[id]/access/[userId]` — body: { permissions: string[] }.
 * İzin listesini TAMAMEN değiştirir (ekleme değil, `replace` — arayüzdeki
 * checkbox grubuyla birebir eşleşen, en basit sözleşme). Boş dizi gönderilirse
 * grant satırı tamamen SİLİNİR (var olan bir izni "hiçbiri" yapmakla aynı şey,
 * ama tabloda anlamsız boş satır biriktirmemek için).
 */
export async function PUT(request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  const { id, userId } = await params
  const [site, targetUser] = await Promise.all([
    prisma.site.findUnique({ where: { id } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ])
  if (!site) {
    return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 })
  }
  if (!targetUser) {
    return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 })
  }
  if (targetUser.role !== "MEMBER") {
    return NextResponse.json(
      { error: "Yalnızca MEMBER rolündeki kullanıcılara site bazlı izin verilebilir." },
      { status: 400 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 })
  }
  const raw = (body as { permissions?: unknown } | null)?.permissions
  if (!Array.isArray(raw) || !raw.every((p): p is SitePermission => typeof p === "string" && VALID_PERMISSIONS.has(p as SitePermission))) {
    return NextResponse.json({ error: "Geçersiz izin listesi." }, { status: 400 })
  }
  const permissions = Array.from(new Set(raw as SitePermission[]))

  if (permissions.length === 0) {
    await prisma.userSiteAccess
      .delete({ where: { userId_siteId: { userId, siteId: id } } })
      .catch(() => null) // zaten yoksa sessizce geç
    await logAudit({
      userId: session.userId,
      action: "SITE_ACCESS_REVOKE",
      targetType: "Site",
      targetId: id,
      detail: `${targetUser.username} → erişim kaldırıldı`,
    })
    return NextResponse.json({ userId, permissions: [] })
  }

  const updated = await prisma.userSiteAccess.upsert({
    where: { userId_siteId: { userId, siteId: id } },
    create: { userId, siteId: id, permissions },
    update: { permissions },
  })
  await logAudit({
    userId: session.userId,
    action: "SITE_ACCESS_GRANT",
    targetType: "Site",
    targetId: id,
    detail: `${targetUser.username} → ${permissions.join(", ")}`,
  })
  return NextResponse.json({ userId, permissions: updated.permissions })
}
