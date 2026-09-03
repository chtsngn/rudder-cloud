import { NextResponse } from "next/server"
import { HeadBucketCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3"

import { getSession } from "@/lib/auth"
import { decryptSecret } from "@/lib/crypto"
import { prisma } from "@/lib/prisma"

function toStr(val: unknown): string {
  return typeof val === "string" ? val.trim() : ""
}

/**
 * POST /api/settings/s3/test
 *
 * S3 baglantisini ve bucket erisilebilirligini test eder (n8n "Test connection" stili).
 * Iki mod destekler:
 * 1. Kayitli ID ile test: { id: string }
 * 2. Henuz kaydedilmemis form verileriyle test:
 *    { bucket, region, endpoint, accessKeyId, secretAccessKey, pathPrefix }
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erisim." }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Gecersiz istek govdesi." }, { status: 400 })
  }

  const input = (body ?? {}) as Record<string, unknown>
  const configId = toStr(input.id)

  let bucket = toStr(input.bucket)
  let region = toStr(input.region)
  let endpoint = toStr(input.endpoint) || null
  let accessKeyId = toStr(input.accessKeyId)
  let secretAccessKey = toStr(input.secretAccessKey)

  // 1. Kayitli ID verilmis ise veritabanindan oku ve secret coz
  if (configId) {
    const existing = await prisma.s3Config.findUnique({ where: { id: configId } })
    if (!existing) {
      return NextResponse.json({ ok: false, error: "S3 yapilandirmasi bulunamadi." }, { status: 404 })
    }
    bucket = existing.bucket
    region = existing.region
    endpoint = existing.endpoint
    accessKeyId = existing.accessKeyId
    try {
      secretAccessKey = decryptSecret(existing.secretAccessKeyEnc)
    } catch {
      return NextResponse.json(
        { ok: false, error: "Kayitli S3 sifresi cozulemedi." },
        { status: 500 }
      )
    }
  }

  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    return NextResponse.json(
      { ok: false, error: "Bucket, region, Access Key ve Secret Key zorunludur." },
      { status: 400 }
    )
  }

  try {
    const client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      forcePathStyle: Boolean(endpoint),
      credentials: { accessKeyId, secretAccessKey },
    })

    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }))
    } catch (headErr: any) {
      const code = headErr?.$metadata?.httpStatusCode
      if (code === 404) {
        return NextResponse.json({
          ok: false,
          error: "Bucket bulunamadi (404 Not Found): '" + bucket + "'. Bucket adini ve bolgesini kontrol edin.",
        })
      }
      if (code === 403) {
        return NextResponse.json({
          ok: false,
          error: "Erisim engellendi (403 Forbidden). Access Key veya Secret Key hatali ya da '" + bucket + "' icin erisim izniniz yok.",
        })
      }

      // Fallback: ListObjectsV2 (max 1 object)
      try {
        await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }))
      } catch (listErr: any) {
        const status = listErr?.$metadata?.httpStatusCode
        if (status === 403) {
          return NextResponse.json({
            ok: false,
            error: "Erisim engellendi (403 Forbidden). Kimlik bilgilerinizi veya bucket izinlerinizi kontrol edin.",
          })
        }
        if (status === 404) {
          return NextResponse.json({
            ok: false,
            error: "Bucket bulunamadi (404 Not Found): '" + bucket + "'.",
          })
        }
        throw listErr
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Baglanti basarili! '" + bucket + "' bucketina sorunsuz erisildi.",
      bucket,
      region,
      endpoint: endpoint || "AWS Standart",
    })
  } catch (err: any) {
    console.error("S3 baglanti testi hatasi:", err)
    let msg = err instanceof Error ? err.message : "S3 baglantisi kurulamadi."
    if (err?.name === "CredentialsProviderError") {
      msg = "Kimlik bilgisi hatasi: Access Key ID veya Secret Access Key gecersiz."
    } else if (err?.code === "ENOTFOUND" || (err?.message && err.message.includes("getaddrinfo"))) {
      msg = "Endpoint adresine ulasilamadi (" + (endpoint || region) + "). Alan adini kontrol edin."
    } else if (err?.message && (err.message.includes("SSL") || err.message.includes("certificate"))) {
      msg = "SSL/TLS sertifika hatasi: Endpoint ile guvenli baglanti kurulamadi."
    }

    return NextResponse.json({
      ok: false,
      error: msg,
    })
  }
}
