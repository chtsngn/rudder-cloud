import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { dockerComposeLogs, RestartError } from "@/lib/restart"

interface RouteParams {
  params: Promise<{ id: string }>
}

/** `GET /api/sites/[id]/docker-logs?lines=200` — `docker compose logs --tail` (DOCKER_COMPOSE yöneticisi). */
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
  if (site.processManager !== "DOCKER_COMPOSE") {
    return NextResponse.json({ error: "Bu site Docker Compose ile yönetilmiyor." }, { status: 400 })
  }

  const linesParam = new URL(request.url).searchParams.get("lines")
  const lines = linesParam ? parseInt(linesParam, 10) : 200
  try {
    const logs = await dockerComposeLogs(site, Number.isInteger(lines) ? lines : 200)
    return NextResponse.json({ logs })
  } catch (error) {
    const message = error instanceof RestartError ? error.message : "Loglar okunamadı."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
