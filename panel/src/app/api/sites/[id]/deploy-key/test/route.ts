import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { DeployKeyError, sshHostFromRepoUrl, testDeployKeyConnection } from "@/lib/deploy-keys"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

interface RouteParams {
  params: Promise<{ id: string }>
}

/** `POST /api/sites/[id]/deploy-key/test` — body: { host?: string } (verilmezse repoUrl'den, o da yoksa github.com). */
export async function POST(request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })

  const { id } = await params
  const site = await prisma.site.findUnique({ where: { id } })
  if (!site) return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 })
  if (!(await canManageSite(session.userId, site, "MANAGE_DEPLOY_KEYS"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    // opsiyonel gövde
  }
  const input = (body ?? {}) as Record<string, unknown>
  const host =
    (typeof input.host === "string" && input.host.trim()) ||
    (site.repoUrl ? sshHostFromRepoUrl(site.repoUrl) : null) ||
    "github.com"

  try {
    return NextResponse.json(await testDeployKeyConnection(site.domain, host))
  } catch (error) {
    if (error instanceof DeployKeyError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: "Bağlantı testi yapılamadı." }, { status: 500 })
  }
}
