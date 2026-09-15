import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import { deployHookUrl, generateDeployHookToken } from "@/lib/deploy-hook"
import { resolveRequestOrigin } from "@/lib/github-app"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Deploy hook (bkz. src/lib/deploy-hook.ts). GET: var mı / ne zaman
 * oluşturuldu (URL DÖNMEZ — token saklanmıyor); POST: üret ya da yenile (URL
 * yalnızca bu yanıtta, BİR KEZ); DELETE: kaldır.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })

  const { id } = await params
  const site = await prisma.site.findUnique({ where: { id } })
  if (!site) return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 })
  if (!(await canManageSite(session.userId, site, "MANAGE_DEPLOY_KEYS"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }
  return NextResponse.json({
    configured: Boolean(site.deployHookTokenHash),
    createdAt: site.deployHookCreatedAt,
  })
}

export async function POST(_request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })

  const { id } = await params
  const site = await prisma.site.findUnique({ where: { id } })
  if (!site) return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 })
  if (!(await canManageSite(session.userId, site, "MANAGE_DEPLOY_KEYS"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  const { token, hash } = generateDeployHookToken()
  const createdAt = new Date()
  await prisma.site.update({ where: { id }, data: { deployHookTokenHash: hash, deployHookCreatedAt: createdAt } })
  const origin = resolveRequestOrigin(await headers()) ?? ""
  await logAudit({
    userId: session.userId,
    action: site.deployHookTokenHash ? "DEPLOY_HOOK_ROTATE" : "DEPLOY_HOOK_CREATE",
    targetType: "Site",
    targetId: id,
    detail: site.domain,
  })
  return NextResponse.json({ configured: true, createdAt, url: deployHookUrl(origin, token), token })
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })

  const { id } = await params
  const site = await prisma.site.findUnique({ where: { id } })
  if (!site) return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 })
  if (!(await canManageSite(session.userId, site, "MANAGE_DEPLOY_KEYS"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  await prisma.site.update({ where: { id }, data: { deployHookTokenHash: null, deployHookCreatedAt: null } })
  await logAudit({ userId: session.userId, action: "DEPLOY_HOOK_DELETE", targetType: "Site", targetId: id, detail: site.domain })
  return NextResponse.json({ ok: true })
}
