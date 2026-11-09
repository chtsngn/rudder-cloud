/**
 * Derleme zaman aşımının saf kuralları (2026-11). Ayar:
 * `PanelSettings.buildTimeoutMinutes` (bkz. prisma/schema.prisma notu ve
 * src/lib/build-timeout-setting.ts). NULL/0 = SINIRSIZ (varsayılan): derleme
 * ya da deploy komutu yalnız kendi hatasıyla (çıkış kodu ≠ 0) başarısız sayılır.
 *
 * Bu dosya bilerek bağımlılıksız — `scripts/build-timeout.test.mjs` onu Node'un
 * yerleşik TS desteğiyle doğrudan içe aktarır (`@/` takma adı burada çalışmaz).
 */
export const BUILD_TIMEOUT_MIN_MINUTES = 5
export const BUILD_TIMEOUT_MAX_MINUTES = 240

export type BuildTimeoutParseResult = { ok: true; minutes: number | null } | { ok: false; error: string }

/**
 * API girdisi doğrulaması: null/undefined/0/"" → null (sınırsız); 5–240 arası
 * tam sayı dakika → kendisi; diğer her şey hata.
 */
export function parseBuildTimeoutMinutes(raw: unknown): BuildTimeoutParseResult {
  if (raw === null || raw === undefined || raw === 0 || raw === "") return { ok: true, minutes: null }
  if (
    typeof raw === "number" &&
    Number.isInteger(raw) &&
    raw >= BUILD_TIMEOUT_MIN_MINUTES &&
    raw <= BUILD_TIMEOUT_MAX_MINUTES
  ) {
    return { ok: true, minutes: raw }
  }
  return {
    ok: false,
    error: `Geçersiz süre. ${BUILD_TIMEOUT_MIN_MINUTES} ile ${BUILD_TIMEOUT_MAX_MINUTES} dakika arasında bir tam sayı olmalı, sınırsız için 0/null gönderin.`,
  }
}

/**
 * Kayıtlı dakika → `execFile`'ın `timeout` değeri (ms). 0 = sınırsız
 * (`execFile` için de "zaman aşımı yok" demektir). Elle bozulmuş bir değer
 * (negatif, sayı olmayan) de güvenli tarafta sınırsız sayılır.
 */
export function buildTimeoutMs(minutes: number | null | undefined): number {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return 0
  return Math.round(minutes) * 60_000
}

/** "45 sn", "7 dk 12 sn", "15 dk" — deploy çıktısındaki süre satırları için. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds} sn`
  return seconds === 0 ? `${minutes} dk` : `${minutes} dk ${seconds} sn`
}

/** Zaman aşımı satırı, ör. "derleme 30 dakikayı aştı, sonlandırılıyor." */
export function timeoutExceededMessage(label: string, timeoutMs: number): string {
  return `${label} ${Math.round(timeoutMs / 60_000)} dakikayı aştı, sonlandırılıyor.`
}
