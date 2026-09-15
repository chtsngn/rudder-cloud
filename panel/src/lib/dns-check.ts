/**
 * SSL (certbot) ÖNCESİ DNS ön kontrolü (2026-09-15 denetimi). certbot'un
 * HTTP-01 doğrulaması, alan adının bu sunucuya (ya da Cloudflare proxy'si
 * arkasından bu sunucuya) çözümlenmesini gerektirir; eskiden bu kontrol yoktu
 * ve kullanıcı certbot'un ham "DNS problem: NXDOMAIN / unauthorized" hatasını
 * dakikalar sonra görüyordu. Burada saniyeler içinde net bir cevap verilir:
 * "A kaydı X'e işaret ediyor, sunucunun IP'si Y".
 *
 * Cloudflare farkındalığı: alan adı turuncu bulutla proxy'lenmişse A kaydı
 * Cloudflare IP'lerine çözümlenir — bu HATA DEĞİL; certbot HTTP-01 doğrulaması
 * Cloudflare proxy'si üzerinden de çalışır (SSL modu "Full" olmalı, panel
 * bunu doğrulayamaz). Bu durumda `cloudflare: true` ile "muhtemelen tamam"
 * denir, engellenmez.
 */
import { promises as dns } from "node:dns"
import os from "node:os"

// https://www.cloudflare.com/ips-v4 ve ips-v6 (2026-09-15 kopyası) — nginx
// real_ip için canlı liste provision-site.sh `refresh-cloudflare-ips` ile
// indirilir; burada yalnızca "bu bir Cloudflare IP'si mi" sorusu için.
export const CLOUDFLARE_IPV4 = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
]
export const CLOUDFLARE_IPV6 = [
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
]

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".")
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    const v = Number(p)
    if (!Number.isInteger(v) || v < 0 || v > 255) return null
    n = n * 256 + v
  }
  return n
}

function ipv6ToBigInt(ip: string): bigint | null {
  const clean = ip.replace(/^\[|\]$/g, "").split("%")[0]
  const halves = clean.split("::")
  if (halves.length > 2) return null
  const expand = (part: string) => (part ? part.split(":") : [])
  const head = expand(halves[0])
  const tail = halves.length === 2 ? expand(halves[1]) : []
  const missing = 8 - head.length - tail.length
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null
  const groups = [...head, ...Array(missing).fill("0"), ...tail]
  let n = BigInt(0)
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null
    n = (n << BigInt(16)) + BigInt(Number.parseInt(g, 16))
  }
  return n
}

function inCidr(ip: string, cidr: string): boolean {
  const [range, bitsRaw] = cidr.split("/")
  const bits = Number(bitsRaw)
  if (ip.includes(":")) {
    const a = ipv6ToBigInt(ip)
    const b = ipv6ToBigInt(range)
    if (a === null || b === null) return false
    const shift = BigInt(128) - BigInt(bits)
    return a >> shift === b >> shift
  }
  const a = ipv4ToInt(ip)
  const b = ipv4ToInt(range)
  if (a === null || b === null) return false
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
  return ((a & mask) >>> 0) === ((b & mask) >>> 0)
}

export function isCloudflareIp(ip: string): boolean {
  const ranges = ip.includes(":") ? CLOUDFLARE_IPV6 : CLOUDFLARE_IPV4
  return ranges.some((cidr) => inCidr(ip, cidr))
}

let publicIpCache: { at: number; ips: string[] } | null = null
const PUBLIC_IP_CACHE_MS = 10 * 60 * 1000

async function fetchPublicIp(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000), cache: "no-store" })
    if (!res.ok) return null
    const text = (await res.text()).trim()
    return /^[0-9a-fA-F:.]+$/.test(text) ? text : null
  } catch {
    return null
  }
}

/** Sunucunun kendi adresleri: yerel arayüzlerdeki (internal olmayan) IP'ler +
 * dışarıdan görünen genel IP (NAT arkasındaki VPS'lerde yerel IP özel olabilir). */
export async function getServerAddresses(): Promise<string[]> {
  const local = new Set<string>()
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.internal) continue
      const address = iface.address.split("%")[0]
      // Link-local (fe80::/10, 169.254/16) ve IPv6 ULA (fc00::/7) adresleri bir
      // DNS kaydına asla yazılmaz — listeyi gürültüden arındır.
      if (/^fe[89ab][0-9a-f]:/i.test(address) || /^f[cd][0-9a-f]{2}:/i.test(address) || address.startsWith("169.254.")) continue
      local.add(address)
    }
  }
  const now = Date.now()
  if (!publicIpCache || now - publicIpCache.at > PUBLIC_IP_CACHE_MS) {
    const [v4, v6] = await Promise.all([
      fetchPublicIp("https://api.ipify.org"),
      fetchPublicIp("https://api64.ipify.org"),
    ])
    publicIpCache = { at: now, ips: [v4, v6].filter((v): v is string => !!v) }
  }
  for (const ip of publicIpCache.ips) local.add(ip)
  return [...local]
}

export async function resolveDomain(domain: string): Promise<string[]> {
  const [a, aaaa] = await Promise.all([
    dns.resolve4(domain).catch(() => [] as string[]),
    dns.resolve6(domain).catch(() => [] as string[]),
  ])
  return [...a, ...aaaa]
}

export interface DnsCheckResult {
  domain: string
  resolved: string[]
  server: string[]
  /** Çözümlenen adreslerden en az biri bu sunucuya ait. */
  matches: boolean
  /** Çözümlenen adresler Cloudflare'a ait (turuncu bulut) — sunucu IP'si görünmez, bu normal. */
  cloudflare: boolean
  /** SSL isteği için "devam edilebilir" kararı (matches || cloudflare). */
  ok: boolean
  message: string
  www?: DnsCheckResult
}

async function checkOne(domain: string): Promise<Omit<DnsCheckResult, "www">> {
  const [resolved, server] = await Promise.all([resolveDomain(domain), getServerAddresses()])
  const serverSet = new Set(server)
  const matches = resolved.some((ip) => serverSet.has(ip))
  const cloudflare = resolved.length > 0 && resolved.every((ip) => isCloudflareIp(ip))
  const ok = matches || cloudflare

  let message: string
  if (resolved.length === 0) {
    message = `${domain} için DNS kaydı bulunamadı (A/AAAA yok ya da henüz yayılmadı).`
  } else if (matches) {
    message = `${domain} bu sunucuya işaret ediyor (${resolved.join(", ")}).`
  } else if (cloudflare) {
    message = `${domain} Cloudflare proxy'si arkasında (${resolved.join(", ")}) — Cloudflare SSL modunun "Full" olduğundan emin olun.`
  } else {
    message = `${domain} şu an ${resolved.join(", ")} adresine işaret ediyor; bu sunucunun adresi ${server.join(", ") || "belirlenemedi"}. A kaydını düzeltip DNS yayılmasını bekleyin.`
  }
  return { domain, resolved, server, matches, cloudflare, ok, message }
}

export async function checkDomainDns(domain: string, includeWww = false): Promise<DnsCheckResult> {
  const base = await checkOne(domain)
  if (!includeWww) return base
  const www = await checkOne(`www.${domain}`)
  return {
    ...base,
    www,
    ok: base.ok && www.ok,
    message: www.ok ? base.message : `${base.message} ${www.message}`,
  }
}
