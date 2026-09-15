/**
 * Otomatik git pull zamanlayıcısı — gerçek bir cron/systemd-timer DEĞİL;
 * panel süreci (`panel.service`) ayaktayken çalışan, uygulama içi bir
 * "reconciliation loop"dur. Süreç yeniden başlarsa zamanlayıcı da sıfırdan
 * başlar (kabul edilebilir: 15sn gibi kısa aralıklar için önemsiz).
 *
 * Her TICK_MS'de bir: `autoPullEnabled = true` olan ve git desteklenen
 * (NODEJS/PYTHON/REVERSE_PROXY/DOCKER) siteleri okur, süresi dolanlar için
 * deploy hattını (`deploySite`, bkz. src/lib/deploy.ts) çalıştırır — HEAD
 * değiştiyse deployCommand + yeniden başlatma da oradan tetiklenir. Aynı site
 * için bir deploy hâlâ sürüyorsa (yavaş build/ağ) o site atlanır.
 *
 * Not: GitHub App push webhook'u (`/api/hooks/github`) bağlıysa bu döngü
 * yalnızca yedek/emniyet görevi görür — webhook anında tetikler.
 */
import { DeployError, deploySite, isDeployInFlight, toDeployable } from "@/lib/deploy"
import { isGitPullSupported } from "@/lib/git"
import { prisma } from "@/lib/prisma"

const TICK_MS = 5_000

let started = false
let timer: ReturnType<typeof setInterval> | null = null
const lastAttemptAt = new Map<string, number>()

async function tick(): Promise<void> {
  let sites
  try {
    sites = await prisma.site.findMany({
      where: { autoPullEnabled: true, repoUrl: { not: null } },
      include: { githubInstallation: true },
    })
  } catch (error) {
    console.error("[auto-pull-scheduler] site listesi okunamadı:", error)
    return
  }

  const now = Date.now()

  for (const site of sites) {
    if (!site.repoUrl) continue
    if (!isGitPullSupported(site.type)) continue
    if (isDeployInFlight(site.id)) continue

    const last = lastAttemptAt.get(site.id) ?? 0
    const intervalMs = Math.max(5, site.autoPullIntervalSeconds) * 1000
    if (now - last < intervalMs) continue

    lastAttemptAt.set(site.id, now)
    void deploySite(toDeployable(site), { trigger: "auto-pull" })
      .then((result) => {
        if (result.changed) {
          console.log(
            `[auto-pull-scheduler] ${site.domain}: yeni commit ${result.commit?.slice(0, 7) ?? ""} çekildi` +
              (result.restartError ? ` ama yeniden başlatma başarısız: ${result.restartError}` : ", deploy edildi.")
          )
        }
      })
      .catch((error) => {
        if (error instanceof DeployError && error.stage === "busy") return
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
