/**
 * Giriş denemesi sınırı — süreç içi (tek panel süreci; yeniden başlatmada
 * sıfırlanır). Yalnız BAŞARISIZ denemeler sayılır; başarılı giriş o IP +
 * kullanıcı adı sayacını temizler. İki anahtar: IP + kullanıcı adı (tek hesaba
 * tahmin) ve yalnız IP (çok hesaba yayılan tahmin).
 *
 * IP, panelin nginx vhost'unun `$remote_addr` ile ezdiği `X-Real-IP`
 * başlığından okunur (istemcinin gönderdiği değer korunmaz; bkz. install.sh).
 */
const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES_PER_USER = 5
const MAX_FAILURES_PER_IP = 30
const MAX_ENTRIES = 10_000

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

function current(key: string, now: number): Bucket | null {
  const bucket = buckets.get(key)
  if (!bucket) return null
  if (bucket.resetAt <= now) {
    buckets.delete(key)
    return null
  }
  return bucket
}

function bump(key: string, now: number): void {
  const bucket = current(key, now)
  if (bucket) {
    bucket.count += 1
    return
  }
  if (buckets.size >= MAX_ENTRIES) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
    if (buckets.size >= MAX_ENTRIES) buckets.delete(buckets.keys().next().value as string)
  }
  buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
}

function keysFor(ip: string, username: string) {
  return { user: `u:${ip}:${username.toLowerCase()}`, ip: `ip:${ip}` }
}

export function clientIpFrom(headers: Headers): string {
  return headers.get("x-real-ip")?.trim() || "unknown"
}

/** Engelliyse kalan süre (saniye), değilse null. */
export function loginBlockedFor(ip: string, username: string, now = Date.now()): number | null {
  const keys = keysFor(ip, username)
  const user = current(keys.user, now)
  const byIp = current(keys.ip, now)
  if (user && user.count >= MAX_FAILURES_PER_USER) return Math.ceil((user.resetAt - now) / 1000)
  if (byIp && byIp.count >= MAX_FAILURES_PER_IP) return Math.ceil((byIp.resetAt - now) / 1000)
  return null
}

export function recordLoginFailure(ip: string, username: string, now = Date.now()): void {
  const keys = keysFor(ip, username)
  bump(keys.user, now)
  bump(keys.ip, now)
}

export function recordLoginSuccess(ip: string, username: string): void {
  buckets.delete(keysFor(ip, username).user)
}
