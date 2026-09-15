/**
 * Port tespiti — `GET /api/system/ports`, sihirbazdaki "meşgul portlar" ipucu
 * ve site oluşturmadaki çakışma kontrolü hep BURADAN beslenir (2026-09-15
 * denetimi: eskiden route'un içindeydi ve `config.port` sihirbazdan STRING
 * geldiği için site portları hiç etiketlenmiyordu).
 *
 * `ss -tlnp` root gerektirmez (süreç adı yalnızca aynı kullanıcının süreçleri
 * için görünür — normal). Docker konteyner portları `docker ps` ile eklenir
 * (panel kullanıcısı docker grubunda değilse sessizce atlanır).
 */
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export const SUGGEST_RANGE_START = 3000
export const SUGGEST_RANGE_END = 9000
const MAX_SUGGESTIONS = 20

export interface ListeningPort {
  address: string
  process: string | null
}

function parseSsOutput(stdout: string): Map<number, ListeningPort> {
  const result = new Map<number, ListeningPort>()
  const lines = stdout.split("\n").slice(1) // ilk satır başlık (State Recv-Q ...)

  for (const line of lines) {
    const cols = line.trim().split(/\s+/)
    if (cols.length < 4) continue
    const localAddr = cols[3] // örn. 0.0.0.0:3000, [::]:22, 127.0.0.1:5432
    const lastColon = localAddr.lastIndexOf(":")
    if (lastColon === -1) continue
    const port = Number.parseInt(localAddr.slice(lastColon + 1), 10)
    if (!Number.isInteger(port) || port < 1 || port > 65535) continue

    let process: string | null = null
    const procMatch = line.match(/users:\(\("([^"]+)"/)
    if (procMatch) process = procMatch[1]

    // Aynı port birden çok satırda (IPv4+IPv6) görünebilir — süreç bilgisi olanı tercih et.
    const existing = result.get(port)
    if (!existing || (!existing.process && process)) {
      result.set(port, { address: localAddr.slice(0, lastColon), process })
    }
  }
  return result
}

export async function getListeningPorts(): Promise<Map<number, ListeningPort>> {
  try {
    const { stdout } = await execFileAsync("ss", ["-tlnp"], { timeout: 5000 })
    return parseSsOutput(stdout)
  } catch {
    try {
      const { stdout } = await execFileAsync("ss", ["-tln"], { timeout: 5000 })
      return parseSsOutput(stdout)
    } catch {
      return new Map()
    }
  }
}

export interface DockerPort {
  port: number
  container: string
}

export async function getDockerPorts(): Promise<DockerPort[]> {
  try {
    const { stdout } = await execFileAsync("docker", ["ps", "--format", "{{.Names}}|{{.Ports}}"], {
      timeout: 5000,
    })
    const results: DockerPort[] = []
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue
      const [name, portsRaw] = line.split("|")
      if (!portsRaw) continue
      for (const mapping of portsRaw.split(",")) {
        const match = mapping.match(/:(\d+)->/)
        if (match) results.push({ port: Number.parseInt(match[1], 10), container: name })
      }
    }
    return results
  } catch {
    return [] // docker yok ya da panel docker grubunda değil — sessizce atla
  }
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]", "0.0.0.0", "host.docker.internal"])

/**
 * Bir site kaydının "kendi" portu: NODEJS/PYTHON/DOCKER için `config.port`
 * (sayı YA DA string — sihirbaz string gönderiyordu, eski kayıtlar öyle
 * kalmış olabilir), REVERSE_PROXY için yerel bir upstream'in portu
 * (`http://127.0.0.1:7000` -> 7000; uzak bir host'a proxy ise null —
 * o port bu sunucuda değil).
 */
export function sitePortOf(site: { type: string; config: unknown }): number | null {
  const cfg = site.config && typeof site.config === "object" ? (site.config as Record<string, unknown>) : {}
  if (site.type === "REVERSE_PROXY") {
    const upstream = typeof cfg.upstreamUrl === "string" ? cfg.upstreamUrl : ""
    if (!upstream) return null
    try {
      const url = new URL(upstream)
      if (!LOOPBACK_HOSTS.has(url.hostname)) return null
      const port = url.port ? Number.parseInt(url.port, 10) : url.protocol === "https:" ? 443 : 80
      return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null
    } catch {
      return null
    }
  }
  const raw = cfg.port
  const port = typeof raw === "number" ? raw : typeof raw === "string" ? Number.parseInt(raw, 10) : NaN
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null
}

export async function isPortListening(port: number): Promise<boolean> {
  const [listening, dockerPorts] = await Promise.all([getListeningPorts(), getDockerPorts()])
  return listening.has(port) || dockerPorts.some((d) => d.port === port)
}

export interface UsedPort {
  port: number
  protocol: "tcp"
  address: string
  process: string | null
  source: "site" | "docker" | "system"
  label: string | null
}

export interface PortsOverview {
  used: UsedPort[]
  suggestions: number[]
  suggestRange: { start: number; end: number }
}

export async function collectPortsOverview(
  sites: Array<{ domain: string; type: string; config: unknown }>
): Promise<PortsOverview> {
  const [listening, dockerPorts] = await Promise.all([getListeningPorts(), getDockerPorts()])

  const sitePortMap = new Map<number, string>()
  for (const site of sites) {
    const port = sitePortOf(site)
    if (port && !sitePortMap.has(port)) sitePortMap.set(port, site.domain)
  }
  const dockerPortMap = new Map<number, string>()
  for (const d of dockerPorts) if (!dockerPortMap.has(d.port)) dockerPortMap.set(d.port, d.container)

  const used: UsedPort[] = []
  for (const [port, info] of listening) {
    const siteLabel = sitePortMap.get(port)
    const dockerLabel = dockerPortMap.get(port)
    used.push({
      port,
      protocol: "tcp",
      address: info.address,
      process: info.process,
      source: siteLabel ? "site" : dockerLabel ? "docker" : "system",
      label: siteLabel ?? dockerLabel ?? null,
    })
  }
  // `ss` çıktısında görünmeyen docker portlarını da ekle (macOS'ta ss yok; ya da
  // panel süreçleri göremiyor olabilir).
  for (const [port, container] of dockerPortMap) {
    if (!listening.has(port)) {
      const siteLabel = sitePortMap.get(port)
      used.push({
        port,
        protocol: "tcp",
        address: "0.0.0.0",
        process: null,
        source: siteLabel ? "site" : "docker",
        label: siteLabel ?? container,
      })
    }
  }
  used.sort((a, b) => a.port - b.port)

  // Site kayıtlarında olup şu an dinlenmeyen portlar da "rezerve" sayılır —
  // öneri listesine girmesinler (uygulama o an kapalı olabilir).
  const reserved = new Set<number>([...used.map((u) => u.port), ...sitePortMap.keys()])
  const suggestions: number[] = []
  for (let p = SUGGEST_RANGE_START; p <= SUGGEST_RANGE_END && suggestions.length < MAX_SUGGESTIONS; p++) {
    if (!reserved.has(p)) suggestions.push(p)
  }

  return { used, suggestions, suggestRange: { start: SUGGEST_RANGE_START, end: SUGGEST_RANGE_END } }
}
