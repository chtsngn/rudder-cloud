import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { logAudit } from "@/lib/audit"
import { isSuperAdmin } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import {
  configurePanelDomain,
  isValidDomain,
  isValidEmail,
  ProvisionError,
  removePanelDomain,
  requestPanelSsl,
} from "@/lib/provision"

/**
 * Panelin kendi alan adı + gerçek Let's Encrypt SSL bağlama durumu. Tek
 * satırlık singleton (`PanelSettings.id === "panel"`, bkz. şema notu).
 * `panel.conf`'a (varsayılan :24428 erişimi) BURADAN HİÇBİR ZAMAN dokunulmaz
 * — alan adı bağlansa/kaldırılsa bile IP:24428 erişimi her zaman çalışır.
 */
const PANEL_SETTINGS_ID = "panel"

async function getOrCreateSettings() {
  return prisma.panelSettings.upsert({
    where: { id: PANEL_SETTINGS_ID },
    update: {},
    create: { id: PANEL_SETTINGS_ID },
  })
}

function toPublic(settings: {
  domain: string | null
  domainEmail: string | null
  sslEnabled: boolean
  sslStatus: string
  lastError: string | null
  updatedAt: Date
}) {
  return {
    domain: settings.domain,
    domainEmail: settings.domainEmail,
    sslEnabled: settings.sslEnabled,
    sslStatus: settings.sslStatus,
    lastError: settings.lastError,
    updatedAt: settings.updatedAt,
  }
}

export async function GET() {
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }
  const settings = await getOrCreateSettings()
  return NextResponse.json(toPublic(settings))
}

function toStr(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/**
 * Alan adını bağlar VE aynı istekte gerçek SSL sertifikasını alır (bkz.
 * settings sayfası — kullanıcı tercihi: "domain + SSL birlikte"). İki adım
 * sırayla çalışır (configure-panel-domain -> request-panel-ssl); ilk adım
 * başarılı olduktan sonra ikinci adım başarısız olursa (ör. DNS henüz bu
 * sunucuya yönlendirilmemiş) alan adı KAYDEDİLMİŞ olarak kalır, hata mesajı
 * `lastError`'a yazılır ve kullanıcı aynı formu tekrar göndererek yeniden
 * deneyebilir (her iki adım da idempotent).
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 })
  }
  const input = (body ?? {}) as Record<string, unknown>
  const domain = toStr(input.domain)
  const email = toStr(input.email)

  if (!isValidDomain(domain)) {
    return NextResponse.json({ error: "Geçersiz alan adı." }, { status: 400 })
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Geçersiz e-posta adresi." }, { status: 400 })
  }

  await prisma.panelSettings.upsert({
    where: { id: PANEL_SETTINGS_ID },
    update: { domain, domainEmail: email, sslStatus: "pending", lastError: null },
    create: { id: PANEL_SETTINGS_ID, domain, domainEmail: email, sslStatus: "pending" },
  })

  try {
    await configurePanelDomain(domain)
    await requestPanelSsl(domain, email)

    const settings = await prisma.panelSettings.update({
      where: { id: PANEL_SETTINGS_ID },
      data: { sslEnabled: true, sslStatus: "active", lastError: null },
    })
    void logAudit({
      userId: session.userId,
      action: "panel.domain.bound",
      targetType: "panel",
      detail: domain,
    })
    return NextResponse.json(toPublic(settings))
  } catch (error) {
    const message = error instanceof ProvisionError ? error.message : "Alan adı/SSL yapılandırılamadı."
    const settings = await prisma.panelSettings.update({
      where: { id: PANEL_SETTINGS_ID },
      data: { sslEnabled: false, sslStatus: "error", lastError: message },
    })
    void logAudit({
      userId: session.userId,
      action: "panel.domain.bind_failed",
      targetType: "panel",
      detail: `${domain}: ${message}`,
    })
    return NextResponse.json({ error: message, ...toPublic(settings) }, { status: 502 })
  }
}

export async function DELETE() {
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  try {
    await removePanelDomain()
  } catch (error) {
    const message = error instanceof ProvisionError ? error.message : "Alan adı bağlantısı kaldırılamadı."
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const settings = await prisma.panelSettings.upsert({
    where: { id: PANEL_SETTINGS_ID },
    update: { domain: null, domainEmail: null, sslEnabled: false, sslStatus: "none", lastError: null },
    create: { id: PANEL_SETTINGS_ID },
  })
  void logAudit({ userId: session.userId, action: "panel.domain.removed", targetType: "panel" })
  return NextResponse.json(toPublic(settings))
}
