/**
 * Site işleri (2026-11) — Prisma deposu, süreç geneli kayıt ve iş türleri.
 * Saf kurallar (durum makinesi, çıktı kuyruğu, yazma sıklığı, çakışma tablosu)
 * src/lib/site-job-core.ts'te; bkz. docs/ARCHITECTURE.md → "Site işleri".
 *
 * Kayıt `globalThis[Symbol.for("rudder.siteJobs")]`'te durur: Next.js bu
 * modülü instrumentation/zamanlayıcı parçasına ve route parçalarına ayrı
 * kopyalar olarak derleyebiliyor; modül değişkeni olsaydı site kilidi ve
 * kuyruk kopyalar arasında paylaşılmazdı (eski `deploy.ts` `inFlight` sorunu).
 *
 * Tek panel süreci varsayılır. Süreç ölürse yarım kalan işler açılışta
 * `markInterruptedJobs()` ile `interrupted` olur (otomatik geri dönüş YOK);
 * okumada da veritabanında running görünüp bellekte olmayan iş interrupted
 * gösterilir.
 */
import { Prisma } from "@prisma/client"

import { logAudit } from "@/lib/audit"
import { BackupError } from "@/lib/backup"
import { deploySite, toDeployable, type DeployTrigger } from "@/lib/deploy"
import { withBuildSlot } from "@/lib/deploy-safety"
import { prisma } from "@/lib/prisma"
import {
  dockerComposeControl,
  getProcessStatus,
  restartSite,
  RestartError,
  type DockerComposeControlAction,
} from "@/lib/restart"
import { runBackupForSite } from "@/lib/run-backup"
import {
  createJobRegistry,
  reconcileRecord,
  toJobView,
  type JobRegistry,
  type SiteJobKind,
  type SiteJobPatch,
  type SiteJobRecord,
  type SiteJobStatus,
  type SiteJobStore,
  type SiteJobTrigger,
  type SiteJobView,
  type StartJobInput,
  type StartJobOutcome,
} from "@/lib/site-job-core"

export type { SiteJobView, StartJobOutcome } from "@/lib/site-job-core"

/** Site başına saklanan iş sayısı. */
export const SITE_JOBS_KEEP_PER_SITE = 20

// ---------------------------------------------------------------------------
// Prisma deposu
// ---------------------------------------------------------------------------

interface SiteJobRow {
  id: string
  siteId: string
  kind: string
  action: string | null
  trigger: string
  status: string
  phase: string | null
  actorId: string | null
  actor: string | null
  output: string
  error: string | null
  result: Prisma.JsonValue | null
  createdAt: Date
  startedAt: Date | null
  finishedAt: Date | null
}

function fromRow(row: SiteJobRow): SiteJobRecord {
  const result =
    row.result !== null && typeof row.result === "object" && !Array.isArray(row.result)
      ? (row.result as Record<string, unknown>)
      : null
  return {
    id: row.id,
    siteId: row.siteId,
    kind: row.kind as SiteJobKind,
    action: row.action,
    trigger: row.trigger as SiteJobTrigger,
    status: row.status as SiteJobStatus,
    phase: row.phase,
    actorId: row.actorId,
    actor: row.actor,
    output: row.output,
    error: row.error,
    result,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  }
}

function jsonInput(value: Record<string, unknown> | null) {
  return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue)
}

const prismaStore: SiteJobStore = {
  async create(record) {
    await prisma.siteJob.create({
      data: {
        id: record.id,
        siteId: record.siteId,
        kind: record.kind,
        action: record.action,
        trigger: record.trigger,
        status: record.status,
        phase: record.phase,
        actorId: record.actorId,
        actor: record.actor,
        output: record.output,
        error: record.error,
        result: jsonInput(record.result),
        createdAt: record.createdAt,
        startedAt: record.startedAt,
        finishedAt: record.finishedAt,
      },
    })
  },
  async update(id: string, patch: SiteJobPatch) {
    await prisma.siteJob.update({
      where: { id },
      data: {
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.phase !== undefined ? { phase: patch.phase } : {}),
        ...(patch.output !== undefined ? { output: patch.output } : {}),
        ...(patch.error !== undefined ? { error: patch.error } : {}),
        ...(patch.result !== undefined ? { result: jsonInput(patch.result) } : {}),
        ...(patch.startedAt !== undefined ? { startedAt: patch.startedAt } : {}),
        ...(patch.finishedAt !== undefined ? { finishedAt: patch.finishedAt } : {}),
      },
    })
  },
  async listUnfinished() {
    const rows = await prisma.siteJob.findMany({ where: { status: { in: ["queued", "running"] } } })
    return rows.map(fromRow)
  },
  async prune(siteId: string, keep: number) {
    const stale = await prisma.siteJob.findMany({
      where: { siteId },
      orderBy: { createdAt: "desc" },
      skip: keep,
      select: { id: true, status: true },
    })
    const ids = stale.filter((row) => row.status !== "queued" && row.status !== "running").map((row) => row.id)
    if (ids.length > 0) await prisma.siteJob.deleteMany({ where: { id: { in: ids } } })
  },
}

// ---------------------------------------------------------------------------
// Süreç geneli kayıt
// ---------------------------------------------------------------------------

const REGISTRY_KEY = Symbol.for("rudder.siteJobs")

function registry(): JobRegistry {
  const store = globalThis as unknown as Record<symbol, JobRegistry | undefined>
  let reg = store[REGISTRY_KEY]
  if (!reg) {
    reg = createJobRegistry({
      store: prismaStore,
      keepPerSite: SITE_JOBS_KEEP_PER_SITE,
      newId: () => `job${Date.now().toString(36)}${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
      onFinish: auditFinishedJob,
    })
    store[REGISTRY_KEY] = reg
  }
  return reg
}

export function startSiteJob(input: StartJobInput): Promise<StartJobOutcome> {
  return registry().start(input)
}

/** Sitenin kalıcı aktif işi (yoksa null). Otomatik pull'un geçici işi görünmez. */
export function activeJob(siteId: string): SiteJobView | null {
  return registry().active(siteId)
}

/**
 * Senkron site eylemlerinin (compose down/restart, PM2 restart) 409 kontrolü:
 * geçici otomatik pull işi dahil, sitede çalışan iş.
 */
export function busyJob(siteId: string): SiteJobView | null {
  return registry().active(siteId, { includeEphemeral: true })
}

/** Bütün sitelerde çalışan/bekleyen kalıcı işler (panel güncellemesi kontrolü). */
export function listActiveJobs(): SiteJobView[] {
  return registry().listActive()
}

/** İş bitene kadar bekler; bu süreçte yaşamıyorsa null. */
export function waitForJob(jobId: string): Promise<SiteJobView | null> {
  return registry().wait(jobId)
}

/** Önce bellek (canlı çıktı), yoksa veritabanı. İş o siteye ait değilse null. */
export async function getJob(siteId: string, jobId: string): Promise<SiteJobView | null> {
  const reg = registry()
  const live = reg.get(jobId)
  if (live) return live.siteId === siteId ? live : null
  const row = await prisma.siteJob.findFirst({ where: { id: jobId, siteId } })
  if (!row) return null
  return toJobView(reconcileRecord(fromRow(row), reg.isAlive(row.id)))
}

/** Sitenin en yeni işleri (çalışan/bekleyen dahil), yeniden eskiye. */
export async function recentJobs(siteId: string, limit = 5): Promise<SiteJobView[]> {
  const reg = registry()
  const rows = await prisma.siteJob.findMany({ where: { siteId }, orderBy: { createdAt: "desc" }, take: limit })
  return rows.map((row) => reg.get(row.id) ?? toJobView(reconcileRecord(fromRow(row), reg.isAlive(row.id))))
}

/**
 * Açılışta (instrumentation, zamanlayıcılardan ÖNCE): önceki süreçten kalan
 * queued/running işleri `interrupted` yapar. Deploy işlerinde site özeti de
 * başarısız olarak işaretlenir. Otomatik geri dönüş YAPILMAZ.
 */
export async function markInterruptedJobs(): Promise<number> {
  const marked = await registry().markInterrupted()
  for (const job of marked) {
    // Hiç başlamamış (kuyrukta kalmış) deploy siteye dokunmamıştır; özet bozulmaz.
    if (job.kind === "deploy" && job.startedAt) {
      await prisma.site
        .update({ where: { id: job.siteId }, data: { lastDeployOk: false, lastDeployError: job.error } })
        .catch(() => {})
    }
    void logAudit({
      userId: null,
      actor: "panel",
      action: `${auditBase(job)}_INTERRUPTED`,
      targetType: "Site",
      targetId: job.siteId,
      detail: job.error ?? undefined,
    })
  }
  if (marked.length > 0) console.warn(`[site-jobs] ${marked.length} yarım kalmış iş interrupted olarak işaretlendi.`)
  return marked.length
}

// ---------------------------------------------------------------------------
// Ortak yardımcılar
// ---------------------------------------------------------------------------

const KIND_LABELS: Record<SiteJobKind, string> = {
  deploy: "deploy",
  compose: "Docker Compose işlemi",
  backup: "yedekleme",
  restart: "yeniden başlatma",
}

/** İş başlatılamadığında (ör. veritabanına yazılamadı) route'ların 500 iletisi. */
export const JOB_START_FAILED_MESSAGE = "İş başlatılamadı (veritabanına yazılamadı); tekrar deneyin."

/**
 * `start*Job(...).catch(jobStartFailed)`: hatayı günlüğe yazar, null döner —
 * route çıplak 500 yerine JSON `{ error }` 500 döner.
 */
export function jobStartFailed(error: unknown): null {
  console.error("[site-jobs] iş başlatılamadı:", error)
  return null
}

/** 409 iletisi. */
export function busyMessage(active: SiteJobView | null): string {
  const label = active ? KIND_LABELS[active.kind] : "iş"
  return `Bu sitede zaten bir ${label} sürüyor — bitmesini bekleyin.`
}

const TRIGGER_ACTORS: Record<SiteJobTrigger, string> = {
  manual: "panel",
  hook: "deploy-hook",
  webhook: "github-webhook",
  "auto-pull": "auto-pull",
  schedule: "backup-scheduler",
}

/** İşte görünen "kim başlattı" etiketi: oturumlu kullanıcı adı ya da tetikleyici. */
export async function jobActor(userId: string | null, trigger: SiteJobTrigger): Promise<string> {
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } }).catch(() => null)
    if (user) return user.username
  }
  return TRIGGER_ACTORS[trigger]
}

function auditBase(job: SiteJobView): string {
  const action = (job.action ?? "").toUpperCase()
  switch (job.kind) {
    case "deploy":
      return "SITE_DEPLOY"
    case "compose":
      return `SITE_DOCKER_COMPOSE_${action}`
    case "backup":
      return "SITE_BACKUP"
    case "restart":
      return `SITE_${action || "RESTART"}`
  }
}

/** Kalıcı iş bitince denetim kaydı (hatası işi etkilemez — bkz. audit.ts). */
async function auditFinishedJob(job: SiteJobView, params: Record<string, unknown>): Promise<void> {
  const result = job.result ?? {}
  // Değişiklik olmayan pull (deploy edilmedi) denetime yazılmaz.
  if (job.kind === "deploy" && job.status === "succeeded" && result.deployed === false) return
  const domain = typeof params.domain === "string" ? params.domain : job.siteId
  const commit = typeof result.commit === "string" ? ` @${result.commit.slice(0, 7)}` : ""
  const failed = job.status !== "succeeded"
  await logAudit({
    userId: typeof params.actorId === "string" ? params.actorId : null,
    actor: job.actor ?? TRIGGER_ACTORS[job.trigger],
    action: failed ? `${auditBase(job)}_FAILED` : auditBase(job),
    targetType: "Site",
    targetId: job.siteId,
    detail: `${domain}${commit} [${job.trigger}]${failed && job.error ? `: ${job.error}` : ""}`,
  })
}

async function loadSite(siteId: string) {
  const site = await prisma.site.findUnique({ where: { id: siteId }, include: { githubInstallation: true } })
  if (!site) throw new Error("Site bulunamadı (silinmiş olabilir).")
  return site
}

interface JobStarter {
  siteId: string
  domain: string
  actorId?: string | null
  actor?: string | null
}

// ---------------------------------------------------------------------------
// Deploy / pull
// ---------------------------------------------------------------------------

export type DeployJobAction = "deploy" | "pull" | "connect"

/**
 * Deploy hattını iş olarak başlatır (bkz. src/lib/deploy.ts). `force`: HEAD
 * değişmese de deploy (Deploy Et, hook, bağlama). Otomatik pull geçici işle
 * başlar, yalnız deploy edecekse kalıcılaşır.
 */
export function startDeployJob(
  input: JobStarter & { trigger: SiteJobTrigger; action: DeployJobAction; force: boolean }
): Promise<StartJobOutcome> {
  // Deploy komutuna giden DEPLOY_TRIGGER eskisiyle aynı kalır (manual | pull | connect | hook | webhook | auto-pull).
  const deployTrigger: DeployTrigger =
    input.action === "connect"
      ? "connect"
      : input.trigger === "manual" || input.trigger === "schedule"
        ? input.action === "pull"
          ? "pull"
          : "manual"
        : input.trigger
  return startSiteJob({
    siteId: input.siteId,
    kind: "deploy",
    action: input.action,
    trigger: input.trigger,
    actorId: input.actorId ?? null,
    actor: input.actor ?? TRIGGER_ACTORS[input.trigger],
    ephemeral: input.trigger === "auto-pull",
    params: { force: input.force, domain: input.domain, actorId: input.actorId ?? null, deployTrigger },
    run: async (ctx, params) => {
      // Takip işi saatler sonra başlayabilir: site her zaman başlangıçta okunur.
      const site = await loadSite(input.siteId)
      const result = await deploySite(toDeployable(site), {
        force: params.force === true,
        trigger: params.deployTrigger as DeployTrigger,
        job: ctx,
      })
      if (input.trigger === "auto-pull" && result.changed) {
        console.log(
          `[auto-pull-scheduler] ${site.domain}: yeni commit ${result.commit?.slice(0, 7) ?? ""} çekildi` +
            (result.restartError ? ` ama yeniden başlatma başarısız: ${result.restartError}` : ", deploy edildi.")
        )
      }
      return {
        result: {
          pulled: result.pulled,
          changed: result.changed,
          commit: result.commit,
          deployed: result.deployed,
          restarted: result.restarted,
          restartError: result.restartError,
          rolledBack: result.rolledBack,
        },
        error: result.restartError,
      }
    },
  })
}

// ---------------------------------------------------------------------------
// Docker Compose (rebuild / pull / up)
// ---------------------------------------------------------------------------

export type ComposeJobAction = Extract<DockerComposeControlAction, "rebuild" | "pull" | "up">

export const COMPOSE_JOB_ACTIONS: readonly ComposeJobAction[] = ["rebuild", "pull", "up"]

export function startComposeJob(input: JobStarter & { action: ComposeJobAction }): Promise<StartJobOutcome> {
  return startSiteJob({
    siteId: input.siteId,
    kind: "compose",
    action: input.action,
    trigger: "manual",
    actorId: input.actorId ?? null,
    actor: input.actor ?? null,
    params: { domain: input.domain, actorId: input.actorId ?? null },
    run: async (ctx) => {
      const site = await loadSite(input.siteId)
      ctx.phase("queue")
      // Derleme/imaj çekme yapabilen eylemler sunucu genelindeki derleme kuyruğuna girer.
      await withBuildSlot(async (waitedMs) => {
        if (waitedMs >= 1000) ctx.log(`[panel] derleme kuyruğunda ${Math.round(waitedMs / 1000)} sn beklendi.`)
        ctx.phase("compose")
        ctx.log(`[panel] docker compose ${input.action}…`)
        try {
          await dockerComposeControl(site, input.action, { onChunk: (chunk) => ctx.write(chunk) })
        } catch (error) {
          throw new Error(error instanceof RestartError ? error.message : "Docker Compose eylemi başarısız oldu.")
        }
      })
      const process = await getProcessStatus(site)
      const status = process.state === "failed" ? "FAILED" : "ACTIVE"
      await prisma.site.update({ where: { id: site.id }, data: { status } }).catch(() => {})
      ctx.log(`[panel] durum: ${process.detail || process.state}`)
      return { result: { processState: process.state, processDetail: process.detail, siteStatus: status } }
    },
  })
}

// ---------------------------------------------------------------------------
// Yedek
// ---------------------------------------------------------------------------

/** Bulut hatası metnini sitenin `lastBackupError` alanına uygun hale getirir (eski route ile aynı). */
function backupS3ErrorText(s3Error: string | null): string | null {
  if (!s3Error) return null
  return s3Error.includes("yükleme") || s3Error.includes("yapılandırma")
    ? s3Error
    : `Bulut depolamaya yükleme başarısız: ${s3Error}`
}

/**
 * "Şimdi yedekle" (manual) ve zamanlanmış yedek (schedule). Zamanlanmış yedek
 * site meşgulse takip işi olarak kuyruğa girer, atlanmaz.
 */
export function startBackupJob(input: JobStarter & { trigger: "manual" | "schedule" }): Promise<StartJobOutcome> {
  return startSiteJob({
    siteId: input.siteId,
    kind: "backup",
    action: null,
    trigger: input.trigger,
    actorId: input.actorId ?? null,
    actor: input.actor ?? TRIGGER_ACTORS[input.trigger],
    params: { domain: input.domain, actorId: input.actorId ?? null },
    run: async (ctx) => {
      const site = await loadSite(input.siteId)
      ctx.phase("backup")
      ctx.log("[panel] veritabanı yedeği alınıyor…")
      try {
        const result = await runBackupForSite(site)
        await prisma.site.update({
          where: { id: site.id },
          data: { lastBackupAt: new Date(), lastBackupOk: true, lastBackupError: backupS3ErrorText(result.s3Error) },
        })
        ctx.log(`[panel] yedek alındı: ${result.fileName} (${Math.round(result.sizeBytes / 1024)} KB)`)
        if (result.uploadedToS3) ctx.log("[panel] bulut depolamaya yüklendi.")
        else if (result.s3Error) ctx.log(`[panel] bulut hatası: ${result.s3Error}`)
        if (input.trigger === "schedule") {
          console.log(
            `[backup-scheduler] ${site.domain}: yedek alındı (${result.fileName})` +
              (result.uploadedToS3 ? ", bulut depolamaya yüklendi." : result.s3Error ? `, bulut hatası: ${result.s3Error}` : ".")
          )
        }
        return { result: { ...result } }
      } catch (error) {
        const message = error instanceof BackupError ? error.message : "Yedekleme başarısız oldu."
        ctx.log(`[panel] ${message}`)
        if (input.trigger === "schedule") console.error(`[backup-scheduler] ${site.domain}: ${message}`)
        await prisma.site
          .update({ where: { id: site.id }, data: { lastBackupAt: new Date(), lastBackupOk: false, lastBackupError: message } })
          .catch((dbError) => console.error("[site-jobs] yedek durumu güncellenemedi:", dbError))
        throw new Error(message)
      }
    },
  })
}

// ---------------------------------------------------------------------------
// Özel betikle yeniden başlatma (CUSTOM_SCRIPT)
// ---------------------------------------------------------------------------

export type RestartJobAction = "restart" | "start"

export function startRestartJob(input: JobStarter & { action: RestartJobAction }): Promise<StartJobOutcome> {
  return startSiteJob({
    siteId: input.siteId,
    kind: "restart",
    action: input.action,
    trigger: "manual",
    actorId: input.actorId ?? null,
    actor: input.actor ?? null,
    params: { domain: input.domain, actorId: input.actorId ?? null },
    run: async (ctx) => {
      const site = await loadSite(input.siteId)
      ctx.phase("restart")
      if (site.customRestartCommand) ctx.log(`$ ${site.customRestartCommand}`)
      try {
        await restartSite(site, { onChunk: (chunk) => ctx.write(chunk) })
      } catch (error) {
        throw new Error(error instanceof RestartError ? error.message : "Yeniden başlatma başarısız.")
      }
      const process = await getProcessStatus(site)
      const status = process.state === "failed" ? "FAILED" : process.state === "stopped" ? "STOPPED" : "ACTIVE"
      await prisma.site.update({ where: { id: site.id }, data: { status } }).catch(() => {})
      return { result: { processState: process.state, siteStatus: status } }
    },
  })
}
