/**
 * Otomatik git pull zamanlayıcısı — gerçek bir cron/systemd-timer DEĞİL;
 * panel süreci (`panel.service`) ayaktayken çalışan, uygulama içi bir
 * "reconciliation loop"dur. Süreç yeniden başlarsa zamanlayıcı da sıfırdan
 * başlar (bu kabul edilebilir: `autoPullIntervalSeconds` varsayılan 15sn
 * gibi kısa aralıklar için önemsiz bir fark yaratır).
 *
 * Her TICK_MS'de bir: `autoPullEnabled = true` olan ve git-pull desteklenen
 * (NODEJS/PYTHON/REVERSE_PROXY) siteleri DB'den okur, her biri için kendi
 * `autoPullIntervalSeconds` süresi dolmuşsa `gitPullOrClone` çalıştırır;
 * HEAD değiştiyse `restartSite` de tetiklenir. Aynı site için bir pull hâlâ
 * sürüyorsa (yavaş repo/ağ) bir sonraki tick o siteyi atlar — üst üste
 * binen pull'lar engellenir.
 */
import { GitError, gitPullOrClone, isGitPullSupported } from "@/lib/git"
import { prisma } from "@/lib/prisma"
import { RestartError, restartSite } from "@/lib/restart"

const TICK_MS = 5_000

let started = false
let timer: ReturnType<typeof setInterval> | null = null
const lastAttemptAt = new Map<string, number>()
const inFlight = new Set<string>()

async function tick(): Promise<void> {
  let sites
  try {
    sites = await prisma.site.findMany({
      where: { autoPullEnabled: true, repoUrl: { not: null } },
    })
  } catch (error) {
    console.error("[auto-pull-scheduler] site listesi okunamadı:", error)
    return
  }

  const now = Date.now()

  for (const site of sites) {
    if (!site.repoUrl) continue
    if (!isGitPullSupported(site.type)) continue
    if (inFlight.has(site.id)) continue

    const last = lastAttemptAt.get(site.id) ?? 0
    const intervalMs = Math.max(5, site.autoPullIntervalSeconds) * 1000
    if (now - last < intervalMs) continue

    lastAttemptAt.set(site.id, now)
    inFlight.add(site.id)

    void runPull(site).finally(() => {
      inFlight.delete(site.id)
    })
  }
}

async function runPull(site: {
  id: string
  domain: string
  type: string
  config: unknown
  repoUrl: string | null
  gitBranch: string
  processManager: string
  customRestartCommand: string | null
}): Promise<void> {
  if (!site.repoUrl) return

  try {
    const result = await gitPullOrClone({ ...site, repoUrl: site.repoUrl })
    const updated = await prisma.site.update({
      where: { id: site.id },
      data: { lastPullAt: new Date(), lastPullOk: true, lastPullError: null },
    })

    if (result.changed) {
      try {
        await restartSite(updated)
        console.log(`[auto-pull-scheduler] ${site.domain}: yeni commit çekildi ve yeniden başlatıldı.`)
      } catch (error) {
        const message = error instanceof RestartError ? error.message : String(error)
        console.error(`[auto-pull-scheduler] ${site.domain}: pull başarılı ama restart başarısız: ${message}`)
      }
    }
  } catch (error) {
    const message = error instanceof GitError ? error.message : "git pull başarısız oldu."
    console.error(`[auto-pull-scheduler] ${site.domain}: ${message}`)
    try {
      await prisma.site.update({
        where: { id: site.id },
        data: { lastPullAt: new Date(), lastPullOk: false, lastPullError: message },
      })
    } catch (dbError) {
      console.error("[auto-pull-scheduler] durum güncellenemedi:", dbError)
    }
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
