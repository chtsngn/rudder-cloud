/**
 * Deploy hattı (2026-09-15 denetimi) — TEK giriş noktası:
 *
 *   pull (repo varsa) → değişiklik varsa/zorlandıysa deployCommand → yeniden başlatma
 *
 * Elle "Deploy Et", "Pull", otomatik pull zamanlayıcısı, deploy hook ve GitHub
 * push webhook'u hepsi buradan geçer; böylece "pull başarılı ama restart eski
 * image'ı kullandı" ya da "klonlandı ama npm install hiç çalışmadı" gibi kopuk
 * adımlar kalmaz. Aynı site için eş zamanlı iki deploy engellenir (`inFlight`).
 *
 * `deployCommand` sitenin kök dizininde `panel` kullanıcısı olarak `bash -lc`
 * ile çalışır (ör. `npm ci && npm run build`). Yalnızca SUPER_ADMIN
 * ayarlayabilir (bkz. PATCH /api/sites/[id]) — panel kullanıcısının sudo'su
 * olduğu için bu komut fiilen root yetkisindedir.
 */
import { spawn } from "node:child_process"

import { GitError, gitPullOrClone, isGitPullSupported } from "@/lib/git"
import { prisma } from "@/lib/prisma"
import { RestartError, restartSite, tail, type RestartableSite } from "@/lib/restart"
import { resolveSiteWorkdir } from "@/lib/site-paths"

const DEPLOY_COMMAND_TIMEOUT_MS = 15 * 60_000
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

export interface DeployOptions {
  /** true: HEAD değişmese bile deployCommand + yeniden başlatma çalışır. */
  force?: boolean
  trigger: DeployTrigger
}

export interface DeployResult {
  pulled: boolean
  changed: boolean
  commit: string | null
  deployed: boolean
  restarted: boolean
  output: string
  restartError: string | null
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

const inFlight = new Set<string>()

export function isDeployInFlight(siteId: string): boolean {
  return inFlight.has(siteId)
}

/** Prisma'nın `include: { githubInstallation: true }` ile döndürdüğü satırı DeployableSite'a çevirir. */
export function toDeployable<T extends Omit<DeployableSite, "githubInstallationId"> & {
  githubInstallation?: { installationId: string } | null
}>(site: T): DeployableSite {
  return { ...site, githubInstallationId: site.githubInstallation?.installationId ?? null }
}

function runDeployCommand(command: string, cwd: string, env: NodeJS.ProcessEnv): Promise<{ ok: boolean; output: string; code: number | null }> {
  return new Promise((resolve) => {
    let output = ""
    const append = (chunk: Buffer) => {
      output += chunk.toString()
      if (output.length > OUTPUT_KEEP_BYTES * 4) output = tail(output, OUTPUT_KEEP_BYTES * 2)
    }
    const child = spawn("/bin/bash", ["-lc", command], { cwd, env, stdio: ["ignore", "pipe", "pipe"] })
    child.stdout.on("data", append)
    child.stderr.on("data", append)
    const timer = setTimeout(() => {
      output += `\n[panel] deploy komutu ${DEPLOY_COMMAND_TIMEOUT_MS / 60000} dakikayı aştı, sonlandırılıyor.`
      child.kill("SIGKILL")
    }, DEPLOY_COMMAND_TIMEOUT_MS)
    child.on("error", (err) => {
      clearTimeout(timer)
      resolve({ ok: false, output: `${output}\n[panel] komut başlatılamadı: ${err.message}`, code: null })
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ ok: code === 0, output, code })
    })
  })
}

export async function deploySite(site: DeployableSite, opts: DeployOptions): Promise<DeployResult> {
  if (inFlight.has(site.id)) {
    throw new DeployError("busy", "Bu site için zaten bir deploy sürüyor — bitmesini bekleyin.")
  }
  inFlight.add(site.id)
  try {
    return await runDeploy(site, opts)
  } finally {
    inFlight.delete(site.id)
  }
}

async function runDeploy(site: DeployableSite, opts: DeployOptions): Promise<DeployResult> {
  const startedAt = new Date()
  let pulled = false
  let changed = false
  let commit: string | null = null

  // 1) Pull
  if (site.repoUrl && isGitPullSupported(site.type)) {
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
      throw new DeployError("pull", message)
    }
  }

  const shouldDeploy = opts.force || changed || !pulled
  if (!shouldDeploy) {
    return { pulled, changed, commit, deployed: false, restarted: false, output: "", restartError: null }
  }

  // 2) deployCommand
  const lines: string[] = []
  const workdir = resolveSiteWorkdir(site)
  const command = site.deployCommand?.trim()
  if (command) {
    if (!workdir) throw new DeployError("deploy", "Bu site türü için çalışma dizini belirlenemedi.")
    const cfg = site.config && typeof site.config === "object" ? (site.config as Record<string, unknown>) : {}
    const env: NodeJS.ProcessEnv = { ...process.env, CI: "true", DEPLOY_TRIGGER: opts.trigger }
    if (cfg.port !== undefined && cfg.port !== null) env.PORT = String(cfg.port)
    if (commit) env.GIT_COMMIT = commit
    lines.push(`$ ${command}`)
    const result = await runDeployCommand(command, workdir, env)
    lines.push(result.output.trim())
    if (!result.ok) {
      const output = tail(lines.join("\n"), OUTPUT_KEEP_BYTES)
      const message = `Deploy komutu başarısız oldu (çıkış kodu ${result.code ?? "?"}).`
      await prisma.site
        .update({
          where: { id: site.id },
          data: { lastDeployAt: startedAt, lastDeployOk: false, lastDeployError: message, lastDeployOutput: output },
        })
        .catch(() => {})
      throw new DeployError("deploy", message, output)
    }
  }

  // 3) Yeniden başlatma (DOCKER_COMPOSE'da rebuild)
  let restartError: string | null = null
  let restarted = false
  try {
    await restartSite(site, { deploy: true })
    restarted = site.processManager !== "NONE"
    if (restarted) lines.push(`[panel] yeniden başlatıldı (${site.processManager}).`)
  } catch (error) {
    restartError = error instanceof RestartError ? error.message : "Yeniden başlatma başarısız oldu."
    lines.push(`[panel] yeniden başlatma başarısız: ${restartError}`)
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

  return { pulled, changed, commit, deployed: true, restarted, output, restartError }
}
