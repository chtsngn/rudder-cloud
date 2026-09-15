import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { GitHubAppError, listAllInstalledRepositories } from "@/lib/github-app"
import { isSuperAdmin } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

/**
 * `GET /api/settings/github/repos` — panele bağlı TÜM GitHub App kurulumları
 * üzerinden erişilebilen depolar (her seferinde GitHub'dan TAZE). SUPER_ADMIN
 * ya da en az bir sitede MANAGE_DEPLOY_KEYS izni olan MEMBER (2026-09-15:
 * eskiden her oturum açmış kullanıcı tüm depoları listeleyebiliyordu).
 */
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }
  if (!(await isSuperAdmin(session.userId))) {
    const grant = await prisma.userSiteAccess.findFirst({
      where: { userId: session.userId, permissions: { has: "MANAGE_DEPLOY_KEYS" } },
      select: { id: true },
    })
    if (!grant) {
      return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
    }
  }

  try {
    const repos = await listAllInstalledRepositories()
    return NextResponse.json({ repos })
  } catch (error) {
    if (error instanceof GitHubAppError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("GitHub depoları listelenemedi:", error)
    return NextResponse.json({ error: "Depolar getirilemedi." }, { status: 500 })
  }
}
