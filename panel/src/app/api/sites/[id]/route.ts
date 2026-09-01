import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import { isValidGitBranch, isValidRepoUrl } from "@/lib/git"
import { canManageSite, isSuperAdmin } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { isValidAbsolutePath, removeService, removeVhost } from "@/lib/provision"

interface RouteParams {
  params: Promise<{ id: string }>
}

/** Node.js/Python: systemd tarafından yönetilen, panelin ayrıca bir servis birimi yarattığı tipler. */
const MANAGED_TYPES = new Set(["NODEJS", "PYTHON"])

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
  if (!(await canManageSite(session.userId, site, "VIEW"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }
  return NextResponse.json(site)
}

const VALID_PROCESS_MANAGERS = new Set(["SYSTEMD", "DOCKER_COMPOSE", "PM2", "CUSTOM_SCRIPT"])

/**
 * `PATCH /api/sites/[id]` — git dağıtımı ve restart ayarlarını günceller
 * (bkz. docs/ARCHITECTURE.md → Aşama B). Yalnızca gönderilen alanlar
 * değişir; site tipi/domain gibi provisioning'e bağlı alanlar burada
 * DEĞİŞTİRİLEMEZ.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }

  const { id } = await params
  const site = await prisma.site.findUnique({ where: { id } })
  if (!site) {
    return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 })
  }
  if (!(await canManageSite(session.userId, site, "EDIT_FILES"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 })
  }
  const input = (body ?? {}) as Record<string, unknown>

  const data: Record<string, unknown> = {}

  if ("repoUrl" in input) {
    const value = input.repoUrl
    if (value === null || value === "") {
      data.repoUrl = null
    } else if (typeof value === "string" && isValidRepoUrl(value)) {
      data.repoUrl = value
    } else {
      return NextResponse.json({ error: "Geçersiz repo adresi." }, { status: 400 })
    }
  }

  if ("gitBranch" in input) {
    const value = input.gitBranch
    if (typeof value !== "string" || !isValidGitBranch(value)) {
      return NextResponse.json({ error: "Geçersiz git branch." }, { status: 400 })
    }
    data.gitBranch = value
  }

  if ("autoPullEnabled" in input) {
    data.autoPullEnabled = Boolean(input.autoPullEnabled)
  }

  if ("autoPullIntervalSeconds" in input) {
    const value = input.autoPullIntervalSeconds
    const n = typeof value === "number" ? value : Number.NaN
    if (!Number.isInteger(n) || n < 5 || n > 86400) {
      return NextResponse.json(
        { error: "Otomatik pull aralığı 5-86400 saniye arasında olmalı." },
        { status: 400 }
      )
    }
    data.autoPullIntervalSeconds = n
  }

  if ("processManager" in input) {
    const value = input.processManager
    if (typeof value !== "string" || !VALID_PROCESS_MANAGERS.has(value)) {
      return NextResponse.json({ error: "Geçersiz process manager." }, { status: 400 })
    }
    data.processManager = value
  }

  if ("customRestartCommand" in input) {
    const value = input.customRestartCommand
    if (value === null || value === "") {
      data.customRestartCommand = null
    } else if (typeof value === "string" && isValidAbsolutePath(value)) {
      data.customRestartCommand = value
    } else {
      return NextResponse.json({ error: "Özel restart komutu geçerli bir mutlak yol olmalı." }, { status: 400 })
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Güncellenecek bir alan gönderilmedi." }, { status: 400 })
  }

  const updated = await prisma.site.update({ where: { id }, data })
  return NextResponse.json(updated)
}

/**
 * Siteyi siler. Önce (best-effort) nginx vhost'unu ve varsa systemd
 * servisini kaldırmayı dener — ama bu adımlar başarısız olsa bile (örn.
 * sunucu ilk kez hiç provision edilmemişse, ya da provisioning script'i bir
 * ara hata verdiyse) DB satırının silinmesini ENGELLEMEZ: bir yönetici her
 * zaman bozuk bir kaydı listeden kaldırabilmeli.
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  const { id } = await params
  const site = await prisma.site.findUnique({ where: { id } })
  if (!site) {
    return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 })
  }

  if (MANAGED_TYPES.has(site.type)) {
    try {
      await removeService(site.domain)
    } catch (error) {
      console.error(`Servis kaldırılamadı (${site.domain}), siteyi silmeye devam ediliyor:`, error)
    }
  }

  try {
    await removeVhost(site.domain)
  } catch (error) {
    console.error(`Vhost kaldırılamadı (${site.domain}), siteyi silmeye devam ediliyor:`, error)
  }

  try {
    await prisma.site.delete({ where: { id } })
    await logAudit({
      userId: session.userId,
      action: "SITE_DELETE",
      targetType: "Site",
      targetId: id,
      detail: site.domain,
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 })
  }
}
