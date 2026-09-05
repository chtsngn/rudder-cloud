import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { isSuperAdmin } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

/**
 * `GET /api/terminal/eligible-sites` — terminal sayfasındaki site seçicinin
 * veri kaynağı (bkz. docs/ARCHITECTURE.md Aşama I). SUPER_ADMIN için
 * `unrestricted: true` döner (mevcut davranış: sınırsız kök kabuk, site
 * seçimi gerekmez). MEMBER için yalnızca (a) `UserSiteAccess`'te AÇIKÇA
 * `TERMINAL` izni verilmiş VE (b) dedicated bir linux kullanıcısı olan
 * (`config.linuxUser`, yalnızca STATIC/PHP/WORDPRESS'te mümkün) siteler
 * listelenir — gerçek yetkilendirme kararı zaten `server.mjs`'in kendi
 * `resolveTerminalAuthorization`'ında TAZE veriliyor, bu uç nokta yalnızca
 * UI'ın hangi seçenekleri göstereceğini belirliyor.
 */
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }

  if (await isSuperAdmin(session.userId)) {
    return NextResponse.json({ unrestricted: true, sites: [] })
  }

  const accessRows = await prisma.userSiteAccess.findMany({
    where: { userId: session.userId, permissions: { has: "TERMINAL" } },
    include: { site: { select: { id: true, domain: true, type: true, config: true } } },
  })

  const sites = accessRows
    .map((row) => row.site)
    .map((site) => {
      const cfg = (site.config ?? {}) as Record<string, unknown>
      const linuxUser = typeof cfg.linuxUser === "string" ? cfg.linuxUser.trim() : ""
      return { id: site.id, domain: site.domain, type: site.type, linuxUser }
    })
    .filter((site) => site.linuxUser.length > 0)

  return NextResponse.json({ unrestricted: false, sites })
}
