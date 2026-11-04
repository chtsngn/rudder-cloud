/**
 * Deploy güvenliği (2026-11) — Uygulama (REVERSE_PROXY) siteleri için:
 *
 * 1. Derleme kuyruğu: sunucuda aynı anda TEK ağır iş (deployCommand +
 *    compose rebuild/pull). Küçük sunucularda iki derleme aynı anda çalışınca
 *    RAM swap'a düşüp bütün siteler zaman aşımına uğruyordu. Kuyruk süreç
 *    içidir (tek panel süreci); git pull kuyruğa girmez.
 * 2. Deploy öncesi veritabanı dökümü: sitenin `.env`'inden algılanan
 *    veritabanı yedek klasörüne dökülür (yedek kartıyla aynı yer ve saklama
 *    sayısı). Döküm alınamazsa deploy DURUR; veritabanı algılanamazsa atlanır.
 * 3. Geri dönüş noktası (Docker Compose): kaynaktan derlenen her servisin
 *    mevcut imajı `<repo>:rudder-rollback` olarak etiketlenir (her deploy'da
 *    üzerine yazılır, diskte tek kopya).
 * 4. Sağlık kontrolü: yeniden başlatmadan sonra sitenin hedef adresine
 *    (`upstreamUrl` + `healthCheckPath`) istek; 500'ün altındaki her yanıt
 *    sağlıklı sayılır. Başarısızsa (ya da rebuild hata verdiyse) geri dönüş
 *    imajlarıyla `up -d --no-build` yapılır. Veritabanı geri ALINMAZ; döküm
 *    dosyası çıktıda yazar.
 *
 * Site ayarı: `config.deploySafety` (varsayılan açık) ve
 * `config.healthCheckPath` (varsayılan `/`).
 */
import { execFile } from "node:child_process"
import { promisify } from "node:util"

import { applyRetention, createDatabaseDump } from "@/lib/backup"
import { detectSiteDatabase } from "@/lib/db-detect"
import { prisma } from "@/lib/prisma"
import { resolveComposeTarget, type ComposeTarget } from "@/lib/restart"
import type { SiteLike } from "@/lib/site-paths"

const execFileAsync = promisify(execFile)

export const ROLLBACK_TAG = "rudder-rollback"
const HEALTH_TIMEOUT_MS = 120_000
const HEALTH_INTERVAL_MS = 3_000
const HEALTH_REQUEST_TIMEOUT_MS = 5_000
const HEALTH_PATH_RE = /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/?-]{0,199}$/

// ---------------------------------------------------------------------------
// 1) Derleme kuyruğu
// ---------------------------------------------------------------------------

let chain: Promise<unknown> = Promise.resolve()
let waiting = 0

/** Kuyrukta bekleyen (henüz başlamamış) iş sayısı. */
export function buildQueueWaiting(): number {
  return waiting
}

/**
 * `fn`'i sunucu genelindeki derleme kuyruğunda, öncekiler bitince çalıştırır.
 * `fn`'e kuyrukta beklenen süre (ms) verilir. Bir işin hatası sıradakileri
 * durdurmaz.
 */
export function withBuildSlot<T>(fn: (waitedMs: number) => Promise<T>): Promise<T> {
  const queuedAt = Date.now()
  waiting += 1
  const run = chain.then(() => {
    waiting -= 1
    return fn(Date.now() - queuedAt)
  })
  chain = run.catch(() => undefined)
  return run
}

// ---------------------------------------------------------------------------
// Ayarlar
// ---------------------------------------------------------------------------

export interface DeploySafetySettings {
  enabled: boolean
  healthCheckPath: string
}

/** `config.healthCheckPath` doğrulaması: boş → "/", geçerli yol → kendisi, geçersiz → null. */
export function normalizeHealthCheckPath(value: unknown): string | null {
  if (value === null || value === undefined) return "/"
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed === "") return "/"
  return HEALTH_PATH_RE.test(trimmed) ? trimmed : null
}

export function deploySafetySettings(site: SiteLike): DeploySafetySettings {
  const cfg = site.config && typeof site.config === "object" ? (site.config as Record<string, unknown>) : {}
  return {
    enabled: site.type === "REVERSE_PROXY" && cfg.deploySafety !== false,
    healthCheckPath: normalizeHealthCheckPath(cfg.healthCheckPath) ?? "/",
  }
}

// ---------------------------------------------------------------------------
// 2) Deploy öncesi döküm
// ---------------------------------------------------------------------------

export type PredeployDumpResult = { status: "skipped"; reason: string } | { status: "done"; fileName: string; sizeBytes: number }

export class DeploySafetyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DeploySafetyError"
  }
}

/**
 * Veritabanı algılanırsa dökümünü alır; algılanamazsa atlar. Döküm denenip
 * başarısız olursa `DeploySafetyError` fırlatır (deploy durmalı).
 */
export async function takePredeployDump(site: SiteLike & { id: string; domain: string }): Promise<PredeployDumpResult> {
  let detected
  try {
    detected = await detectSiteDatabase(site)
  } catch (error) {
    return { status: "skipped", reason: `veritabanı algılanamadı (${error instanceof Error ? error.message : String(error)})` }
  }
  if (!detected) return { status: "skipped", reason: "sitede veritabanı bağlantısı bulunmadı" }

  // Compose içindeki veritabanı henüz çalışmıyorsa (ilk deploy, durdurulmuş
  // site) dökülecek veri de yoktur; deploy'u durdurmak yerine atla.
  if (detected.composeService) {
    try {
      const target = await resolveComposeTarget(site)
      const running = (await docker([...target.args, "ps", "--status", "running", "--services"], target.workdir, 20_000))
        .split("\n")
        .map((line) => line.trim())
      if (!running.includes(detected.composeService)) {
        return { status: "skipped", reason: `veritabanı servisi (${detected.composeService}) çalışmıyor` }
      }
    } catch (error) {
      return { status: "skipped", reason: `veritabanı servisinin durumu okunamadı (${error instanceof Error ? error.message : String(error)})` }
    }
  }

  let dump
  try {
    dump = await createDatabaseDump(site.domain, detected)
  } catch (error) {
    throw new DeploySafetyError(
      `Deploy öncesi veritabanı dökümü alınamadı, deploy durduruldu: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  const row = await prisma.site.findUnique({ where: { id: site.id }, select: { backupRetentionCount: true } }).catch(() => null)
  await applyRetention(site.domain, row?.backupRetentionCount ?? 7).catch(() => {})
  return { status: "done", fileName: dump.fileName, sizeBytes: dump.sizeBytes }
}

// ---------------------------------------------------------------------------
// 3) Geri dönüş noktası (Docker Compose)
// ---------------------------------------------------------------------------

export interface RollbackPoint {
  target: ComposeTarget
  images: Array<{ service: string; ref: string; backup: string }>
}

interface ComposeConfigJson {
  name?: string
  services?: Record<string, { build?: unknown; image?: string }>
}

async function docker(args: string[], cwd?: string, timeout = 60_000): Promise<string> {
  const { stdout } = await execFileAsync("docker", args, { cwd, timeout, maxBuffer: 16 * 1024 * 1024 })
  return stdout
}

function splitImageRef(ref: string): { repo: string; tag: string } {
  const slash = ref.lastIndexOf("/")
  const colon = ref.lastIndexOf(":")
  if (colon > slash) return { repo: ref.slice(0, colon), tag: ref.slice(colon + 1) }
  return { repo: ref, tag: "latest" }
}

/**
 * Kaynaktan derlenen (`build:` olan) servislerin şu anki imajlarını
 * `<repo>:rudder-rollback` olarak etiketler. Henüz imajı olmayan servis
 * (ilk deploy) atlanır. Hata olursa null döner; deploy geri dönüşsüz sürer.
 */
export async function createRollbackPoint(site: SiteLike): Promise<{ point: RollbackPoint | null; note: string }> {
  let target: ComposeTarget
  try {
    target = await resolveComposeTarget(site)
  } catch (error) {
    return { point: null, note: `geri dönüş noktası yok: ${error instanceof Error ? error.message : String(error)}` }
  }
  let config: ComposeConfigJson
  try {
    config = JSON.parse(await docker([...target.args, "config", "--format", "json"], target.workdir)) as ComposeConfigJson
  } catch (error) {
    return { point: null, note: `geri dönüş noktası yok: compose yapılandırması okunamadı (${error instanceof Error ? error.message : String(error)})` }
  }
  const project = config.name ?? ""
  const images: RollbackPoint["images"] = []
  for (const [service, svc] of Object.entries(config.services ?? {})) {
    if (!svc || svc.build === undefined || svc.build === null) continue
    const ref = svc.image?.trim() || (project ? `${project}-${service}` : "")
    if (!ref) continue
    const { repo } = splitImageRef(ref)
    const backup = `${repo}:${ROLLBACK_TAG}`
    try {
      await docker(["image", "inspect", "--format", "{{.Id}}", ref])
    } catch {
      continue // bu servisin henüz imajı yok
    }
    try {
      await docker(["tag", ref, backup])
      images.push({ service, ref, backup })
    } catch (error) {
      return { point: null, note: `geri dönüş noktası yok: ${ref} etiketlenemedi (${error instanceof Error ? error.message : String(error)})` }
    }
  }
  if (images.length === 0) return { point: null, note: "geri dönüş noktası yok: derlenen servisin mevcut imajı bulunmadı (ilk deploy olabilir)" }
  return { point: { target, images }, note: `geri dönüş noktası: ${images.map((i) => i.backup).join(", ")}` }
}

/** Geri dönüş imajlarını eski adlarına geri etiketler (konteynerlere dokunmaz). */
export async function restoreRollbackTags(point: RollbackPoint): Promise<void> {
  for (const image of point.images) {
    await docker(["tag", image.backup, image.ref])
  }
}

/** Geri dönüş imajlarını eski adlarına geri etiketleyip `up -d --no-build` yapar. */
export async function rollbackTo(point: RollbackPoint): Promise<string> {
  await restoreRollbackTags(point)
  return docker([...point.target.args, "up", "-d", "--no-build", "--remove-orphans"], point.target.workdir, 10 * 60_000)
}

// ---------------------------------------------------------------------------
// 4) Sağlık kontrolü
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Sağlık kontrolünün adresi; hedef adres yoksa null. */
export function healthCheckUrl(site: SiteLike, settings: DeploySafetySettings): string | null {
  const cfg = site.config && typeof site.config === "object" ? (site.config as Record<string, unknown>) : {}
  const upstream = typeof cfg.upstreamUrl === "string" ? cfg.upstreamUrl.trim() : ""
  if (!upstream) return null
  try {
    return new URL(settings.healthCheckPath, upstream.endsWith("/") ? upstream : `${upstream}/`).toString()
  } catch {
    return null
  }
}

/** `url` 500'ün altında yanıt verene kadar (en çok 2 dk) dener. */
export async function waitHealthy(url: string, timeoutMs = HEALTH_TIMEOUT_MS): Promise<{ ok: boolean; detail: string }> {
  const started = Date.now()
  let last = "yanıt yok"
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, {
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(HEALTH_REQUEST_TIMEOUT_MS),
        headers: { "user-agent": "rudder-health-check" },
      })
      await res.body?.cancel().catch(() => {})
      if (res.status < 500) {
        return { ok: true, detail: `${res.status} (${Math.round((Date.now() - started) / 1000)} sn)` }
      }
      last = `HTTP ${res.status}`
    } catch (error) {
      last = error instanceof Error ? error.message : String(error)
    }
    await sleep(HEALTH_INTERVAL_MS)
  }
  return { ok: false, detail: `${Math.round(timeoutMs / 1000)} sn içinde sağlıklı yanıt gelmedi (son: ${last})` }
}
