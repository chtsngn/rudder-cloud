/**
 * Deploy hattı (2026-09-15 denetimi) — TEK giriş noktası:
 *
 *   pull (repo varsa) → değişiklik varsa/zorlandıysa deployCommand → yeniden başlatma
 *
 * STATIC (2026-10-11): yeniden başlatma yerine yayın — depo `<siteRoot>/repo`'da,
 * deployCommand (derleme) orada çalışır, yayın klasörü `public`'e aynalanır
 * (bkz. src/lib/static-publish.ts).
 *
 * Elle "Deploy Et", "Pull", otomatik pull zamanlayıcısı, deploy hook ve GitHub
 * push webhook'u hepsi buradan geçer; böylece "pull başarılı ama restart eski
 * image'ı kullandı" ya da "klonlandı ama npm install hiç çalışmadı" gibi kopuk
 * adımlar kalmaz.
 *
 * 2026-11 (site işleri): deploy artık HTTP isteğinde değil, `SiteJob` arka plan
 * işinde çalışır (bkz. src/lib/site-jobs.ts). Site kilidi (aynı sitede eş
 * zamanlı iki iş) ve takip işi kuyruğu oradaki süreç geneli kayıttadır; bu
 * dosya yalnız hattı çalıştırır, çıktıyı ve fazı `opts.job`'a canlı akıtır.
 * `Site.lastDeploy*` özeti eskisi gibi en sonda yazılır.
 *
 * 2026-11: pull'dan sonraki ağır kısım sunucu genelinde TEK bir derleme
 * kuyruğundan geçer; Uygulama sitelerinde deploy güvenliği (döküm, geri dönüş
 * noktası, sağlık kontrolü) varsayılan açıktır — bkz. src/lib/deploy-safety.ts.
 *
 * `deployCommand` sitenin git dizininde `panel` kullanıcısı olarak `bash -lc`
 * ile çalışır (ör. `npm ci && npm run build`); ortamı panelin değil,
 * beyaz listeli temiz bir ortamdır (bkz. src/lib/command-env.ts). Yalnızca SUPER_ADMIN
 * ayarlayabilir (bkz. PATCH /api/sites/[id]) — panel kullanıcısının sudo'su
 * olduğu için bu komut fiilen root yetkisindedir.
 */
import { spawn } from "node:child_process"

import { formatDuration, timeoutExceededMessage } from "@/lib/build-timeout"
import { getBuildTimeoutMs } from "@/lib/build-timeout-setting"
import { siteCommandEnv } from "@/lib/command-env"
import { GitError, gitPullOrClone, isGitPullSupported } from "@/lib/git"
import { prisma } from "@/lib/prisma"
import { RestartError, restartSite, tail, type RestartableSite } from "@/lib/restart"
import type { JobContext } from "@/lib/site-job-core"
import {
  createRollbackPoint,
  deploySafetySettings,
  DeploySafetyError,
  healthCheckUrl,
  restoreRollbackTags,
  rollbackTo,
  takePredeployDump,
  waitHealthy,
  withBuildSlot,
  type RollbackPoint,
} from "@/lib/deploy-safety"
import { resolveGitWorkdir, resolveSiteWorkdir } from "@/lib/site-paths"
import { PublishError, publishStaticSite } from "@/lib/static-publish"

// Deploy komutunun üst sınırı sabit değil: Ayarlar → Derleme (varsayılan
// sınırsız), her deploy'da okunur (bkz. src/lib/build-timeout.ts).
const OUTPUT_KEEP_BYTES = 16 * 1024

export type DeployTrigger = "manual" | "pull" | "auto-pull" | "hook" | "webhook" | "connect"

export interface DeployableSite extends RestartableSite {
  id: string
  repoUrl: string | null
  gitBranch: string
  deployCommand: string | null
  /** GitHub'ın SAYISAL installation id'si (GitHubInstallation.installationId), bizim cuid'imiz DEĞİL. */
  githubInstallationId?: string | null
}

/** Deploy'un çıktısını/fazını aktardığı site işi (bkz. src/lib/site-job-core.ts). */
export type DeployReporter = Pick<JobContext, "log" | "write" | "phase" | "persist">

export interface DeployOptions {
  /** true: HEAD değişmese bile deployCommand + yeniden başlatma çalışır. */
  force?: boolean
  trigger: DeployTrigger
  /** Canlı çıktı ve faz; yoksa yalnız sonuç döner. */
  job?: DeployReporter
}

export interface DeployResult {
  pulled: boolean
  changed: boolean
  commit: string | null
  deployed: boolean
  restarted: boolean
  output: string
  restartError: string | null
  /** Sağlık kontrolü/yeniden başlatma başarısız olup önceki imajlara dönüldüyse true. */
  rolledBack: boolean
}

export class DeployError extends Error {
  stage: "busy" | "pull" | "deploy"
  output: string
  constructor(stage: DeployError["stage"], message: string, output = "") {
    super(message)
    this.name = "DeployError"
    this.stage = stage
    this.output = output
  }
}

/** Prisma'nın `include: { githubInstallation: true }` ile döndürdüğü satırı DeployableSite'a çevirir. */
export function toDeployable<T extends Omit<DeployableSite, "githubInstallationId"> & {
  githubInstallation?: { installationId: string } | null
}>(site: T): DeployableSite {
  return { ...site, githubInstallationId: site.githubInstallation?.installationId ?? null }
}

/** @param timeoutMs 0 = sınırsız: öldürme zamanlayıcısı hiç kurulmaz. */
function runDeployCommand(
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
  onChunk?: (chunk: string) => void
): Promise<{ ok: boolean; output: string; code: number | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    let output = ""
    let timedOut = false
    const append = (chunk: string) => {
      output += chunk
      if (output.length > OUTPUT_KEEP_BYTES * 4) output = tail(output, OUTPUT_KEEP_BYTES * 2)
      onChunk?.(chunk)
    }
    const child = spawn("/bin/bash", ["-lc", command], { cwd, env, stdio: ["ignore", "pipe", "pipe"] })
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", append)
    child.stderr.on("data", append)
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true
            append(`\n[panel] ${timeoutExceededMessage("deploy komutu", timeoutMs)}\n`)
            child.kill("SIGKILL")
          }, timeoutMs)
        : null
    child.on("error", (err) => {
      if (timer) clearTimeout(timer)
      append(`\n[panel] komut başlatılamadı: ${err.message}`)
      resolve({ ok: false, output, code: null, timedOut })
    })
    child.on("close", (code) => {
      if (timer) clearTimeout(timer)
      resolve({ ok: code === 0 && !timedOut, output, code, timedOut })
    })
  })
}

/**
 * Deploy hattını çalıştırır. KİLİT YOK: çağıran site işi kaydından geçmeli
 * (`startDeployJob`, bkz. src/lib/site-jobs.ts) — aynı sitede ikinci iş orada
 * 409 alır ya da takip işi olarak kuyruğa girer.
 */
export async function deploySite(site: DeployableSite, opts: DeployOptions): Promise<DeployResult> {
  const startedAt = new Date()
  const job = opts.job
  let pulled = false
  let changed = false
  let commit: string | null = null

  // 1) Pull
  if (site.repoUrl && isGitPullSupported(site.type)) {
    job?.phase("pull")
    job?.log(`[panel] git pull (${site.gitBranch})…`)
    try {
      const result = await gitPullOrClone({
        ...site,
        repoUrl: site.repoUrl,
        githubInstallationId: site.githubInstallationId ?? null,
      })
      pulled = true
      changed = result.changed
      commit = result.commit || null
      await prisma.site.update({
        where: { id: site.id },
        data: { lastPullAt: new Date(), lastPullOk: true, lastPullError: null },
      })
    } catch (error) {
      const message = error instanceof GitError ? error.message : "git pull başarısız oldu."
      await prisma.site
        .update({ where: { id: site.id }, data: { lastPullAt: new Date(), lastPullOk: false, lastPullError: message } })
        .catch(() => {})
      job?.log(`[panel] ${message}`)
      throw new DeployError("pull", message)
    }
    job?.log(
      changed
        ? `[panel] yeni commit: ${commit ? commit.slice(0, 7) : "?"}`
        : `[panel] değişiklik yok${commit ? ` (${commit.slice(0, 7)})` : ""}.`
    )
  }

  const shouldDeploy = opts.force || changed || !pulled
  if (!shouldDeploy) {
    return { pulled, changed, commit, deployed: false, restarted: false, output: "", restartError: null, rolledBack: false }
  }

  // Otomatik pull geçici işle başlar; gerçekten deploy edecekse kalıcılaşır.
  await job?.persist()
  job?.phase("queue")
  return withBuildSlot((waitedMs) => buildAndRestart(site, opts, { startedAt, pulled, changed, commit, waitedMs }))
}

interface BuildContext {
  startedAt: Date
  pulled: boolean
  changed: boolean
  commit: string | null
  waitedMs: number
}

/**
 * Pull'dan sonraki ağır kısım — sunucu genelindeki derleme kuyruğunda çalışır
 * (bkz. src/lib/deploy-safety.ts): deploy güvenliği açıksa döküm + geri dönüş
 * noktası → deployCommand → yeniden başlatma/yayın → sağlık kontrolü.
 */
async function buildAndRestart(site: DeployableSite, opts: DeployOptions, ctx: BuildContext): Promise<DeployResult> {
  const { startedAt, pulled, changed, commit } = ctx
  const job = opts.job
  // 2) deployCommand
  // `lines` Site.lastDeployOutput özeti içindir; `note` aynı satırı işin canlı
  // çıktısına da yazar (komut çıktısı zaten parça parça akar, ikinci kez yazılmaz).
  const lines: string[] = []
  const note = (line: string) => {
    lines.push(line)
    job?.log(line)
  }
  if (ctx.waitedMs >= 1000) note(`[panel] derleme kuyruğunda ${Math.round(ctx.waitedMs / 1000)} sn beklendi.`)

  const safety = deploySafetySettings(site)
  let rollbackPoint: RollbackPoint | null = null
  let dumpFile: string | null = null
  if (safety.enabled) {
    job?.phase("dump")
    try {
      const dump = await takePredeployDump(site)
      if (dump.status === "done") {
        dumpFile = dump.fileName
        note(`[panel] deploy öncesi döküm: ${dump.fileName} (${Math.round(dump.sizeBytes / 1024)} KB)`)
      } else {
        note(`[panel] deploy öncesi döküm atlandı: ${dump.reason}`)
      }
    } catch (error) {
      const message = error instanceof DeploySafetyError ? error.message : "Deploy öncesi döküm başarısız oldu."
      note(`[panel] ${message}`)
      const output = tail(lines.join("\n"), OUTPUT_KEEP_BYTES)
      await prisma.site
        .update({
          where: { id: site.id },
          data: { lastDeployAt: startedAt, lastDeployOk: false, lastDeployError: message, lastDeployOutput: output },
        })
        .catch(() => {})
      throw new DeployError("deploy", message, output)
    }
    if (site.processManager === "DOCKER_COMPOSE") {
      const created = await createRollbackPoint(site)
      rollbackPoint = created.point
      note(`[panel] ${created.note}`)
    }
  }

  const isStatic = site.type === "STATIC"
  const workdir = isStatic && !pulled ? resolveSiteWorkdir(site) : resolveGitWorkdir(site)
  const command = site.deployCommand?.trim()
  if (command) {
    if (!workdir) throw new DeployError("deploy", "Bu site türü için çalışma dizini belirlenemedi.")
    const cfg = site.config && typeof site.config === "object" ? (site.config as Record<string, unknown>) : {}
    const env = siteCommandEnv({ CI: "true", DEPLOY_TRIGGER: opts.trigger })
    if (cfg.port !== undefined && cfg.port !== null) env.PORT = String(cfg.port)
    if (commit) env.GIT_COMMIT = commit
    job?.phase("build")
    note(`$ ${command}`)
    const timeoutMs = await getBuildTimeoutMs()
    const commandStartedAt = Date.now()
    const result = await runDeployCommand(command, workdir, env, timeoutMs, job ? (chunk) => job.write(chunk) : undefined)
    lines.push(result.output.trim())
    if (job && result.output && !result.output.endsWith("\n")) job.write("\n")
    note(`[panel] deploy komutu ${formatDuration(Date.now() - commandStartedAt)} sürdü.`)
    if (!result.ok) {
      if (rollbackPoint) {
        // Konteynerler yeniden başlatılmadı (eski imajla çalışıyor); deploy komutu
        // imajı yeniden derlediyse etiketleri eski imaja geri çek.
        await restoreRollbackTags(rollbackPoint).catch(() => {})
      }
      const output = tail(lines.join("\n"), OUTPUT_KEEP_BYTES)
      const message = result.timedOut
        ? `Deploy komutu ${Math.round(timeoutMs / 60_000)} dakikalık derleme zaman aşımını aştı (Ayarlar → Derleme).`
        : `Deploy komutu başarısız oldu (çıkış kodu ${result.code ?? "?"}).`
      await prisma.site
        .update({
          where: { id: site.id },
          data: { lastDeployAt: startedAt, lastDeployOk: false, lastDeployError: message, lastDeployOutput: output },
        })
        .catch(() => {})
      throw new DeployError("deploy", message, output)
    }
  }

  // 3a) STATIC: yayın klasörünü public'e aynala (süreç yok, yeniden başlatma yok)
  if (isStatic) {
    if (pulled) {
      job?.phase("publish")
      try {
        const published = await publishStaticSite(site)
        note(`[panel] yayınlandı: repo/${published.publishDir || "."} → public/`)
      } catch (error) {
        const message = error instanceof PublishError ? error.message : "Yayınlama başarısız oldu."
        note(`[panel] ${message}`)
        const output = tail(lines.join("\n"), OUTPUT_KEEP_BYTES)
        await prisma.site
          .update({
            where: { id: site.id },
            data: { lastDeployAt: startedAt, lastDeployOk: false, lastDeployError: message, lastDeployOutput: output },
          })
          .catch(() => {})
        throw new DeployError("deploy", message, output)
      }
    }
    const output = tail(lines.join("\n"), OUTPUT_KEEP_BYTES)
    await prisma.site
      .update({
        where: { id: site.id },
        data: { lastDeployAt: startedAt, lastDeployOk: true, lastDeployError: null, lastDeployOutput: output },
      })
      .catch(() => {})
    return { pulled, changed, commit, deployed: true, restarted: false, output, restartError: null, rolledBack: false }
  }

  // 3) Yeniden başlatma (DOCKER_COMPOSE'da rebuild)
  let restartError: string | null = null
  let restarted = false
  let rolledBack = false
  const restartStartedAt = Date.now()
  if (site.processManager !== "NONE") job?.phase("restart")
  try {
    await restartSite(site, { deploy: true, onChunk: job ? (chunk) => job.write(chunk) : undefined })
    restarted = site.processManager !== "NONE"
    if (restarted) note(`[panel] yeniden başlatıldı (${site.processManager}).`)
  } catch (error) {
    restartError = error instanceof RestartError ? error.message : "Yeniden başlatma başarısız oldu."
    note(`[panel] yeniden başlatma başarısız: ${restartError}`)
  }
  if (site.processManager !== "NONE") {
    const label = site.processManager === "DOCKER_COMPOSE" ? "derleme (docker compose up -d --build)" : "yeniden başlatma"
    note(`[panel] ${label} ${formatDuration(Date.now() - restartStartedAt)} sürdü.`)
  }

  // 4) Sağlık kontrolü + geri dönüş (deploy güvenliği açık Uygulama siteleri)
  if (safety.enabled && site.processManager !== "NONE") {
    let failure = restartError
    if (!failure) {
      const url = healthCheckUrl(site, safety)
      if (url) {
        job?.phase("health")
        const health = await waitHealthy(url)
        note(`[panel] sağlık kontrolü ${url}: ${health.ok ? health.detail : `BAŞARISIZ — ${health.detail}`}`)
        if (!health.ok) failure = `Sağlık kontrolü başarısız: ${health.detail}`
      } else {
        note("[panel] sağlık kontrolü atlandı: sitenin hedef adresi yok.")
      }
    }
    if (failure && rollbackPoint) {
      job?.phase("rollback")
      try {
        await rollbackTo(rollbackPoint)
        rolledBack = true
        note(`[panel] önceki imajlara dönüldü (${rollbackPoint.images.map((i) => i.service).join(", ")}).`)
        const url = healthCheckUrl(site, safety)
        if (url) {
          const again = await waitHealthy(url)
          note(`[panel] geri dönüş sonrası sağlık kontrolü: ${again.ok ? again.detail : `BAŞARISIZ — ${again.detail}`}`)
        }
        failure = `${failure} — önceki sürüme dönüldü.`
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        note(`[panel] geri dönüş BAŞARISIZ: ${detail}`)
        failure = `${failure} — geri dönüş de başarısız: ${detail}`
      }
      if (dumpFile) {
        failure = `${failure} Veritabanı geri alınmadı; deploy öncesi döküm: ${dumpFile}`
        note(`[panel] veritabanı geri ALINMADI; gerekirse döküm: ${dumpFile}`)
      }
    }
    restartError = failure
  }

  const output = tail(lines.join("\n"), OUTPUT_KEEP_BYTES)
  await prisma.site
    .update({
      where: { id: site.id },
      data: {
        lastDeployAt: startedAt,
        lastDeployOk: restartError === null,
        lastDeployError: restartError,
        lastDeployOutput: output,
      },
    })
    .catch(() => {})

  return { pulled, changed, commit, deployed: true, restarted, output, restartError, rolledBack }
}
