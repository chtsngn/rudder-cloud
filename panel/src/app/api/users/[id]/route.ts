import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"

import type { SitePermission } from "@prisma/client"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import { isSuperAdmin } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

interface RouteParams {
  params: Promise<{ id: string }>
}

const MIN_PASSWORD_LENGTH = 8
const BCRYPT_COST = 12

function toPublic(user: { id: string; username: string; role: string; createdAt: Date; updatedAt: Date }) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

/**
 * Bir SUPER_ADMIN'i silmek/rolünü MEMBER'a düşürmek üzereyken çağrılır.
 * Sistemde en az bir SUPER_ADMIN her zaman kalmalı — aksi halde kimse
 * kullanıcı yönetimine/panele geri erişemez (kilitlenme).
 */
async function wouldRemoveLastSuperAdmin(targetUserId: string): Promise<boolean> {
  const target = await prisma.user.findUnique({ where: { id: targetUserId } })
  if (!target || target.role !== "SUPER_ADMIN") return false
  const superAdminCount = await prisma.user.count({ where: { role: "SUPER_ADMIN" } })
  return superAdminCount <= 1
}

/** Kullanıcı detayı + hangi sitelerde hangi izinlere sahip olduğu. */
export async function GET(_request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  const { id } = await params
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) {
    return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 })
  }

  const [grants, sites] = await Promise.all([
    prisma.userSiteAccess.findMany({ where: { userId: id } }),
    prisma.site.findMany(),
  ])
  const siteById = new Map(sites.map((s) => [s.id, s]))
  const access = grants
    .map((g) => {
      const site = siteById.get(g.siteId)
      return site ? { siteId: g.siteId, domain: site.domain, permissions: g.permissions } : null
    })
    .filter(
      (a): a is { siteId: string; domain: string; permissions: SitePermission[] } => a !== null
    )

  return NextResponse.json({ ...toPublic(user), access })
}

/** Rol değiştirme ve/veya parola sıfırlama. İkisi de opsiyonel — yalnızca
 * gönderilen alan(lar) güncellenir. */
export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  const { id } = await params
  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 })
  }
  const input = (body ?? {}) as { role?: unknown; password?: unknown }

  const data: { role?: "SUPER_ADMIN" | "MEMBER"; passwordHash?: string } = {}
  const auditParts: string[] = []

  if ("role" in input) {
    if (input.role !== "SUPER_ADMIN" && input.role !== "MEMBER") {
      return NextResponse.json({ error: "Geçersiz rol." }, { status: 400 })
    }
    if (input.role === "MEMBER" && (await wouldRemoveLastSuperAdmin(id))) {
      return NextResponse.json(
        { error: "Son süper admin hesabının rolü değiştirilemez — sistemde en az bir süper admin kalmalı." },
        { status: 400 }
      )
    }
    data.role = input.role
    auditParts.push(`rol → ${input.role}`)
  }

  if ("password" in input) {
    const password = typeof input.password === "string" ? input.password : ""
    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json({ error: `Parola en az ${MIN_PASSWORD_LENGTH} karakter olmalı.` }, { status: 400 })
    }
    data.passwordHash = await bcrypt.hash(password, BCRYPT_COST)
    auditParts.push("parola sıfırlandı")
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Güncellenecek bir alan gönderilmedi." }, { status: 400 })
  }

  const updated = await prisma.user.update({ where: { id }, data })
  await logAudit({
    userId: session.userId,
    action: "USER_UPDATE",
    targetType: "User",
    targetId: id,
    detail: `${existing.username}: ${auditParts.join(", ")}`,
  })
  return NextResponse.json(toPublic(updated))
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  const { id } = await params

  if (id === session.userId) {
    return NextResponse.json({ error: "Kendi hesabınızı silemezsiniz." }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 })
  }

  if (await wouldRemoveLastSuperAdmin(id)) {
    return NextResponse.json(
      { error: "Son süper admin hesabı silinemez — sistemde en az bir süper admin kalmalı." },
      { status: 400 }
    )
  }

  // UserSiteAccess satırları cascade ile otomatik silinir; AuditLog
  // kayıtlarında userId NULL'a düşer, username denormalize edildiği için
  // geçmiş kayıtlar okunabilir kalır (bkz. prisma/schema.prisma).
  await prisma.user.delete({ where: { id } })
  await logAudit({
    userId: session.userId,
    action: "USER_DELETE",
    targetType: "User",
    targetId: id,
    detail: existing.username,
  })
  return NextResponse.json({ ok: true })
}
