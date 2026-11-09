/**
 * Site arka plan işleri (SiteJob) için istemci tarafı sözleşme tipleri ve saf
 * yardımcılar. Bağımlılıksız; React veya `@/lib` içe aktarmaz (sunucu tarafı
 * tipleri `src/lib` altında ayrıca yaşar — burada bilinçli olarak kopyalanır).
 */

export type SiteJobKind = "deploy" | "compose" | "backup" | "restart"
export type SiteJobTrigger = "manual" | "hook" | "webhook" | "auto-pull" | "schedule"
export type SiteJobStatus = "queued" | "running" | "succeeded" | "failed" | "interrupted"

export interface SiteJobView {
  id: string
  siteId: string
  kind: SiteJobKind
  /** compose: rebuild|pull|up · deploy: deploy|pull|connect · restart: restart|start */
  action: string | null
  trigger: SiteJobTrigger
  status: SiteJobStatus
  phase: string | null
  /** Son ≤64 KB çıktı. */
  output: string
  error: string | null
  result: Record<string, unknown> | null
  actor: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export interface SiteJobsListResponse {
  active: SiteJobView | null
  recent: SiteJobView[]
  serverNow: string
}

export interface SiteJobResponse {
  job: SiteJobView
  serverNow: string
}

export type Lang = "tr" | "en"

export function isTerminalStatus(status: SiteJobStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "interrupted"
}

/** Sunucu saati − istemci saati (ms). `serverNow` geçersizse 0. */
export function computeServerOffset(serverNow: string | null | undefined, clientNowMs: number): number {
  if (!serverNow) return 0
  const server = Date.parse(serverNow)
  return Number.isFinite(server) ? server - clientNowMs : 0
}

/**
 * İşin geçen süresi (ms): `startedAt ?? createdAt`'ten başlar; bitmişse
 * `finishedAt`'e, sürüyorsa sunucu saatine göre şimdiye kadar.
 */
export function jobElapsedMs(
  job: Pick<SiteJobView, "createdAt" | "startedAt" | "finishedAt">,
  clientNowMs: number,
  serverOffsetMs: number
): number {
  const start = Date.parse(job.startedAt ?? job.createdAt)
  if (!Number.isFinite(start)) return 0
  const end = job.finishedAt ? Date.parse(job.finishedAt) : clientNowMs + serverOffsetMs
  if (!Number.isFinite(end)) return 0
  return Math.max(0, end - start)
}

/** 45 sn · 2 dk 14 sn · 1 sa 3 dk (en: 45s · 2m 14s · 1h 3m). */
export function formatDuration(ms: number, lang: Lang = "tr"): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const u = lang === "en" ? { h: "h", m: "m", s: "s", sep: "" } : { h: "sa", m: "dk", s: "sn", sep: " " }
  if (h > 0) return `${h}${u.sep}${u.h} ${m}${u.sep}${u.m}`
  if (m > 0) return `${m}${u.sep}${u.m} ${s}${u.sep}${u.s}`
  return `${s}${u.sep}${u.s}`
}

/** Çalışan / sıradaki işin düğme etiketi, ör. "Deploy sürüyor…". */
export function jobRunningLabel(job: Pick<SiteJobView, "kind" | "action" | "status">, lang: Lang = "tr"): string {
  const en = lang === "en"
  if (job.status === "queued") return en ? "Queued…" : "Sırada…"
  switch (job.kind) {
    case "deploy":
      if (job.action === "pull") return en ? "Pulling…" : "Çekiliyor…"
      if (job.action === "connect") return en ? "Connecting & deploying…" : "Bağlanıp deploy ediliyor…"
      return en ? "Deploy running…" : "Deploy sürüyor…"
    case "compose":
      if (job.action === "rebuild") return en ? "Rebuilding…" : "Yeniden derleniyor…"
      if (job.action === "pull") return en ? "Pulling images…" : "Çekiliyor…"
      if (job.action === "up") return en ? "Starting…" : "Başlatılıyor…"
      return en ? "Running…" : "Sürüyor…"
    case "backup":
      return en ? "Backing up…" : "Yedek alınıyor…"
    case "restart":
      if (job.action === "start") return en ? "Starting…" : "Başlatılıyor…"
      return en ? "Restarting…" : "Yeniden başlatılıyor…"
    default:
      return en ? "Running…" : "Sürüyor…"
  }
}

/** İşin kısa adı (başlık için), ör. "Deploy", "docker compose up --build". */
export function jobTitle(job: Pick<SiteJobView, "kind" | "action">, lang: Lang = "tr"): string {
  const en = lang === "en"
  switch (job.kind) {
    case "deploy":
      if (job.action === "pull") return "Git pull"
      if (job.action === "connect") return en ? "Connect & deploy" : "Bağla ve deploy"
      return "Deploy"
    case "compose":
      if (job.action === "rebuild") return "docker compose up -d --build"
      return `docker compose ${job.action ?? ""}`.trim()
    case "backup":
      return en ? "Backup" : "Yedek"
    case "restart":
      return job.action === "start" ? (en ? "Start" : "Başlatma") : en ? "Restart" : "Yeniden başlatma"
    default:
      return job.kind
  }
}

export function triggerLabel(trigger: SiteJobTrigger, lang: Lang = "tr"): string | null {
  const en = lang === "en"
  switch (trigger) {
    case "hook":
      return en ? "started by deploy hook" : "deploy hook ile başladı"
    case "webhook":
      return en ? "started by GitHub webhook" : "GitHub webhook ile başladı"
    case "auto-pull":
      return en ? "started by auto pull" : "otomatik pull ile başladı"
    case "schedule":
      return en ? "scheduled" : "zamanlanmış"
    default:
      return null
  }
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null
}

export type JobOutcomeTone = "success" | "warning" | "error"

/**
 * Bitmiş işin sonuç metni. `result` biçimi sözleşmede serbest olduğundan
 * sunucunun işi bitirirken yazdığı alanlar okunur (bkz. src/lib/site-jobs.ts):
 * deploy: { pulled, changed, commit, deployed, restarted, restartError, rolledBack };
 * backup: { fileName, sizeBytes, uploadedToS3, s3Error }.
 * `restartError` doluysa iş zaten `failed` olur (hata metni `error`'da).
 */
export function jobOutcome(
  job: Pick<SiteJobView, "kind" | "action" | "status" | "error" | "result">,
  lang: Lang = "tr"
): { tone: JobOutcomeTone; text: string } {
  const en = lang === "en"
  const r = job.result ?? {}

  if (job.status === "interrupted") {
    return {
      tone: "warning",
      text: en
        ? "Interrupted: the panel restarted, check the site status."
        : "Yarıda kaldı: panel yeniden başladı, site durumunu kontrol edin.",
    }
  }

  if (job.status === "failed") {
    const base = str(job.error) ?? (en ? "The operation failed." : "İşlem başarısız oldu.")
    const rollbackNote =
      r.rolledBack === true ? (en ? " Previous images were started again." : " Önceki imajlar yeniden başlatıldı.") : ""
    return { tone: "error", text: `${base}${rollbackNote}` }
  }

  // succeeded (ya da beklenmedik durum)
  switch (job.kind) {
    case "deploy": {
      // Yalnız `deployed`a bakılır: zorlanan deploy'da changed=false ama deployed=true olabilir.
      if (r.deployed === false) {
        return { tone: "success", text: en ? "No new commit — already up to date." : "Yeni commit yok — zaten güncel." }
      }
      const commit = str(r.commit)
      const short = commit ? ` (${commit.slice(0, 7)})` : ""
      if (job.action === "connect") {
        return { tone: "success", text: en ? "Repository connected and deployed." : "Depo bağlandı ve deploy edildi." }
      }
      if (job.action === "pull" && r.changed === true) {
        return { tone: "success", text: en ? `New commit pulled and deployed${short}.` : `Yeni commit çekildi ve deploy edildi${short}.` }
      }
      return { tone: "success", text: en ? `Deploy completed${short}.` : `Deploy tamamlandı${short}.` }
    }
    case "backup": {
      const s3Error = str(r.s3Error)
      const fileName = str(r.fileName) ?? ""
      if (s3Error) {
        return {
          tone: "warning",
          text: en
            ? `Backup completed but cloud storage upload failed: ${s3Error}`
            : `Yedek alındı ama bulut depolamaya yükleme başarısız: ${s3Error}`,
        }
      }
      const cloud = r.uploadedToS3 === true ? (en ? " (Uploaded to Cloud Storage)" : " (Bulut depolamaya yüklendi)") : ""
      return { tone: "success", text: en ? `Backup completed: ${fileName}${cloud}` : `Yedek alındı: ${fileName}${cloud}` }
    }
    case "compose":
      return { tone: "success", text: `${jobTitle(job, lang)} ${en ? "completed." : "tamamlandı."}` }
    case "restart":
      return {
        tone: "success",
        text: job.action === "start" ? (en ? "Started." : "Başlatıldı.") : en ? "Restarted." : "Yeniden başlatıldı.",
      }
    default:
      return { tone: "success", text: en ? "Completed." : "Tamamlandı." }
  }
}
