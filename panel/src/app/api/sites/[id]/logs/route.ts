import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { ProvisionError, serviceLogs } from "@/lib/provision"

interface RouteParams {
  params: Promise<{ id: string }>
}

const MANAGED_TYPES = new Set(["NODEJS", "PYTHON"])

/**
 * `GET /api/sites/[id]/logs?lines=200` — systemd tarafından yönetilen
 * (Node.js/Python) siteler için `journalctl -u site-<slug>.service`.
 * (2026-09-15: eskiden hiç oturum/izin kontrolü yoktu — herhangi bir MEMBER
 * her sitenin loglarını okuyabiliyordu; VIEW izni zorunlu.)
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
  if (!(await canManageSite(session.userId, site, "VIEW"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }
  if (!MANAGED_TYPES.has(site.type)) {
    return NextResponse.json({ error: "Bu site türü için systemd log görüntüleme desteklenmiyor." }, { status: 400 })
  }

  const linesParam = new URL(request.url).searchParams.get("lines")
  const lines = linesParam ? parseInt(linesParam, 10) : 200
  const safeLines = Number.isInteger(lines) && lines >= 1 && lines <= 2000 ? lines : 200

  try {
    const logs = await serviceLogs(site.domain, safeLines)
    return NextResponse.json({ logs })
  } catch (error) {
    const message = error instanceof ProvisionError ? error.message : "Loglar okunamadı."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
