import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { isSuperAdmin } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

// Basit, kronolojik bir liste — ağır bir filtreleme/sayfalama şeması
// bilinçli olarak kapsam dışı bırakıldı (bkz. prisma/schema.prisma → AuditLog
// notu). Son 200 kayıtla sınırlı, tek bir panel sunucusu için fazlasıyla
// yeterli.
const MAX_RESULTS = 200

export async function GET() {
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: MAX_RESULTS })
  return NextResponse.json(logs)
}
