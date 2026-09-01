import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * `GET /api/auth/me` — oturumdaki kullanıcının kimliğini/rolünü döner.
 * `src/middleware.ts`'te `/api/auth/*` bilinçli olarak PUBLIC (bkz.
 * `PUBLIC_API_PREFIXES`) — bu yüzden yetki kontrolü burada, `src/app/api/
 * system/stats/route.ts` ile aynı "defense in depth" deseniyle yapılıyor.
 * Sidebar'daki gerçek kullanıcı adı/rol göstergesi ve SUPER_ADMIN-only
 * sayfaların (Kullanıcılar, Denetim Kaydı) istemci tarafı koruması bu
 * endpoint'e dayanıyor.
 */
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, username: true, role: true },
  })
  if (!user) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }

  return NextResponse.json(user)
}
