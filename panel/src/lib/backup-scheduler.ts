/**
 * Otomatik veritabanı yedekleme zamanlayıcısı — `auto-pull-scheduler.ts` ile
 * BİREBİR AYNI desen: gerçek bir cron/systemd-timer DEĞİL, panel süreci
 * ayaktayken çalışan uygulama-içi bir reconciliation loop. `backupEnabled`
 * olan siteleri periyodik tarar, her birinin kendi `backupIntervalSeconds`'ı
 * dolduğunda `runBackupForSite` çalıştırır (bkz. docs/ARCHITECTURE.md →
 * Aşama D).
 *
 * 2026-11: her yedek bir site işidir (kind `backup`, trigger `schedule`; bkz.
 * src/lib/site-jobs.ts). Kendi `inFlight` kümesi kayda devredildi: sitede
 * başka bir iş (deploy vb.) sürüyorsa yedek takip işi olarak kuyruğa girer,
 * atlanmaz; aynı sitede bekleyen yedek varsa ona katılır.
 */
import { prisma } from "@/lib/prisma"
import { listActiveJobs, startBackupJob } from "@/lib/site-jobs"

const TICK_MS = 30_000 // yedekler pull'dan çok daha az sık gerekir — 30sn'de bir kontrol yeter

let started = false
let timer: ReturnType<typeof setInterval> | null = null
const lastAttemptAt = new Map<string, number>()

async function tick(): Promise<void> {
  let sites
  try {
    sites = await prisma.site.findMany({
      where: { backupEnabled: true },
      select: { id: true, domain: true, backupIntervalSeconds: true },
    })
  } catch (error) {
    console.error("[backup-scheduler] site listesi okunamadı:", error)
    return
  }

  const now = Date.now()
  // Bekleyen ya da çalışan yedeği olan site yeniden tetiklenmez.
  const pending = new Set(listActiveJobs().filter((job) => job.kind === "backup").map((job) => job.siteId))

  for (const site of sites) {
    if (pending.has(site.id)) continue
    const last = lastAttemptAt.get(site.id) ?? 0
    const intervalMs = Math.max(60, site.backupIntervalSeconds) * 1000
    if (now - last < intervalMs) continue

    lastAttemptAt.set(site.id, now)
    // Başarı/hata günlüğü ve Site.lastBackup* işin içinde yazılır.
    void startBackupJob({ siteId: site.id, domain: site.domain, trigger: "schedule" }).catch((error) => {
      console.error(`[backup-scheduler] ${site.domain}: yedek işi başlatılamadı:`, error)
    })
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

