/**
 * Yedek dosyalarını S3 (ya da S3-uyumlu — MinIO, DigitalOcean Spaces vb.)
 * depolamaya yükler (Aşama D). Secret her zaman `crypto.ts` ile şifreli
 * saklanır, yalnızca yükleme anında bellekte çözülür — asla loglanmaz.
 */
import { promises as fs } from "node:fs"

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

import { decryptSecret } from "@/lib/crypto"

export interface S3ConfigLike {
  bucket: string
  region: string
  endpoint: string | null
  accessKeyId: string
  secretAccessKeyEnc: string
  pathPrefix: string
}

export class S3UploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "S3UploadError"
  }
}

/** Yerel yedek dosyasını S3'e yükler, kullanılan object key'i döndürür. */
export async function uploadBackupToS3(
  config: S3ConfigLike,
  localPath: string,
  fileName: string,
  domain: string
): Promise<string> {
  let secretAccessKey: string
  try {
    secretAccessKey = decryptSecret(config.secretAccessKeyEnc)
  } catch (error) {
    throw new S3UploadError(
      error instanceof Error ? error.message : "S3 kimlik bilgisi çözülemedi."
    )
  }

  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint || undefined,
    // Özel (S3-uyumlu olmayan-standart) bir endpoint verildiyse genelde
    // path-style adresleme gerekir (MinIO vb. virtual-hosted style'ı
    // desteklemeyebilir); AWS'in kendi endpoint'inde bu alan boş kalır.
    forcePathStyle: Boolean(config.endpoint),
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey },
  })

  const prefix = config.pathPrefix ? `${config.pathPrefix.replace(/^\/+|\/+$/g, "")}/` : ""
  const key = `${prefix}${domain}/${fileName}`

  let body: Buffer
  try {
    body = await fs.readFile(localPath)
  } catch {
    throw new S3UploadError("Yüklenecek yedek dosyası okunamadı.")
  }

  try {
    await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body }))
  } catch (error) {
    throw new S3UploadError(error instanceof Error ? error.message : "S3'e yükleme başarısız oldu.")
  }

  return key
}
