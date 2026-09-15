/**
 * GitHub App push webhook'u (2026-09-15 denetimi) — 15 saniyelik polling
 * yerine push anında deploy. GitHub, App'in manifestindeki `hook_attributes.url`
 * adresine (`/api/hooks/github`) `X-Hub-Signature-256` imzalı JSON gönderir;
 * imza App'in webhook secret'ıyla (manifest dönüşümünde GitHub'ın verdiği ya
 * da Ayarlar'dan elle girilen) HMAC-SHA256 olarak doğrulanır.
 */
import { createHmac, timingSafeEqual } from "node:crypto"

export function verifyGithubSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!secret || !signatureHeader || !signatureHeader.startsWith("sha256=")) return false
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex")
  const given = signatureHeader.slice("sha256=".length)
  if (given.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"))
}

export interface PushPayload {
  ref?: string
  after?: string
  deleted?: boolean
  repository?: { full_name?: string }
  installation?: { id?: number | string }
}

export function parsePushPayload(rawBody: string): PushPayload | null {
  try {
    const parsed = JSON.parse(rawBody) as PushPayload
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
}

/** Bu push, verilen siteyi ilgilendiriyor mu (aynı depo + aynı branch)? */
export function pushMatchesSite(
  payload: PushPayload,
  site: { githubRepoFullName: string | null; gitBranch: string }
): boolean {
  if (!site.githubRepoFullName || !payload.repository?.full_name || !payload.ref) return false
  if (payload.deleted) return false
  if (payload.repository.full_name.toLowerCase() !== site.githubRepoFullName.toLowerCase()) return false
  return payload.ref === `refs/heads/${site.gitBranch}`
}
