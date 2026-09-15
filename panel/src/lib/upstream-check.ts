/**
 * "Proxy hedefinde gerçekten bir şey dinliyor mu?" — REVERSE_PROXY/NODEJS/
 * PYTHON/DOCKER sitelerinde nginx ayakta olsa bile uygulama kapalıysa
 * ziyaretçi 502 görür; DB'deki `status` bunu bilmez. Basit bir TCP bağlantı
 * denemesi (HTTP isteği DEĞİL — uygulama ne döndürürse döndürsün "dinliyor"
 * bilgisi yeterli, ayrıca yan etkisi yok).
 */
import net from "node:net"

export interface UpstreamCheck {
  target: string
  host: string
  port: number
  reachable: boolean
  latencyMs: number | null
  error: string | null
}

export function upstreamTargetOf(site: { type: string; config: unknown }): { host: string; port: number; target: string } | null {
  const cfg = site.config && typeof site.config === "object" ? (site.config as Record<string, unknown>) : {}
  if (site.type === "REVERSE_PROXY") {
    const upstream = typeof cfg.upstreamUrl === "string" ? cfg.upstreamUrl : ""
    if (!upstream) return null
    try {
      const url = new URL(upstream)
      const port = url.port ? Number.parseInt(url.port, 10) : url.protocol === "https:" ? 443 : 80
      return { host: url.hostname.replace(/^\[|\]$/g, ""), port, target: upstream }
    } catch {
      return null
    }
  }
  if (site.type === "NODEJS" || site.type === "PYTHON" || site.type === "DOCKER") {
    const raw = cfg.port
    const port = typeof raw === "number" ? raw : typeof raw === "string" ? Number.parseInt(raw, 10) : NaN
    if (!Number.isInteger(port)) return null
    return { host: "127.0.0.1", port, target: `http://127.0.0.1:${port}` }
  }
  return null
}

export function checkTcpReachable(host: string, port: number, timeoutMs = 1500): Promise<{ reachable: boolean; latencyMs: number | null; error: string | null }> {
  return new Promise((resolve) => {
    const started = Date.now()
    const socket = net.connect({ host, port })
    let settled = false
    const finish = (reachable: boolean, error: string | null) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve({ reachable, latencyMs: reachable ? Date.now() - started : null, error })
    }
    socket.setTimeout(timeoutMs)
    socket.once("connect", () => finish(true, null))
    socket.once("timeout", () => finish(false, "zaman aşımı"))
    socket.once("error", (err) => finish(false, (err as NodeJS.ErrnoException).code ?? err.message))
  })
}

export async function checkSiteUpstream(site: { type: string; config: unknown }): Promise<UpstreamCheck | null> {
  const target = upstreamTargetOf(site)
  if (!target) return null
  const result = await checkTcpReachable(target.host, target.port)
  return { target: target.target, host: target.host, port: target.port, ...result }
}
