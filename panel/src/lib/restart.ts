/**
 * "Proje yeniden başlatma" — sitenin `processManager` alanına göre doğru yolu
 * seçer. SYSTEMD ve PM2 kök gerektirdiği için provision-site.sh üzerinden
 * (sudo) gider; DOCKER_COMPOSE ve CUSTOM_SCRIPT panel süreci tarafından
 * doğrudan çalıştırılır (panel docker grubunda olmalı — bkz. doctor.sh).
 *
 * 2026-09-15 denetimi: DOCKER_COMPOSE'da "deploy sonrası yeniden başlatma"
 * artık `docker compose up -d --build --remove-orphans` (bkz. `rebuild`) —
 * `restart` yalnızca mevcut konteynerleri yeniden başlattığı için kaynaktan
 * build edilen image'larda yeni kod HİÇ yayına girmiyordu. Elle "restart"
 * ayrıca duruyor. `NONE` yöneticisi hiçbir şey yapmaz.
 */
import { execFile } from "node:child_process"
import { access, constants as fsConstants } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"

import {
  domainToSlug,
  isValidAbsolutePath,
  pm2Action,
  ProvisionError,
  serviceAction,
  serviceStatus,
} from "@/lib/provision"
import { resolveSiteWorkdir, type SiteLike } from "@/lib/site-paths"

const execFileAsync = promisify(execFile)
const RESTART_TIMEOUT_MS = 120_000
const BUILD_TIMEOUT_MS = 15 * 60_000 // `compose up --build` / `compose pull` image çekebilir
const MAX_OUTPUT_BYTES = 64 * 1024

export class RestartError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RestartError"
  }
}

function extractDetail(error: unknown): string {
  const err = error as NodeJS.ErrnoException & { stderr?: string; stdout?: string; killed?: boolean }
  if (err.killed) return "İşlem zaman aşımına uğradı."
  const detail = err.stderr?.toString().trim() || err.stdout?.toString().trim() || err.message
  return tail(detail || "Bilinmeyen hata.")
}

export function tail(text: string, max = MAX_OUTPUT_BYTES): string {
  return text.length > max ? `…\n${text.slice(text.length - max)}` : text
}

export type RestartableSite = SiteLike & {
  domain: string
  processManager: string
  customRestartCommand: string | null
  pm2ProcessName?: string | null
}

export function pm2NameFor(site: { domain: string; pm2ProcessName?: string | null }): string {
  return site.pm2ProcessName?.trim() || domainToSlug(site.domain)
}

const COMPOSE_FILES = ["docker-compose.yml", "compose.yml", "docker-compose.yaml", "compose.yaml"]

export async function findComposeFile(workdir: string): Promise<string | null> {
  for (const name of COMPOSE_FILES) {
    try {
      await access(join(workdir, name), fsConstants.R_OK)
      return name
    } catch {
      // yok, sonrakine bak
    }
  }
  return null
}

async function requireComposeWorkdir(site: SiteLike): Promise<string> {
  const workdir = resolveSiteWorkdir(site)
  if (!workdir) throw new RestartError("Bu site türü için çalışma dizini belirlenemedi.")
  const composeFile = await findComposeFile(workdir)
  if (!composeFile) {
    throw new RestartError(
      `Çalışma dizininde compose dosyası yok (${workdir}) — docker-compose.yml/compose.yml bekleniyor.`
    )
  }
  return workdir
}

/**
 * @param opts.deploy true ise DOCKER_COMPOSE için `rebuild` (up -d --build)
 * kullanılır — pull sonrası yeni kod/compose/image değişikliği yayına girsin diye.
 */
export async function restartSite(site: RestartableSite, opts: { deploy?: boolean } = {}): Promise<void> {
  switch (site.processManager) {
    case "NONE":
      return

    case "SYSTEMD": {
      try {
        await serviceAction(site.domain, "restart")
      } catch (error) {
        throw new RestartError(
          error instanceof ProvisionError ? error.message : "Servis yeniden başlatılamadı."
        )
      }
      return
    }

    case "DOCKER_COMPOSE": {
      await dockerComposeControl(site, opts.deploy ? "rebuild" : "restart")
      return
    }

    case "PM2": {
      try {
        await pm2Action(site.domain, pm2NameFor(site), "restart")
      } catch (error) {
        throw new RestartError(error instanceof ProvisionError ? error.message : "pm2 restart başarısız oldu.")
      }
      return
    }

    case "CUSTOM_SCRIPT": {
      const workdir = resolveSiteWorkdir(site)
      if (!workdir) throw new RestartError("Bu site türü için çalışma dizini belirlenemedi.")
      const cmd = site.customRestartCommand
      if (!cmd) throw new RestartError("Özel restart komutu tanımlı değil.")
      if (!isValidAbsolutePath(cmd)) {
        throw new RestartError("Özel restart komutu geçerli bir mutlak yol olmalı.")
      }
      if (!cmd.startsWith(`${workdir}/`)) {
        throw new RestartError("Özel restart komutu site dizini içinde olmalı.")
      }
      try {
        await access(cmd, fsConstants.X_OK)
      } catch {
        throw new RestartError(`Betik çalıştırılabilir değil veya bulunamadı: ${cmd}`)
      }
      try {
        await execFileAsync(cmd, [], { cwd: workdir, timeout: BUILD_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 })
      } catch (error) {
        throw new RestartError(extractDetail(error))
      }
      return
    }

    default:
      throw new RestartError(`Bilinmeyen process manager: ${site.processManager}`)
  }
}

export type DockerComposeControlAction = "up" | "down" | "restart" | "rebuild" | "pull"

export const DOCKER_COMPOSE_ACTIONS: DockerComposeControlAction[] = ["up", "down", "restart", "rebuild", "pull"]

/**
 * Elle/deploy compose kontrolü — panel süreci olarak, sudo YOK (panel docker
 * grubunda olmalı). `up`: konteynerleri (yoksa) oluşturup başlatır; `rebuild`:
 * `up -d --build --remove-orphans` (kod/compose/image değişikliğini uygular);
 * `pull`: image'ları çeker; `down`: durdurup kaldırır; `restart`: mevcut
 * konteynerleri yeniden başlatır. Çıktının kuyruğunu döner.
 */
export async function dockerComposeControl(site: SiteLike, action: DockerComposeControlAction): Promise<string> {
  const workdir = await requireComposeWorkdir(site)
  const args =
    action === "up"
      ? ["compose", "up", "-d", "--remove-orphans"]
      : action === "rebuild"
        ? ["compose", "up", "-d", "--build", "--remove-orphans"]
        : action === "pull"
          ? ["compose", "pull"]
          : ["compose", action]
  const timeout = action === "rebuild" || action === "pull" || action === "up" ? BUILD_TIMEOUT_MS : RESTART_TIMEOUT_MS
  try {
    const { stdout, stderr } = await execFileAsync("docker", args, {
      cwd: workdir,
      timeout,
      maxBuffer: 8 * 1024 * 1024,
    })
    return tail(`${stdout}${stderr}`.trim())
  } catch (error) {
    throw new RestartError(extractDetail(error))
  }
}

export async function dockerComposeLogs(site: SiteLike, lines: number): Promise<string> {
  const workdir = await requireComposeWorkdir(site)
  const safeLines = Number.isInteger(lines) && lines >= 1 && lines <= 2000 ? lines : 200
  try {
    const { stdout, stderr } = await execFileAsync(
      "docker",
      ["compose", "logs", "--tail", String(safeLines), "--no-color", "--timestamps"],
      { cwd: workdir, timeout: 30_000, maxBuffer: 8 * 1024 * 1024 }
    )
    return `${stdout}${stderr}`
  } catch (error) {
    throw new RestartError(extractDetail(error))
  }
}

export interface ContainerStatus {
  name: string
  service: string
  state: string
  status: string
}

export interface ProcessStatus {
  manager: string
  state: "running" | "stopped" | "partial" | "failed" | "unknown" | "not-applicable"
  detail: string
  containers?: ContainerStatus[]
  /** Gerçek bellek kullanımı (systemd cgroup ya da docker stats), bilinmiyorsa null. */
  memoryBytes?: number | null
}

async function systemdMemoryBytes(domain: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      "systemctl",
      ["show", `site-${domainToSlug(domain)}.service`, "-p", "MemoryCurrent", "--value"],
      { timeout: 5000 }
    )
    const n = Number(stdout.trim())
    return Number.isFinite(n) && n > 0 && n < Number.MAX_SAFE_INTEGER ? n : null
  } catch {
    return null
  }
}

function parseDockerMem(raw: string): number | null {
  // "12.3MiB / 1.9GiB" -> bayt
  const m = raw.split("/")[0].trim().match(/^([\d.]+)\s*([KMGT]?i?B)$/i)
  if (!m) return null
  const value = Number(m[1])
  const unit = m[2].toUpperCase()
  const mult: Record<string, number> = { B: 1, KB: 1e3, KIB: 1024, MB: 1e6, MIB: 1024 ** 2, GB: 1e9, GIB: 1024 ** 3, TB: 1e12, TIB: 1024 ** 4 }
  return Number.isFinite(value) && mult[unit] ? Math.round(value * mult[unit]) : null
}

async function composeMemoryBytes(containerNames: string[]): Promise<number | null> {
  if (containerNames.length === 0) return null
  try {
    const { stdout } = await execFileAsync(
      "docker",
      ["stats", "--no-stream", "--format", "{{.MemUsage}}", ...containerNames],
      { timeout: 10_000 }
    )
    let total = 0
    let any = false
    for (const line of stdout.split("\n")) {
      const bytes = parseDockerMem(line)
      if (bytes !== null) {
        total += bytes
        any = true
      }
    }
    return any ? total : null
  } catch {
    return null
  }
}

function parseComposePs(stdout: string): ContainerStatus[] {
  const trimmed = stdout.trim()
  if (!trimmed) return []
  const rows: Array<Record<string, unknown>> = []
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) rows.push(...parsed)
    else rows.push(parsed)
  } catch {
    for (const line of trimmed.split("\n")) {
      try {
        rows.push(JSON.parse(line))
      } catch {
        // atla
      }
    }
  }
  return rows.map((r) => ({
    name: String(r.Name ?? r.name ?? ""),
    service: String(r.Service ?? r.service ?? ""),
    state: String(r.State ?? r.state ?? "unknown"),
    status: String(r.Status ?? r.status ?? ""),
  }))
}

/** Sitenin GERÇEK süreç durumu (DB'deki iyimser `status` alanı DEĞİL). */
export async function getProcessStatus(site: RestartableSite): Promise<ProcessStatus> {
  switch (site.processManager) {
    case "SYSTEMD": {
      try {
        const s = await serviceStatus(site.domain)
        return {
          manager: "SYSTEMD",
          state: s === "active" ? "running" : s === "failed" ? "failed" : s === "unknown" ? "unknown" : "stopped",
          detail: `systemd: ${s}`,
          memoryBytes: s === "active" ? await systemdMemoryBytes(site.domain) : null,
        }
      } catch (error) {
        return { manager: "SYSTEMD", state: "unknown", detail: error instanceof Error ? error.message : String(error) }
      }
    }
    case "DOCKER_COMPOSE": {
      const workdir = resolveSiteWorkdir(site)
      if (!workdir) return { manager: "DOCKER_COMPOSE", state: "unknown", detail: "Çalışma dizini belirlenemedi." }
      const composeFile = await findComposeFile(workdir)
      if (!composeFile) return { manager: "DOCKER_COMPOSE", state: "unknown", detail: "Compose dosyası bulunamadı." }
      try {
        const { stdout } = await execFileAsync("docker", ["compose", "ps", "-a", "--format", "json"], {
          cwd: workdir,
          timeout: 20_000,
          maxBuffer: 4 * 1024 * 1024,
        })
        const containers = parseComposePs(stdout)
        const running = containers.filter((c) => c.state === "running").length
        const state =
          containers.length === 0
            ? "stopped"
            : running === containers.length
              ? "running"
              : running === 0
                ? "stopped"
                : "partial"
        return {
          manager: "DOCKER_COMPOSE",
          state,
          detail: containers.length === 0 ? "Konteyner yok (up yapılmamış)." : `${running}/${containers.length} konteyner çalışıyor`,
          containers,
          memoryBytes: await composeMemoryBytes(containers.filter((c) => c.state === "running").map((c) => c.name)),
        }
      } catch (error) {
        return { manager: "DOCKER_COMPOSE", state: "unknown", detail: extractDetail(error) }
      }
    }
    case "PM2": {
      const name = pm2NameFor(site)
      try {
        const raw = await pm2Action(site.domain, name, "describe")
        const list = JSON.parse(raw || "[]") as Array<{ name?: string; pm2_env?: { status?: string } }>
        const proc = list.find((p) => p.name === name)
        if (!proc) return { manager: "PM2", state: "stopped", detail: `pm2'de "${name}" adında süreç yok.` }
        const status = proc.pm2_env?.status ?? "unknown"
        return {
          manager: "PM2",
          state: status === "online" ? "running" : status === "errored" ? "failed" : status === "unknown" ? "unknown" : "stopped",
          detail: `pm2 ${name}: ${status}`,
        }
      } catch (error) {
        return { manager: "PM2", state: "unknown", detail: error instanceof Error ? error.message : String(error) }
      }
    }
    default:
      return { manager: site.processManager, state: "not-applicable", detail: "" }
  }
}
