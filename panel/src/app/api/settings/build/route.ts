import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import { parseBuildTimeoutMinutes } from "@/lib/build-timeout"
import { isSuperAdmin } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

/**
 * Uygulama deploy'unda derleme ve deploy komutu için isteğe bağlı üst sınır
 * (bkz. prisma/schema.prisma → PanelSettings.buildTimeoutMinutes notu ve
 * src/lib/build-timeout.ts). Varsayılan sınırsız (null). Tek satırlık
 * singleton (`PanelSettings.id === "panel"`), terminal/alan adı ayarlarıyla
 * aynı satırı paylaşır. Yalnızca SUPER_ADMIN (terminal ayarıyla aynı).
 */
const PANEL_SETTINGS_ID = "panel"

function toPublic(settings: { buildTimeoutMinutes: number | null }) {
  return { buildTimeoutMinutes: settings.buildTimeoutMinutes }
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
  const parsed = parseBuildTimeoutMinutes(input.buildTimeoutMinutes)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const settings = await prisma.panelSettings.upsert({
    where: { id: PANEL_SETTINGS_ID },
    update: { buildTimeoutMinutes: parsed.minutes },
    create: { id: PANEL_SETTINGS_ID, buildTimeoutMinutes: parsed.minutes },
  })
  void logAudit({
    userId: session.userId,
    action: "panel.build_timeout.updated",
    targetType: "panel",
    detail: parsed.minutes === null ? "sınırsız" : `${parsed.minutes} dk`,
  })
  return NextResponse.json(toPublic(settings))
}
