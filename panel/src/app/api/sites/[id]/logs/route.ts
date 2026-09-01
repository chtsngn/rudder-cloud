import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { ProvisionError, serviceLogs } from "@/lib/provision"

interface RouteParams {
  params: Promise<{ id: string }>
}

const MANAGED_TYPES = new Set(["NODEJS", "PYTHON"])

/**
 * `GET /api/sites/[id]/logs?lines=200` — sadece systemd tarafından yönetilen
 * (Node.js/Python) siteler için `journalctl -u site-<slug>.service` çıktısını
 * düz metin olarak döner.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params
  const site = await prisma.site.findUnique({ where: { id } })
  if (!site) {
    return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 })
  }
  if (!MANAGED_TYPES.has(site.type)) {
    return NextResponse.json(
      { error: "Bu site türü için log görüntüleme desteklenmiyor." },
      { status: 400 }
    )
  }

  const url = new URL(request.url)
  const linesParam = url.searchParams.get("lines")
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
