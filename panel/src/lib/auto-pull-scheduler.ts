/**
 * Otomatik git pull zamanlayıcısı — gerçek bir cron/systemd-timer DEĞİL;
 * panel süreci (`panel.service`) ayaktayken çalışan, uygulama içi bir
 * "reconciliation loop"dur. Süreç yeniden başlarsa zamanlayıcı da sıfırdan
 * başlar (kabul edilebilir: 15sn gibi kısa aralıklar için önemsiz).
 *
 * Her TICK_MS'de bir: `autoPullEnabled = true` olan ve git desteklenen
 * (Statik/Uygulama) siteleri okur, süresi dolanlar için
 * deploy hattını (`deploySite`, bkz. src/lib/deploy.ts) çalıştırır — HEAD
 * değiştiyse deployCommand + yeniden başlatma da oradan tetiklenir. Sitede bir
 * iş hâlâ sürüyorsa (yavaş build/ağ, elle deploy, yedek) o site atlanır.
 *
 * 2026-11: her deneme bir site işidir (bkz. src/lib/site-jobs.ts) ama GEÇİCİ
 * başlar — yalnız gerçekten deploy edecekse (yeni commit) veritabanına yazılır;
 * değişiklik olmayan turlar iş geçmişini doldurmaz.
 *
 * Not: GitHub App push webhook'u (`/api/hooks/github`) bağlıysa bu döngü
 * yalnızca yedek/emniyet görevi görür — webhook anında tetikler.
 */
import { isGitPullSupported } from "@/lib/git"
import { prisma } from "@/lib/prisma"
import { busyJob, startDeployJob, waitForJob } from "@/lib/site-jobs"

const TICK_MS = 5_000

let started = false
let timer: ReturnType<typeof setInterval> | null = null
const lastAttemptAt = new Map<string, number>()

async function tick(): Promise<void> {
  let sites
  try {
    sites = await prisma.site.findMany({
      where: { autoPullEnabled: true, repoUrl: { not: null } },
      select: { id: true, domain: true, type: true, repoUrl: true, autoPullIntervalSeconds: true },
    })
  } catch (error) {
    console.error("[auto-pull-scheduler] site listesi okunamadı:", error)
    return
  }

  const now = Date.now()

  for (const site of sites) {
    if (!site.repoUrl) continue
    if (!isGitPullSupported(site.type)) continue
    if (busyJob(site.id)) continue

    const last = lastAttemptAt.get(site.id) ?? 0
    const intervalMs = Math.max(5, site.autoPullIntervalSeconds) * 1000
    if (now - last < intervalMs) continue

    lastAttemptAt.set(site.id, now)
    // Başarı günlüğü işin içinde yazılır (bkz. startDeployJob); burada yalnız hata.
    void startDeployJob({ siteId: site.id, domain: site.domain, trigger: "auto-pull", action: "pull", force: false })
      .then(async (outcome) => {
        if (outcome.status !== "started") return
        const done = await waitForJob(outcome.job.id)
        if (done && done.status === "failed") console.error(`[auto-pull-scheduler] ${site.domain}: ${done.error}`)
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`[auto-pull-scheduler] ${site.domain}: ${message}`)
      })
  }
}

export function startAutoPullScheduler(): void {
  if (started) return
  started = true
  timer = setInterval(() => {
    void tick()
  }, TICK_MS)
  timer.unref?.()
  console.log("[auto-pull-scheduler] başlatıldı (tick: " + TICK_MS + "ms).")
}

export function stopAutoPullScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
  started = false
}
