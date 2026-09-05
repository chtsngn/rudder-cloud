import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { isSuperAdmin } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

/**
 * Web terminalinin isteğe bağlı, kullanıcı girdisine dayalı boşta-kalma
 * zaman aşımı (bkz. prisma/schema.prisma → PanelSettings.terminalIdleTimeoutSeconds
 * notu). Tek satırlık singleton (`PanelSettings.id === "panel"`), domain/SSL
 * ayarlarıyla aynı satırı paylaşır.
 *
 * NOT: Bu, terminal WS bağlantısının Nginx tarafından ~60sn boşta kalınca
 * kapatılması sorunuyla İLGİLİ DEĞİL — o, server.mjs'teki ping/pong
 * heartbeat ile (her zaman aktif, bu ayardan bağımsız) ayrıca çözüldü.
 * Buradaki alan yalnızca isteğe bağlı bir güvenlik önlemi.
 */
const PANEL_SETTINGS_ID = "panel"
const MIN_TIMEOUT_SECONDS = 30
const MAX_TIMEOUT_SECONDS = 24 * 60 * 60 // 24 saat

function toPublic(settings: { terminalIdleTimeoutSeconds: number | null }) {
  return { idleTimeoutSeconds: settings.terminalIdleTimeoutSeconds }
}

export async function GET() {
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }
  const settings = await prisma.panelSettings.upsert({
    where: { id: PANEL_SETTINGS_ID },
    update: {},
    create: { id: PANEL_SETTINGS_ID },
  })
  return NextResponse.json(toPublic(settings))
}

export async function PATCH(request: Request) {
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
  const raw = input.idleTimeoutSeconds

  let idleTimeoutSeconds: number | null
  if (raw === null || raw === undefined || raw === 0) {
    idleTimeoutSeconds = null // sınırsız
  } else if (
    typeof raw === "number" &&
    Number.isInteger(raw) &&
    raw >= MIN_TIMEOUT_SECONDS &&
    raw <= MAX_TIMEOUT_SECONDS
  ) {
    idleTimeoutSeconds = raw
  } else {
    return NextResponse.json(
      {
        error: `Geçersiz süre. ${MIN_TIMEOUT_SECONDS} ile ${MAX_TIMEOUT_SECONDS} saniye arasında olmalı, sınırsız için 0/null gönderin.`,
      },
      { status: 400 }
    )
  }

  const settings = await prisma.panelSettings.upsert({
    where: { id: PANEL_SETTINGS_ID },
    update: { terminalIdleTimeoutSeconds: idleTimeoutSeconds },
    create: { id: PANEL_SETTINGS_ID, terminalIdleTimeoutSeconds: idleTimeoutSeconds },
  })
  return NextResponse.json(toPublic(settings))
}
