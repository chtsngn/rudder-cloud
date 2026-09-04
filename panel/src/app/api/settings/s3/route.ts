import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { CryptoConfigError, encryptSecret } from "@/lib/crypto"
import { isSuperAdmin } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

/**
 * S3 yapılandırmaları — panel genelinde (site-scoped DEĞİL, `MANAGE_BACKUPS`
 * yerine yalnızca oturum kontrolü yeterli, tıpkı `/api/system/ports` gibi).
 * `secretAccessKeyEnc` YANITTA ASLA dönmez — yalnızca `hasSecret: true/false`.
 */
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
  sites?: Array<{ id: string; domain: string }>
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
    sites: config.sites ?? [],
    sitesCount: config.sites ? config.sites.length : 0,
  }
}

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }
  const configs = await prisma.s3Config.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      sites: {
        select: { id: true, domain: true },
      },
    },
  })
  return NextResponse.json(configs.map(toPublic))
}

function toStr(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
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
  const input = (body ?? {}) as Record<string, unknown>

  const label = toStr(input.label) || "Varsayılan"
  const bucket = toStr(input.bucket)
  const region = toStr(input.region)
  const endpoint = toStr(input.endpoint) || null
  const accessKeyId = toStr(input.accessKeyId)
  const secretAccessKey = toStr(input.secretAccessKey)
  const pathPrefix = toStr(input.pathPrefix)

  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    return NextResponse.json(
      { error: "bucket, region, accessKeyId ve secretAccessKey zorunludur." },
      { status: 400 }
    )
  }

  try {
    const created = await prisma.s3Config.create({
      data: {
        label,
        bucket,
        region,
        endpoint,
        accessKeyId,
        secretAccessKeyEnc: encryptSecret(secretAccessKey),
        pathPrefix,
      },
    })
    return NextResponse.json(toPublic(created), { status: 201 })
  } catch (error) {
    if (error instanceof CryptoConfigError) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    console.error("S3 yapılandırması oluşturulamadı:", error)
    return NextResponse.json({ error: "Oluşturulamadı." }, { status: 500 })
  }
}
