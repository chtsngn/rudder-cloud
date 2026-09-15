/**
 * Site başına "deploy hook" (2026-09-15 denetimi — GitHub Actions SSH
 * anahtarının yerine). CI/CD (GitHub Actions, GitLab CI, elle curl...) bu
 * gizli URL'e tek bir `POST` atar; panel siteyi kendi deploy hattıyla
 * (pull → deployCommand → yeniden başlatma, bkz. src/lib/deploy.ts) günceller.
 * SSH gerekmez — `panel` kullanıcısı zaten nologin olduğu için eski özellik
 * hiç çalışamıyordu.
 *
 * Token veritabanında DÜZ METİN saklanmaz — yalnızca SHA-256 özeti. URL
 * üretim anında BİR KEZ gösterilir; kaybolursa yeniden üretilir (eski token
 * geçersiz olur).
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

const TOKEN_RE = /^[a-f0-9]{48}$/

export function generateDeployHookToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("hex")
  return { token, hash: hashDeployHookToken(token) }
}

export function hashDeployHookToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function isValidDeployHookTokenFormat(token: string): boolean {
  return TOKEN_RE.test(token)
}

export function deployHookTokenMatches(token: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !isValidDeployHookTokenFormat(token)) return false
  const a = Buffer.from(hashDeployHookToken(token), "hex")
  const b = Buffer.from(storedHash, "hex")
  return a.length === b.length && timingSafeEqual(a, b)
}

export function deployHookUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/api/hooks/deploy/${token}`
}
