import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { isSuperAdmin } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * `GET /api/sites/[id]/access` — bu sitede MEMBER rolündeki her kullanıcının
 * (mevcut) izin durumunu döner (grant yoksa `permissions: []`). SUPER_ADMIN
 * kullanıcılar listede YOK — zaten her siteye tam erişimleri var, burada
 * göstermek kafa karıştırır (bkz. src/lib/permissions.ts → canManageSite).
 * SADECE SUPER_ADMIN çağırabilir — site sahibi bir MEMBER bile başka
 * kullanıcıların erişimini yönetemez (bilinçli, basit bir yetki modeli).
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  const { id } = await params
  const site = await prisma.site.findUnique({ where: { id } })
  if (!site) {
    return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 })
  }

  const [members, grants] = await Promise.all([
    prisma.user.findMany({ where: { role: "MEMBER" }, orderBy: { username: "asc" } }),
    prisma.userSiteAccess.findMany({ where: { siteId: id } }),
  ])
  const grantByUserId = new Map(grants.map((g) => [g.userId, g.permissions]))

  return NextResponse.json(
    members.map((m) => ({
      userId: m.id,
      username: m.username,
      permissions: grantByUserId.get(m.id) ?? [],
    }))
  )
}
