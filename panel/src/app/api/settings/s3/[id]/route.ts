import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { CryptoConfigError, encryptSecret } from "@/lib/crypto"
import { isSuperAdmin } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

interface RouteParams {
  params: Promise<{ id: string }>
}

function toPublic(config: {
  id: string
  label: string
  bucket: string
  region: string
  endpoint: string | null
  accessKeyId: string
  pathPrefix: string
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: config.id,
    label: config.label,
    bucket: config.bucket,
    region: config.region,
    endpoint: config.endpoint,
    accessKeyId: config.accessKeyId,
    pathPrefix: config.pathPrefix,
    hasSecret: true,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  }
}

function toStr(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/**
 * `PATCH /api/settings/s3/[id]` — `secretAccessKey` gönderilmezse mevcut
 * şifreli değer OLDUĞU GİBİ kalır (yeniden şifrelenmez); gönderilirse
 * yenisiyle değiştirilir.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  const { id } = await params
  const existing = await prisma.s3Config.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "Yapılandırma bulunamadı." }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 })
  }
  const input = (body ?? {}) as Record<string, unknown>
  const data: Record<string, unknown> = {}

  if ("label" in input) data.label = toStr(input.label) || "Varsayılan"
  if ("bucket" in input) {
    const v = toStr(input.bucket)
    if (!v) return NextResponse.json({ error: "bucket boş olamaz." }, { status: 400 })
    data.bucket = v
  }
  if ("region" in input) {
    const v = toStr(input.region)
    if (!v) return NextResponse.json({ error: "region boş olamaz." }, { status: 400 })
    data.region = v
  }
  if ("endpoint" in input) data.endpoint = toStr(input.endpoint) || null
  if ("accessKeyId" in input) {
    const v = toStr(input.accessKeyId)
    if (!v) return NextResponse.json({ error: "accessKeyId boş olamaz." }, { status: 400 })
    data.accessKeyId = v
  }
  if ("pathPrefix" in input) data.pathPrefix = toStr(input.pathPrefix)
  if ("secretAccessKey" in input) {
    const v = toStr(input.secretAccessKey)
    if (v) {
      try {
        data.secretAccessKeyEnc = encryptSecret(v)
      } catch (error) {
        if (error instanceof CryptoConfigError) {
          return NextResponse.json({ error: error.message }, { status: 500 })
        }
        throw error
      }
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Güncellenecek bir alan gönderilmedi." }, { status: 400 })
  }

  const updated = await prisma.s3Config.update({ where: { id }, data })
  return NextResponse.json(toPublic(updated))
}

/** `DELETE /api/settings/s3/[id]` — siteler `s3ConfigId`'yi (`onDelete: SetNull`) otomatik kaybeder. */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  const { id } = await params
  try {
    await prisma.s3Config.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Yapılandırma bulunamadı." }, { status: 404 })
  }
}
