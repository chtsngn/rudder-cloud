/**
 * Edge-safe session constants and secret handling.
 *
 * This module intentionally avoids importing Prisma or any Node-only APIs so
 * it can be shared between `src/middleware.ts` (Edge runtime) and
 * `src/lib/auth.ts` (Node runtime route handlers).
 */

export const SESSION_COOKIE_NAME = "panel_session"
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7 // 7 gün

const DEV_ONLY_FALLBACK_SECRET = "panel-dev-only-insecure-secret-change-me"

/**
 * Returns the signing secret for session JWTs as a Uint8Array, ready for use
 * with `jose`. In production, `AUTH_SECRET` must be set — this throws a clear
 * error instead of silently using a default. In development, falls back to a
 * fixed (insecure) string so local dev doesn't require extra setup.
 */
export function getAuthSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET

  if (secret && secret.length > 0) {
    return new TextEncoder().encode(secret)
  }

  if (process.env.NODE_ENV !== "production") {
    return new TextEncoder().encode(DEV_ONLY_FALLBACK_SECRET)
  }

  throw new Error(
    "AUTH_SECRET ortam değişkeni tanımlı değil. `openssl rand -base64 32` ile " +
      "bir değer üretip .env dosyasına ekleyin."
  )
}
