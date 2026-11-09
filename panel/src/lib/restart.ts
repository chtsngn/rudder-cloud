/**
 * "Proje yeniden başlatma" — sitenin `processManager` alanına göre doğru yolu
 * seçer. PM2 kök gerektirdiği için provision-site.sh üzerinden (sudo) gider; DOCKER_COMPOSE ve CUSTOM_SCRIPT panel süreci tarafından
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

import { timeoutExceededMessage } from "@/lib/build-timeout"
import { getBuildTimeoutMs } from "@/lib/build-timeout-setting"
import { siteCommandEnv } from "@/lib/command-env"
import {
  domainToSlug,
  isValidAbsolutePath,
  pm2Action,
  ProvisionError,
} from "@/lib/provision"
import { resolveSiteWorkdir, type SiteLike } from "@/lib/site-paths"

const execFileAsync = promisify(execFile)
const RESTART_TIMEOUT_MS = 120_000
// Derleme/çekme adımlarının (`compose up --build` / `compose pull` / `up`,
// özel betik) üst sınırı sabit değil: Ayarlar → Derleme (varsayılan sınırsız),
// her çağrıda `getBuildTimeoutMs()` ile okunur (bkz. src/lib/build-timeout.ts).
const MAX_OUTPUT_BYTES = 64 * 1024

export class RestartError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RestartError"
  }
}

function extractDetail(error: unknown, timeoutMs = 0): string {
  const err = error as NodeJS.ErrnoException & { stderr?: string; stdout?: string; killed?: boolean }
  if (err.killed) {
    // timeoutMs > 0 yalnız derleme adımlarında: Ayarlar'daki üst sınır aşıldı.
    if (timeoutMs > 0) return `${timeoutExceededMessage("Derleme", timeoutMs)} (Ayarlar → Derleme)`
    return "İşlem zaman aşımına uğradı."
  }
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

/**
 * Site klasöründeki bir compose dosyasının ADI (alt klasör yok: compose proje
 * dizinini ilk `-f` dosyasının klasörü sayar, alt klasörde proje adı, `.env`
 * ve göreli build yolları değişirdi). Nokta ya da `-` ile başlayamaz.
 */
const COMPOSE_FILE_NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,120}\.ya?ml$/

/**
 * `config.composeFile` doğrulaması (2026-11): boş/yok → "" (otomatik arama),
 * geçerli dosya adı → kendisi, geçersiz → null.
 */
export function normalizeComposeFile(value: unknown): string | null {
  if (value === null || value === undefined) return ""
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed === "") return ""
  return COMPOSE_FILE_NAME_RE.test(trimmed) ? trimmed : null
}

/** Sitede elle seçilmiş compose dosyası; yoksa "" (compose kendi arar). */
export function configuredComposeFile(site: SiteLike): string {
  const cfg = site.config && typeof site.config === "object" ? (site.config as Record<string, unknown>) : {}
  return normalizeComposeFile(cfg.composeFile) ?? ""
}

export interface ComposeTarget {
  workdir: string
  /** Kullanılan dosya (seçilmiş ya da otomatik bulunan). */
  file: string
  /** `docker` argümanlarının başı: `["compose"]` ya da `["compose", "-f", <dosya>]`. */
  args: string[]
}

/**
 * Sitenin compose hedefi. Dosya seçilmişse (ör. Fire Sight'ın
 * `docker-compose.prod.yml`'i) her komut `-f <dosya>` ile çalışır; bu durumda
 * `docker-compose.override.yml` otomatik yüklenmez. Seçilmemişse davranış eski:
 * `-f` yok, compose dosyayı ve override'ı kendisi bulur.
 */
export async function resolveComposeTarget(site: SiteLike): Promise<ComposeTarget> {
  const workdir = resolveSiteWorkdir(site)
  if (!workdir) throw new RestartError("Bu site türü için çalışma dizini belirlenemedi.")
  const configured = configuredComposeFile(site)
  if (configured) {
    try {
      await access(join(workdir, configured), fsConstants.R_OK)
    } catch {
      throw new RestartError(`Seçili compose dosyası bulunamadı: ${join(workdir, configured)}`)
    }
    return { workdir, file: configured, args: ["compose", "-f", configured] }
  }
  const found = await findComposeFile(workdir)
  if (!found) {
    throw new RestartError(
      `Çalışma dizininde compose dosyası yok (${workdir}) — docker-compose.yml/compose.yml bekleniyor ya da site ayarlarından compose dosyasını seçin.`
    )
  }
  return { workdir, file: found, args: ["compose"] }
}

/**
 * @param opts.deploy true ise DOCKER_COMPOSE için `rebuild` (up -d --build)
 * kullanılır — pull sonrası yeni kod/compose/image değişikliği yayına girsin diye.
 */
export async function restartSite(site: RestartableSite, opts: { deploy?: boolean } = {}): Promise<void> {
  switch (site.processManager) {
    case "NONE":
      return

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
      const timeout = await getBuildTimeoutMs()
      try {
        await execFileAsync(cmd, [], { cwd: workdir, env: siteCommandEnv(), timeout, maxBuffer: 8 * 1024 * 1024 })
      } catch (error) {
        throw new RestartError(extractDetail(error, timeout))
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
  const { workdir, args: base } = await resolveComposeTarget(site)
  const args =
    action === "up"
      ? [...base, "up", "-d", "--remove-orphans"]
      : action === "rebuild"
        ? [...base, "up", "-d", "--build", "--remove-orphans"]
        : action === "pull"
          ? [...base, "pull"]
          : [...base, action]
  const isBuild = action === "rebuild" || action === "pull" || action === "up"
  // 0 = sınırsız (execFile'da zaman aşımı yok).
  const timeout = isBuild ? await getBuildTimeoutMs() : RESTART_TIMEOUT_MS
  try {
    const { stdout, stderr } = await execFileAsync("docker", args, {
      cwd: workdir,
      env: siteCommandEnv(),
      timeout,
      maxBuffer: 8 * 1024 * 1024,
    })
    return tail(`${stdout}${stderr}`.trim())
  } catch (error) {
    throw new RestartError(extractDetail(error, isBuild ? timeout : 0))
  }
}

export async function dockerComposeLogs(site: SiteLike, lines: number): Promise<string> {
  const { workdir, args: base } = await resolveComposeTarget(site)
  const safeLines = Number.isInteger(lines) && lines >= 1 && lines <= 2000 ? lines : 200
  try {
    const { stdout, stderr } = await execFileAsync(
      "docker",
      [...base, "logs", "--tail", String(safeLines), "--no-color", "--timestamps"],
      { cwd: workdir, env: siteCommandEnv(), timeout: 30_000, maxBuffer: 8 * 1024 * 1024 }
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
  /** Gerçek bellek kullanımı (docker stats), bilinmiyorsa null. */
  memoryBytes?: number | null
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
      { env: siteCommandEnv(), timeout: 10_000 }
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
    case "DOCKER_COMPOSE": {
      let target: ComposeTarget
      try {
        target = await resolveComposeTarget(site)
      } catch (error) {
        return { manager: "DOCKER_COMPOSE", state: "unknown", detail: error instanceof Error ? error.message : String(error) }
      }
      const { workdir } = target
      try {
        const { stdout } = await execFileAsync("docker", [...target.args, "ps", "-a", "--format", "json"], {
          cwd: workdir,
          env: siteCommandEnv(),
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
