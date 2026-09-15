import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import { isSuperAdmin } from "@/lib/permissions"
import { ProvisionError, refreshCloudflareIps } from "@/lib/provision"

/** `POST /api/settings/cloudflare-ips` — nginx real_ip için Cloudflare IP aralıklarını yeniler. */
export async function POST() {
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }
  try {
    await refreshCloudflareIps()
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof ProvisionError ? error.message : "Cloudflare IP listesi yenilenemedi." },
      { status: 502 }
    )
  }
  void logAudit({ userId: session.userId, action: "CLOUDFLARE_IPS_REFRESHED", targetType: "panel" })
  return NextResponse.json({ ok: true })
}
