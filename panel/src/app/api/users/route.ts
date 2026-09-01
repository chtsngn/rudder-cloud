import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"

import { Prisma } from "@prisma/client"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import { isSuperAdmin } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

/**
 * Kullanıcı yönetimi (Aşama G) — SADECE SUPER_ADMIN. `passwordHash` hiçbir
 * yanıtta DÖNMEZ (bkz. `toPublic`). Rol/parola değiştirme `/api/users/[id]`
 * (PATCH), silme aynı dosyada (DELETE) — burada yalnızca liste + oluşturma.
 */
function toPublic(user: { id: string; username: string; role: string; createdAt: Date; updatedAt: Date }) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/
const MIN_PASSWORD_LENGTH = 8
const BCRYPT_COST = 12

export async function GET() {
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } })
  return NextResponse.json(users.map(toPublic))
}

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
  const input = (body ?? {}) as { username?: unknown; password?: unknown; role?: unknown }

  const username = typeof input.username === "string" ? input.username.trim() : ""
  const password = typeof input.password === "string" ? input.password : ""
  const role = input.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "MEMBER"

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json(
      { error: "Kullanıcı adı 3-32 karakter olmalı; yalnızca harf, rakam, nokta, tire ve alt çizgi içerebilir." },
      { status: 400 }
    )
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `Parola en az ${MIN_PASSWORD_LENGTH} karakter olmalı.` }, { status: 400 })
  }

  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST)
    const user = await prisma.user.create({ data: { username, passwordHash, role } })
    await logAudit({
      userId: session.userId,
      action: "USER_CREATE",
      targetType: "User",
      targetId: user.id,
      detail: `${username} (${role})`,
    })
    return NextResponse.json(toPublic(user), { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Bu kullanıcı adı zaten kullanılıyor." }, { status: 409 })
    }
    console.error("Kullanıcı oluşturulamadı:", error)
    return NextResponse.json({ error: "Kullanıcı oluşturulamadı." }, { status: 500 })
  }
}
