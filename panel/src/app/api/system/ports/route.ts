import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { isSuperAdmin } from "@/lib/permissions"
import { collectPortsOverview } from "@/lib/ports"
import { prisma } from "@/lib/prisma"

// `ss`/`docker` çalıştırır — Node runtime.
export const runtime = "nodejs"

/**
 * `GET /api/system/ports` — dinlenen TCP portları, site/docker etiketleriyle
 * (bkz. src/lib/ports.ts) + boş port önerileri. SADECE SUPER_ADMIN (dinlenen
 * portlar/süreç adları sistem bilgisi sızdırır).
 */
export async function GET() {
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }
  const sites = await prisma.site.findMany({ select: { domain: true, type: true, config: true } })
  return NextResponse.json(await collectPortsOverview(sites))
}
