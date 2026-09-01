import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import {
  GithubKeyError,
  generateActionsKey,
  removeActionsKey,
  tryAutoAddGithubSecret,
} from "@/lib/github-keys"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * `GET /api/sites/[id]/actions-key` — yalnızca PUBLIC bilgiyi döner.
 * Private key üretim anından sonra HİÇBİR route üzerinden tekrar okunamaz —
 * yalnızca `POST` yanıtında bir kez döner (bkz. aşağıdaki not).
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }

  const { id } = await params
  const site = await prisma.site.findUnique({ where: { id } })
  if (!site) {
    return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 })
  }
  if (!(await canManageSite(session.userId, site, "MANAGE_DEPLOY_KEYS"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  if (!site.actionsKeyName) {
    return NextResponse.json({ actionsKey: null })
  }

  return NextResponse.json({
    actionsKey: {
      keyName: site.actionsKeyName,
      publicKey: site.actionsKeyPublicKey,
      fingerprint: site.actionsKeyFingerprint,
      createdAt: site.actionsKeyCreatedAt,
    },
  })
}

/**
 * `POST /api/sites/[id]/actions-key` — yeni bir Actions anahtarı üretir,
 * public key'i `panel` kullanıcısının kendi `authorized_keys`'ine ekler.
 *
 * Gövde: `{ useGh?: boolean, repoSlug?: string }` — `useGh: true` ve geçerli
 * bir `repoSlug` ("owner/repo") verilirse, sunucuda `gh` CLI kuruluysa ve
 * authenticate edilmişse secret otomatik eklenmeye çalışılır (script'in
 * "gh CLI bulundu, otomatik ekleyeyim mi?" adımının karşılığı — opsiyonel).
 *
 * GÜVENLİK: `privateKey`, yanıtta YALNIZCA `gh` ile otomatik ekleme
 * BAŞARISIZ olduğunda (ya da hiç denenmediğinde) döner — otomatik eklemenin
 * başarılı olduğu durumda private key'in istemciye/ağa hiç gitmesine gerek
 * yok, gereksiz maruziyeti azaltmak için bilinçli olarak çıkarılıyor.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }

  const { id } = await params
  const site = await prisma.site.findUnique({ where: { id } })
  if (!site) {
    return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 })
  }
  if (!(await canManageSite(session.userId, site, "MANAGE_DEPLOY_KEYS"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    // gövde opsiyonel — boş gönderilmiş olabilir
  }
  const input = (body ?? {}) as Record<string, unknown>
  const useGh = input.useGh === true
  const repoSlug = typeof input.repoSlug === "string" ? input.repoSlug.trim() : ""

  try {
    const generated = await generateActionsKey(site.domain)

    await prisma.site.update({
      where: { id },
      data: {
        actionsKeyName: generated.keyName,
        actionsKeyPublicKey: generated.publicKey,
        actionsKeyFingerprint: generated.fingerprint,
        actionsKeyCreatedAt: new Date(generated.createdAt),
      },
    })

    const ghResult =
      useGh && repoSlug ? await tryAutoAddGithubSecret(repoSlug, generated.privateKey) : null

    await logAudit({
      userId: session.userId,
      action: "ACTIONS_KEY_CREATE",
      targetType: "Site",
      targetId: id,
      detail: site.domain,
    })

    return NextResponse.json({
      actionsKey: {
        keyName: generated.keyName,
        publicKey: generated.publicKey,
        fingerprint: generated.fingerprint,
        createdAt: generated.createdAt,
      },
      ghResult,
      privateKey: ghResult?.ok ? undefined : generated.privateKey,
    })
  } catch (error) {
    if (error instanceof GithubKeyError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("Actions anahtarı üretilemedi:", error)
    return NextResponse.json({ error: "Actions anahtarı üretilemedi." }, { status: 500 })
  }
}

/** `DELETE /api/sites/[id]/actions-key` — anahtarı ve authorized_keys
 * girdisini siler, veritabanı alanlarını temizler. */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }

  const { id } = await params
  const site = await prisma.site.findUnique({ where: { id } })
  if (!site) {
    return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 })
  }
  if (!(await canManageSite(session.userId, site, "MANAGE_DEPLOY_KEYS"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  await removeActionsKey(site.domain)
  await prisma.site.update({
    where: { id },
    data: {
      actionsKeyName: null,
      actionsKeyPublicKey: null,
      actionsKeyFingerprint: null,
      actionsKeyCreatedAt: null,
    },
  })

  await logAudit({
    userId: session.userId,
    action: "ACTIONS_KEY_DELETE",
    targetType: "Site",
    targetId: id,
    detail: site.domain,
  })

  return NextResponse.json({ ok: true })
}
