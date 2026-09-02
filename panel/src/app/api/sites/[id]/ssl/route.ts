import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { isValidEmail, ProvisionError, requestSsl } from "@/lib/provision"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * `POST /api/sites/[id]/ssl` — bir site için SSL sertifikasını (yeniden)
 * dener. Site oluşturma sırasında SSL başarısız olsa bile site ACTIVE kalır
 * (bkz. /api/sites/route.ts → runProvisioning notu); bu endpoint, DNS
 * düzeltildikten sonra (ya da ilk kurulumda SSL hiç istenmediyse, sonradan
 * eklemek için) o adımı bağımsız olarak tekrar çalıştırır.
 *
 * body: { email?: string } — verilmezse site.config.sslEmail (oluşturma
 * sırasında girilmişse) kullanılır; ikisi de yoksa 400 döner.
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
  if (!(await canManageSite(session.userId, site, "EDIT_FILES"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    // gövde boş/geçersiz olabilir — email opsiyonel, aşağıda config'ten okunur
  }
  const input = (body ?? {}) as Record<string, unknown>
  const bodyEmail = typeof input.email === "string" ? input.email.trim() : ""

  const cfg = (site.config ?? {}) as Record<string, unknown>
  const configEmail = typeof cfg.sslEmail === "string" ? cfg.sslEmail : ""
  const email = bodyEmail || configEmail

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Geçerli bir e-posta adresi gereklidir." }, { status: 400 })
  }

  const www = cfg.www === true || cfg.www === "true"

  try {
    await requestSsl(site.domain, email, www)
  } catch (error) {
    const message = error instanceof ProvisionError ? error.message : "SSL sertifikası alınamadı."
    const updated = await prisma.site.update({
      where: { id },
      data: {
        sslStatus: "error",
        sslLastError: message,
        config: bodyEmail ? ({ ...cfg, sslEmail: email } as Prisma.InputJsonValue) : undefined,
      },
    })
    void logAudit({
      userId: session.userId,
      action: "SITE_SSL_RETRY_FAILED",
      targetType: "Site",
      targetId: id,
      detail: `${site.domain}: ${message}`,
    })
    return NextResponse.json({ error: message, ...updated }, { status: 502 })
  }

  const updated = await prisma.site.update({
    where: { id },
    data: {
      sslEnabled: true,
      sslStatus: "active",
      sslLastError: null,
      config: bodyEmail ? ({ ...cfg, sslEmail: email } as Prisma.InputJsonValue) : undefined,
    },
  })
  void logAudit({
    userId: session.userId,
    action: "SITE_SSL_RETRY_OK",
    targetType: "Site",
    targetId: id,
    detail: site.domain,
  })
  return NextResponse.json(updated)
}
