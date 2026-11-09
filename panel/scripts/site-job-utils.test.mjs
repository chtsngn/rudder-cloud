// Site arka plan işi arayüz yardımcılarının testi (bkz. src/hooks/site-job-utils.ts).
// Çalıştırma: `npm test` (Node >= 22.18 — .ts dosyasını doğrudan içe aktarır).
import assert from "node:assert/strict"
import test from "node:test"

import {
  computeServerOffset,
  formatDuration,
  isTerminalStatus,
  jobElapsedMs,
  jobOutcome,
  jobRunningLabel,
} from "../src/hooks/site-job-utils.ts"

const deployJob = (over) => ({ kind: "deploy", action: "deploy", status: "succeeded", error: null, result: null, ...over })

// Sunucunun deploy işini bitirirken yazdığı sonuç biçimi (src/lib/site-jobs.ts).
const deployResult = (over) => ({
  pulled: true,
  changed: true,
  commit: "abcdef1234567",
  deployed: true,
  restarted: true,
  restartError: null,
  rolledBack: false,
  ...over,
})

test("jobOutcome: pull, değişiklik yok (deployed:false) → yeni commit yok", () => {
  const o = jobOutcome(deployJob({ action: "pull", result: deployResult({ changed: false, deployed: false }) }))
  assert.equal(o.tone, "success")
  assert.match(o.text, /Yeni commit yok/)
})

test("jobOutcome: changed:false ama deployed:true (zorlanan deploy) → deploy edildi", () => {
  const o = jobOutcome(deployJob({ action: "pull", result: deployResult({ changed: false, deployed: true }) }))
  assert.equal(o.tone, "success")
  assert.doesNotMatch(o.text, /Yeni commit yok/)
  assert.match(o.text, /Deploy tamamlandı \(abcdef1\)/)
})

test("jobOutcome: pull, yeni commit → çekildi ve deploy edildi", () => {
  const o = jobOutcome(deployJob({ action: "pull", result: deployResult() }))
  assert.match(o.text, /Yeni commit çekildi ve deploy edildi \(abcdef1\)/)
})

test("jobOutcome: connect → depo bağlandı", () => {
  const o = jobOutcome(deployJob({ action: "connect", result: deployResult() }))
  assert.match(o.text, /Depo bağlandı/)
})

test("jobOutcome: failed + rolledBack:true → hata + geri dönüş notu", () => {
  const o = jobOutcome(
    deployJob({ status: "failed", error: "Sağlık kontrolü başarısız", result: deployResult({ restartError: "x", rolledBack: true }) })
  )
  assert.equal(o.tone, "error")
  assert.match(o.text, /^Sağlık kontrolü başarısız/)
  assert.match(o.text, /Önceki imajlar yeniden başlatıldı/)
})

test("jobOutcome: failed, sonuçsuz → error metni, geri dönüş notu yok", () => {
  const o = jobOutcome(deployJob({ status: "failed", error: "Klonlama başarısız", result: null }))
  assert.equal(o.tone, "error")
  assert.equal(o.text, "Klonlama başarısız")
})

test("jobOutcome: failed, error yok → genel metin", () => {
  const o = jobOutcome(deployJob({ status: "failed", error: null }), "en")
  assert.equal(o.text, "The operation failed.")
})

test("jobOutcome: interrupted → yarıda kaldı uyarısı", () => {
  const o = jobOutcome(deployJob({ status: "interrupted" }))
  assert.equal(o.tone, "warning")
  assert.equal(o.text, "Yarıda kaldı: panel yeniden başladı, site durumunu kontrol edin.")
})

test("jobOutcome: yedek s3Error → uyarı; başarılı → dosya adı + bulut notu", () => {
  const warn = jobOutcome({
    kind: "backup",
    action: null,
    status: "succeeded",
    error: null,
    result: { fileName: "db-2026.sql.gz", sizeBytes: 1024, uploadedToS3: false, s3Error: "AccessDenied" },
  })
  assert.equal(warn.tone, "warning")
  assert.match(warn.text, /bulut depolamaya yükleme başarısız: AccessDenied/)

  const ok = jobOutcome({
    kind: "backup",
    action: null,
    status: "succeeded",
    error: null,
    result: { fileName: "db-2026.sql.gz", sizeBytes: 1024, uploadedToS3: true, s3Error: null },
  })
  assert.equal(ok.tone, "success")
  assert.equal(ok.text, "Yedek alındı: db-2026.sql.gz (Bulut depolamaya yüklendi)")
})

test("formatDuration", () => {
  assert.equal(formatDuration(0), "0 sn")
  assert.equal(formatDuration(999), "0 sn")
  assert.equal(formatDuration(45_000), "45 sn")
  assert.equal(formatDuration(134_000), "2 dk 14 sn")
  assert.equal(formatDuration(3_780_000), "1 sa 3 dk")
  assert.equal(formatDuration(134_000, "en"), "2m 14s")
  assert.equal(formatDuration(-5), "0 sn")
})

test("computeServerOffset", () => {
  const client = Date.parse("2026-11-09T10:00:00Z")
  assert.equal(computeServerOffset("2026-11-09T10:00:05Z", client), 5000)
  assert.equal(computeServerOffset("2026-11-09T09:59:58Z", client), -2000)
  assert.equal(computeServerOffset(null, client), 0)
  assert.equal(computeServerOffset("geçersiz", client), 0)
})

test("jobElapsedMs: süren iş sunucu saatine göre, startedAt öncelikli", () => {
  const client = Date.parse("2026-11-09T10:00:00Z")
  const offset = computeServerOffset("2026-11-09T10:00:05Z", client)
  const job = { createdAt: "2026-11-09T09:57:00Z", startedAt: "2026-11-09T09:57:51Z", finishedAt: null }
  assert.equal(jobElapsedMs(job, client, offset), 134_000)
})

test("jobElapsedMs: startedAt yoksa createdAt; bitmiş işte finishedAt", () => {
  const client = Date.parse("2026-11-09T10:00:00Z")
  assert.equal(jobElapsedMs({ createdAt: "2026-11-09T09:59:30Z", startedAt: null, finishedAt: null }, client, 0), 30_000)
  assert.equal(
    jobElapsedMs({ createdAt: "2026-11-09T09:00:00Z", startedAt: "2026-11-09T09:00:10Z", finishedAt: "2026-11-09T09:01:00Z" }, client, 0),
    50_000
  )
  // İstemci saati ilerideyse bile negatif olmaz.
  assert.equal(jobElapsedMs({ createdAt: "2026-11-09T10:00:00Z", startedAt: null, finishedAt: null }, client, -60_000), 0)
})

test("jobRunningLabel ve isTerminalStatus", () => {
  assert.equal(jobRunningLabel({ kind: "deploy", action: "deploy", status: "running" }), "Deploy sürüyor…")
  assert.equal(jobRunningLabel({ kind: "compose", action: "rebuild", status: "running" }), "Yeniden derleniyor…")
  assert.equal(jobRunningLabel({ kind: "backup", action: null, status: "queued" }), "Sırada…")
  assert.equal(isTerminalStatus("running"), false)
  assert.equal(isTerminalStatus("interrupted"), true)
})
