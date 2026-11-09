// Derleme zaman aşımı kurallarının testi (bkz. src/lib/build-timeout.ts).
// Çalıştırma: `npm test` (Node >= 22.18 — .ts dosyasını doğrudan içe aktarır).
import assert from "node:assert/strict"
import test from "node:test"

import {
  BUILD_TIMEOUT_MAX_MINUTES,
  BUILD_TIMEOUT_MIN_MINUTES,
  buildTimeoutMs,
  formatDuration,
  parseBuildTimeoutMinutes,
  timeoutExceededMessage,
} from "../src/lib/build-timeout.ts"

test("boş/0 değer sınırsız demektir", () => {
  for (const raw of [null, undefined, 0, ""]) {
    assert.deepEqual(parseBuildTimeoutMinutes(raw), { ok: true, minutes: null })
  }
})

test("5–240 arası tam sayı dakika kabul edilir", () => {
  assert.equal(BUILD_TIMEOUT_MIN_MINUTES, 5)
  assert.equal(BUILD_TIMEOUT_MAX_MINUTES, 240)
  for (const raw of [5, 30, 240]) {
    assert.deepEqual(parseBuildTimeoutMinutes(raw), { ok: true, minutes: raw })
  }
})

test("aralık dışı, kesirli ve sayı olmayan değerler reddedilir", () => {
  for (const raw of [4, 241, -5, 7.5, "30", Number.NaN, Infinity, true, {}]) {
    const result = parseBuildTimeoutMinutes(raw)
    assert.equal(result.ok, false, `kabul edilmemeli: ${String(raw)}`)
  }
})

test("dakika → ms; sınırsız ve bozuk değerler 0 (execFile için zaman aşımı yok)", () => {
  assert.equal(buildTimeoutMs(15), 15 * 60_000)
  assert.equal(buildTimeoutMs(240), 240 * 60_000)
  for (const raw of [null, undefined, 0, -3, Number.NaN]) {
    assert.equal(buildTimeoutMs(raw), 0)
  }
})

test("süre biçimi", () => {
  assert.equal(formatDuration(0), "0 sn")
  assert.equal(formatDuration(45_400), "45 sn")
  assert.equal(formatDuration(7 * 60_000 + 12_000), "7 dk 12 sn")
  assert.equal(formatDuration(15 * 60_000), "15 dk")
  assert.equal(formatDuration(59_600), "1 dk")
})

test("zaman aşımı satırı dakikayı yazar", () => {
  assert.equal(timeoutExceededMessage("deploy komutu", 30 * 60_000), "deploy komutu 30 dakikayı aştı, sonlandırılıyor.")
})
