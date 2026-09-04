/**
 * Otomatik veritabanı yedekleme zamanlayıcısı — `auto-pull-scheduler.ts` ile
 * BİREBİR AYNI desen: gerçek bir cron/systemd-timer DEĞİL, panel süreci
 * ayaktayken çalışan uygulama-içi bir reconciliation loop. `backupEnabled`
 * olan siteleri periyodik tarar, her birinin kendi `backupIntervalSeconds`'ı
 * dolduğunda `runBackupForSite` çalıştırır (bkz. docs/ARCHITECTURE.md →
 * Aşama D).
 */
import { prisma } from "@/lib/prisma"
import { BackupError } from "@/lib/backup"
import { runBackupForSite } from "@/lib/run-backup"

const TICK_MS = 30_000 // yedekler pull'dan çok daha az sık gerekir — 30sn'de bir kontrol yeter

let started = false
let timer: ReturnType<typeof setInterval> | null = null
const lastAttemptAt = new Map<string, number>()
const inFlight = new Set<string>()

async function tick(): Promise<void> {
  let sites
  try {
    sites = await prisma.site.findMany({ where: { backupEnabled: true } })
  } catch (error) {
    console.error("[backup-scheduler] site listesi okunamadı:", error)
    return
  }

  const now = Date.now()

  for (const site of sites) {
    if (inFlight.has(site.id)) continue
    const last = lastAttemptAt.get(site.id) ?? 0
    const intervalMs = Math.max(60, site.backupIntervalSeconds) * 1000
    if (now - last < intervalMs) continue

    lastAttemptAt.set(site.id, now)
    inFlight.add(site.id)
    void runOne(site).finally(() => {
      inFlight.delete(site.id)
    })
  }
}

async function runOne(site: Parameters<typeof runBackupForSite>[0] & { id: string }): Promise<void> {
  let result: { fileName: string; sizeBytes: number; uploadedToS3: boolean; s3Error: string | null } | undefined
  try {
    result = await runBackupForSite(site)
    await prisma.site.update({
      where: { id: site.id },
      data: {
        lastBackupAt: new Date(),
        lastBackupOk: true,
        lastBackupError: result.s3Error
          ? result.s3Error.includes("yükleme") || result.s3Error.includes("yapılandırma")
            ? result.s3Error
            : `Bulut depolamaya yükleme başarısız: ${result.s3Error}`
          : null,
      },
    })
    console.log(
      `[backup-scheduler] ${site.domain}: yedek alındı (${result.fileName})` +
        (result.uploadedToS3 ? ", bulut depolamaya yüklendi." : result.s3Error ? `, bulut hatası: ${result.s3Error}` : ".")
    )
  } catch (error) {
    const message = error instanceof BackupError ? error.message : "Yedekleme başarısız oldu."
    console.error(`[backup-scheduler] ${site.domain}: ${message}`)
    try {
      await prisma.site.update({
        where: { id: site.id },
        data: { lastBackupAt: new Date(), lastBackupOk: false, lastBackupError: message },
      })
    } catch (dbError) {
      console.error("[backup-scheduler] durum güncellenemedi:", dbError)
    }
  }
}

export function startBackupScheduler(): void {
  if (started) return
  started = true
  timer = setInterval(() => {
    void tick()
  }, TICK_MS)
  timer.unref?.()
  console.log("[backup-scheduler] başlatıldı (tick: " + TICK_MS + "ms).")
}

export function stopBackupScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
  started = false
}

