/**
 * Manuel tetikleme (`POST /api/sites/[id]/backup/run`) ve zamanlayıcının
 * (`src/lib/backup-scheduler.ts`) ikisinin de kullandığı ortak akış:
 * algıla → dump al → eski yedekleri temizle → (varsa) S3'e yükle.
 */
import { applyRetention, BackupError, createDatabaseDump, localBackupPath } from "@/lib/backup"
import { detectSiteDatabase } from "@/lib/db-detect"
import { prisma } from "@/lib/prisma"
import type { SiteLike } from "@/lib/site-paths"
import { uploadBackupToS3 } from "@/lib/s3-upload"

export interface RunBackupResult {
  fileName: string
  sizeBytes: number
  uploadedToS3: boolean
  s3Error: string | null
}

type BackupableSite = SiteLike & {
  domain: string
  backupUploadToS3: boolean
  s3ConfigId: string | null
  backupRetentionCount: number
}

export async function runBackupForSite(site: BackupableSite): Promise<RunBackupResult> {
  const detected = await detectSiteDatabase(site)
  if (!detected) {
    throw new BackupError(
      "Bu site için veritabanı bağlantısı otomatik algılanamadı (.env dosyasında DATABASE_URL ya da DB_CONNECTION/DB_HOST/DB_DATABASE/... değişkenleri bulunamadı).",
      400
    )
  }

  const dump = await createDatabaseDump(site.domain, detected)
  await applyRetention(site.domain, site.backupRetentionCount)

  let uploadedToS3 = false
  let s3Error: string | null = null
  if (site.backupUploadToS3 && site.s3ConfigId) {
    const s3Config = await prisma.s3Config.findUnique({ where: { id: site.s3ConfigId } })
    if (!s3Config) {
      s3Error = "Seçili bulut depolama yapılandırması bulunamadı."
    } else {
      try {
        await uploadBackupToS3(
          s3Config,
          localBackupPath(site.domain, dump.fileName),
          dump.fileName,
          site.domain
        )
        uploadedToS3 = true
      } catch (error) {
        s3Error = error instanceof Error ? error.message : "Bulut depolamaya yükleme başarısız oldu."
      }
    }
  }

  return { fileName: dump.fileName, sizeBytes: dump.sizeBytes, uploadedToS3, s3Error }
}
