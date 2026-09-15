import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import { DeployKeyError, generateDeployKey, hasDeployKey, removeDeployKey } from "@/lib/deploy-keys"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * SSH deploy key (manuel/GitHub dışı depolar için — bkz. src/lib/deploy-keys.ts).
 * GET: public bilgi; POST: üret (varsa 409); DELETE: sil. Private key hiçbir
 * zaman döndürülmez.
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

  // DB önbelleği ile disk tutarsızsa (anahtar elle silinmiş) DB'yi düzelt.
  if (site.deployKeyName && !(await hasDeployKey(site.domain))) {
    await prisma.site.update({
      where: { id },
      data: { deployKeyName: null, deployKeyPublicKey: null, deployKeyFingerprint: null, deployKeyCreatedAt: null },
    })
    return NextResponse.json({ deployKey: null })
  }
  if (!site.deployKeyName) return NextResponse.json({ deployKey: null })
  return NextResponse.json({
    deployKey: {
      keyName: site.deployKeyName,
      publicKey: site.deployKeyPublicKey,
      fingerprint: site.deployKeyFingerprint,
      createdAt: site.deployKeyCreatedAt,
    },
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

  try {
    const generated = await generateDeployKey(site.domain)
    await prisma.site.update({
      where: { id },
      data: {
        deployKeyName: generated.keyName,
        deployKeyPublicKey: generated.publicKey,
        deployKeyFingerprint: generated.fingerprint,
        deployKeyCreatedAt: new Date(generated.createdAt),
      },
    })
    await logAudit({ userId: session.userId, action: "DEPLOY_KEY_CREATE", targetType: "Site", targetId: id, detail: site.domain })
    return NextResponse.json({ deployKey: generated })
  } catch (error) {
    if (error instanceof DeployKeyError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error("Deploy key üretilemedi:", error)
    return NextResponse.json({ error: "Deploy key üretilemedi." }, { status: 500 })
  }
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

  await removeDeployKey(site.domain)
  await prisma.site.update({
    where: { id },
    data: { deployKeyName: null, deployKeyPublicKey: null, deployKeyFingerprint: null, deployKeyCreatedAt: null },
  })
  await logAudit({ userId: session.userId, action: "DEPLOY_KEY_DELETE", targetType: "Site", targetId: id, detail: site.domain })
  return NextResponse.json({ ok: true })
}
