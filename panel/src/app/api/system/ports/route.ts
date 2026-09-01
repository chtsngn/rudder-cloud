import { execFile } from "node:child_process"
import { promisify } from "node:util"

import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { isSuperAdmin } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

const execFileAsync = promisify(execFile)

// systeminformation da bunu yapabilirdi ama `ss` doğrudan ve hafif; root
// gerektirmez (yalnızca dinleyen soketleri listeler, -p ile süreç adı
// yalnızca AYNI kullanıcının süreçleri için görünür — panelin kendi
// process'i dahil, başka kullanıcılarınki için boş kalır, bu normal ve
// güvenlik açısından beklenen bir davranış).
export const runtime = "nodejs"

const SUGGEST_RANGE_START = 3000
const SUGGEST_RANGE_END = 9000
const MAX_SUGGESTIONS = 20

interface UsedPort {
  port: number
  protocol: "tcp"
  address: string
  process: string | null
  source: "site" | "docker" | "system"
  label: string | null
}

function parseSsOutput(stdout: string): Map<number, { address: string; process: string | null }> {
  const result = new Map<number, { address: string; process: string | null }>()
  const lines = stdout.split("\n").slice(1) // ilk satır başlık (State Recv-Q ...)

  for (const line of lines) {
    const cols = line.trim().split(/\s+/)
    if (cols.length < 4) continue
    const localAddr = cols[3] // örn. 0.0.0.0:3000, [::]:22, 127.0.0.1:5432
    const lastColon = localAddr.lastIndexOf(":")
    if (lastColon === -1) continue
    const portStr = localAddr.slice(lastColon + 1)
    const port = Number.parseInt(portStr, 10)
    if (!Number.isInteger(port) || port < 1 || port > 65535) continue

    let process: string | null = null
    const procMatch = line.match(/users:\(\("([^"]+)"/)
    if (procMatch) process = procMatch[1]

    // Aynı port birden çok satırda (IPv4+IPv6) görünebilir — süreç bilgisi
    // olanı tercih et.
    const existing = result.get(port)
    if (!existing || (!existing.process && process)) {
      result.set(port, { address: localAddr.slice(0, lastColon), process })
    }
  }

  return result
}

async function getListeningPorts(): Promise<Map<number, { address: string; process: string | null }>> {
  try {
    const { stdout } = await execFileAsync("ss", ["-tlnp"], { timeout: 5000 })
    return parseSsOutput(stdout)
  } catch {
    // -p izin/eksik durumunda düşebilir, süreçsiz tekrar dene
    try {
      const { stdout } = await execFileAsync("ss", ["-tln"], { timeout: 5000 })
      return parseSsOutput(stdout)
    } catch {
      return new Map()
    }
  }
}

interface DockerPort {
  port: number
  container: string
}

async function getDockerPorts(): Promise<DockerPort[]> {
  try {
    const { stdout } = await execFileAsync(
      "docker",
      ["ps", "--format", "{{.Names}}|{{.Ports}}"],
      { timeout: 5000 }
    )
    const results: DockerPort[] = []
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue
      const [name, portsRaw] = line.split("|")
      if (!portsRaw) continue
      for (const mapping of portsRaw.split(",")) {
        const match = mapping.match(/:(\d+)->/)
        if (match) {
          results.push({ port: Number.parseInt(match[1], 10), container: name })
        }
      }
    }
    return results
  } catch {
    // docker kurulu değil, veya panel kullanıcısı docker grubunda değil — sessizce atla
    return []
  }
}

export async function GET() {
  // Middleware zaten oturumu doğruluyor (bkz. config.matcher →
  // "/api/system/:path*"); rol kontrolü burada — dinlenen portlar/süreç
  // adları sistem bilgisi sızdırır, SADECE SUPER_ADMIN'e açık (bkz.
  // docs/ARCHITECTURE.md → Aşama G).
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  const [listening, dockerPorts, sites] = await Promise.all([
    getListeningPorts(),
    getDockerPorts(),
    prisma.site.findMany(),
  ])

  const sitePortMap = new Map<number, string>()
  for (const site of sites) {
    const cfg = (site.config ?? {}) as Record<string, unknown>
    const port = typeof cfg.port === "number" ? cfg.port : null
    if (port) sitePortMap.set(port, site.domain)
  }

  const dockerPortMap = new Map<number, string>()
  for (const d of dockerPorts) dockerPortMap.set(d.port, d.container)

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
  // Yalnızca panelin bilip de `ss` çıktısında görünmeyen docker portlarını da ekle
  // (ör. container host ağını kullanıyorsa ss zaten yakalar; farklıysa burada tamamlanır)
  for (const [port, container] of dockerPortMap) {
    if (!listening.has(port)) {
      used.push({ port, protocol: "tcp", address: "0.0.0.0", process: null, source: "docker", label: container })
    }
  }

  used.sort((a, b) => a.port - b.port)

  const usedPortSet = new Set(used.map((u) => u.port))
  const suggestions: number[] = []
  for (let p = SUGGEST_RANGE_START; p <= SUGGEST_RANGE_END && suggestions.length < MAX_SUGGESTIONS; p++) {
    if (!usedPortSet.has(p)) suggestions.push(p)
  }

  return NextResponse.json({
    used,
    suggestions,
    suggestRange: { start: SUGGEST_RANGE_START, end: SUGGEST_RANGE_END },
  })
}
