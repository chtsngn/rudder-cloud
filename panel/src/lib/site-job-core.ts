/**
 * Site işleri (2026-11) — saf çekirdek. Uzun işler (deploy, pull, compose
 * rebuild/pull/up, yedek, özel betikle restart) HTTP isteğinden çıkarılıp
 * `SiteJob` arka plan işine dönüşür; istek 202 + `jobId` ile hemen döner,
 * arayüz işi yoklar. (Cloudflare Tunnel ilk yanıtı ~100 sn bekleyip isteği
 * kesiyordu: deploy sürüp bitiyor ama arayüz "Sunucuya bağlanılamadı"
 * diyordu.)
 *
 * Bu dosya bilerek bağımlılıksız — `scripts/site-jobs.test.mjs` onu Node'un
 * yerleşik TS desteğiyle doğrudan içe aktarır (`@/` takma adı burada çalışmaz;
 * enum, parameter property gibi yalnız-tip-ayıklama dışı sözdizimi yok).
 * Prisma'lı depo ve süreç geneli kayıt: src/lib/site-jobs.ts.
 *
 * İçerik: durum makinesi, çıktı kuyruğu (son 64 KB), veritabanı yazma
 * kararı, çakışma kararı, görünüm ve enjekte edilebilir depolu kayıt.
 */

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------

export type SiteJobKind = "deploy" | "compose" | "backup" | "restart"
export type SiteJobTrigger = "manual" | "hook" | "webhook" | "auto-pull" | "schedule"
export type SiteJobStatus = "queued" | "running" | "succeeded" | "failed" | "interrupted"

export const SITE_JOB_STATUSES: readonly SiteJobStatus[] = ["queued", "running", "succeeded", "failed", "interrupted"]
export const ACTIVE_JOB_STATUSES: readonly SiteJobStatus[] = ["queued", "running"]

/** Kalıcı kayıt (Prisma satırıyla aynı alanlar). */
export interface SiteJobRecord {
  id: string
  siteId: string
  kind: SiteJobKind
  action: string | null
  trigger: SiteJobTrigger
  status: SiteJobStatus
  phase: string | null
  actorId: string | null
  actor: string | null
  output: string
  error: string | null
  result: Record<string, unknown> | null
  createdAt: Date
  startedAt: Date | null
  finishedAt: Date | null
}

/** API'nin döndürdüğü JSON (arayüz sözleşmesi). */
export interface SiteJobView {
  id: string
  siteId: string
  kind: SiteJobKind
  action: string | null
  trigger: SiteJobTrigger
  status: SiteJobStatus
  phase: string | null
  output: string
  error: string | null
  result: Record<string, unknown> | null
  actor: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export type SiteJobPatch = Partial<
  Pick<SiteJobRecord, "status" | "phase" | "output" | "error" | "result" | "startedAt" | "finishedAt">
>

export interface SiteJobStore {
  create(record: SiteJobRecord): Promise<void>
  update(id: string, patch: SiteJobPatch): Promise<void>
  /** queued/running durumundaki bütün kayıtlar. */
  listUnfinished(): Promise<SiteJobRecord[]>
  /** Sitenin bitmiş işlerinden en yeni `keep` tanesi dışındakileri siler. */
  prune?(siteId: string, keep: number): Promise<void>
}

// ---------------------------------------------------------------------------
// Durum makinesi
// ---------------------------------------------------------------------------

const TRANSITIONS: Record<SiteJobStatus, readonly SiteJobStatus[]> = {
  queued: ["running", "failed", "interrupted"],
  running: ["succeeded", "failed", "interrupted"],
  succeeded: [],
  failed: [],
  interrupted: [],
}

export function isTerminalStatus(status: SiteJobStatus): boolean {
  return TRANSITIONS[status].length === 0
}

export function canTransition(from: SiteJobStatus, to: SiteJobStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

export class InvalidJobTransitionError extends Error {
  from: SiteJobStatus
  to: SiteJobStatus
  constructor(from: SiteJobStatus, to: SiteJobStatus) {
    super(`Geçersiz iş durumu geçişi: ${from} → ${to}`)
    this.name = "InvalidJobTransitionError"
    this.from = from
    this.to = to
  }
}

/** Geçiş geçerliyse yeni durumu döner, değilse `InvalidJobTransitionError` fırlatır. */
export function transition(from: SiteJobStatus, to: SiteJobStatus): SiteJobStatus {
  if (!canTransition(from, to)) throw new InvalidJobTransitionError(from, to)
  return to
}

// ---------------------------------------------------------------------------
// Çıktı kuyruğu (son 64 KB)
// ---------------------------------------------------------------------------

export const JOB_OUTPUT_MAX_BYTES = 64 * 1024
export const JOB_OUTPUT_TRUNCATED_MARKER = "…[önceki çıktı kesildi]\n"

function codePointBytes(cp: number): number {
  if (cp < 0x80) return 1
  if (cp < 0x800) return 2
  if (cp < 0x10000) return 3
  return 4
}

/** Metnin UTF-8 bayt uzunluğu (Buffer/TextEncoder olmadan). */
export function utf8ByteLength(text: string): number {
  let bytes = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4
        i++
        continue
      }
    }
    bytes += codePointBytes(code)
  }
  return bytes
}

/**
 * Metnin UTF-8'de en çok `maxBytes` tutan son kısmı. Kesim mümkünse bir satır
 * başından yapılır; tek satır sığmıyorsa karakter sınırından (çok baytlı
 * karakter ve vekil çift bölünmez). Kesildiyse başına işaret konur; işaret de
 * sınırın içindedir.
 */
export function tailUtf8(text: string, maxBytes: number = JOB_OUTPUT_MAX_BYTES): string {
  if (utf8ByteLength(text) <= maxBytes) return text
  const budget = Math.max(0, maxBytes - utf8ByteLength(JOB_OUTPUT_TRUNCATED_MARKER))
  let bytes = 0
  let start = text.length
  while (start > 0) {
    let cpStart = start - 1
    let cpBytes = codePointBytes(text.charCodeAt(cpStart))
    const low = text.charCodeAt(cpStart)
    if (low >= 0xdc00 && low <= 0xdfff && cpStart > 0) {
      const high = text.charCodeAt(cpStart - 1)
      if (high >= 0xd800 && high <= 0xdbff) {
        cpStart -= 1
        cpBytes = 4
      }
    }
    if (bytes + cpBytes > budget) break
    bytes += cpBytes
    start = cpStart
  }
  // `start` metnin sığan en eski karakteri; satır ortasındaysa bir sonraki satır başına atla.
  if (start > 0 && text.charCodeAt(start - 1) !== 10) {
    const nl = text.indexOf("\n", start)
    if (nl !== -1 && nl + 1 < text.length) start = nl + 1
  }
  return JOB_OUTPUT_TRUNCATED_MARKER + text.slice(start)
}

/** Birikmiş çıktıya parça ekler, son `maxBytes`'ı tutar. */
export function appendOutput(current: string, chunk: string, maxBytes: number = JOB_OUTPUT_MAX_BYTES): string {
  if (!chunk) return current
  return tailUtf8(current + chunk, maxBytes)
}

// ---------------------------------------------------------------------------
// Veritabanı yazma kararı
// ---------------------------------------------------------------------------

export const JOB_FLUSH_INTERVAL_MS = 2_000

export type FlushReason = "output" | "phase" | "finish"

/**
 * Bir sonraki yazımın kaç ms sonra yapılacağı: faz geçişi ve bitiş zorunludur
 * (0); çıktı değişikliği en çok `intervalMs`'de bir yazılır; değişiklik yoksa
 * null (yazma yok).
 */
export function flushDelay(
  state: { dirty: boolean; lastFlushAt: number },
  now: number,
  reason: FlushReason,
  intervalMs: number = JOB_FLUSH_INTERVAL_MS
): number | null {
  if (reason !== "output") return 0
  if (!state.dirty) return null
  return Math.max(0, state.lastFlushAt + intervalMs - now)
}

// ---------------------------------------------------------------------------
// Çakışma kararı
// ---------------------------------------------------------------------------

/**
 * start: hemen başla · reject: 409 · queue: takip işi olarak kuyruğa al ·
 * coalesce: kuyruktaki aynı türden takip işine katıl · skip: sessizce atla.
 */
export type ConflictDecision = "start" | "reject" | "queue" | "coalesce" | "skip"

/**
 * Sitede iş sürerken yeni bir iş gelirse:
 * - manual → 409 (kullanıcı beklesin)
 * - hook / webhook / schedule → takip işi: site başına her türden EN ÇOK BİR
 *   bekleyen iş; aynı türden bekleyen varsa ona katılır (push'lar düşmez,
 *   yığılmaz da)
 * - auto-pull → atla (bir sonraki turda tekrar dener)
 */
export function decideConflict(input: {
  trigger: SiteJobTrigger
  kind: SiteJobKind
  active: { kind: SiteJobKind } | null
  queued: ReadonlyArray<{ kind: SiteJobKind }>
}): ConflictDecision {
  if (!input.active && input.queued.length === 0) return "start"
  switch (input.trigger) {
    case "manual":
      return "reject"
    case "auto-pull":
      return "skip"
    default:
      return input.queued.some((job) => job.kind === input.kind) ? "coalesce" : "queue"
  }
}

// ---------------------------------------------------------------------------
// Görünüm
// ---------------------------------------------------------------------------

export function toJobView(record: SiteJobRecord): SiteJobView {
  return {
    id: record.id,
    siteId: record.siteId,
    kind: record.kind,
    action: record.action,
    trigger: record.trigger,
    status: record.status,
    phase: record.phase,
    output: record.output,
    error: record.error,
    result: record.result,
    actor: record.actor,
    createdAt: record.createdAt.toISOString(),
    startedAt: record.startedAt ? record.startedAt.toISOString() : null,
    finishedAt: record.finishedAt ? record.finishedAt.toISOString() : null,
  }
}

/** İşin geçen süresi (ms): başlamadıysa 0; sürüyorsa `now`'a kadar. */
export function jobElapsedMs(job: { startedAt: string | Date | null; finishedAt: string | Date | null }, now: number): number {
  if (!job.startedAt) return 0
  const started = new Date(job.startedAt).getTime()
  const end = job.finishedAt ? new Date(job.finishedAt).getTime() : now
  return Math.max(0, end - started)
}

export function interruptedMessage(kind: SiteJobKind): string {
  return kind === "deploy"
    ? "Panel yeniden başladı, deploy yarıda kaldı; site durumunu kontrol edin."
    : "Panel yeniden başladı, iş yarıda kaldı; site durumunu kontrol edin."
}

/**
 * Okuma güvenlik ağı: veritabanında queued/running görünen ama bu süreçte
 * yaşamayan iş yarıda kalmıştır (panel yeniden başladı, süreç öldü).
 */
export function reconcileRecord(record: SiteJobRecord, aliveInMemory: boolean): SiteJobRecord {
  if (aliveInMemory || isTerminalStatus(record.status)) return record
  return { ...record, status: "interrupted", error: record.error ?? interruptedMessage(record.kind) }
}

// ---------------------------------------------------------------------------
// Kayıt (süreç içi kilit + kuyruk + yazma)
// ---------------------------------------------------------------------------

/** İşin çalışan koda verdiği arayüz (deploy/restart çıktısını buraya akıtır). */
export interface JobContext {
  readonly id: string
  /** Satır ekler (sonuna `\n`). */
  log(line: string): void
  /** Ham çıktı parçası ekler (spawn stdout/stderr). */
  write(chunk: string): void
  /** Faz değiştirir; veritabanına hemen yazılır. */
  phase(name: string): void
  /**
   * Geçici (ephemeral) işi kalıcı yapar. Otomatik pull her turda geçici iş
   * açar; yalnız gerçekten deploy edecekse kalıcılaşır (her 15 sn'de bir satır
   * birikmesin diye).
   */
  persist(): Promise<void>
}

/** `run` dönüşü: `error` doluysa iş `failed` olur (ama sonuç yine saklanır). */
export interface JobRunOutcome {
  result?: Record<string, unknown> | null
  error?: string | null
}

export interface StartJobInput {
  siteId: string
  kind: SiteJobKind
  action?: string | null
  trigger: SiteJobTrigger
  actorId?: string | null
  actor?: string | null
  /** true: depoya yalnız `ctx.persist()` çağrılırsa yazılır. */
  ephemeral?: boolean
  /** Kuyruktaki aynı türden işe katılırken çağrılır (ör. force'u yükseltmek için). */
  params?: Record<string, unknown>
  run: (ctx: JobContext, params: Record<string, unknown>) => Promise<JobRunOutcome | void>
}

/** Her durum ayrı üye: `status` kontrolüyle `job`/`activeJob` daralır. */
export type StartJobOutcome =
  | { status: "started"; job: SiteJobView }
  | { status: "queued"; job: SiteJobView }
  | { status: "coalesced"; job: SiteJobView }
  | { status: "rejected"; activeJob: SiteJobView | null }
  | { status: "skipped"; activeJob: SiteJobView | null }

/** İş başladı, kuyruğa girdi ya da bekleyen işe katıldı mı (`job` var mı)? */
export function isJobAccepted(
  outcome: StartJobOutcome
): outcome is Extract<StartJobOutcome, { job: SiteJobView }> {
  return outcome.status === "started" || outcome.status === "queued" || outcome.status === "coalesced"
}

export interface JobRegistryOptions {
  store: SiteJobStore
  now?: () => number
  flushIntervalMs?: number
  maxOutputBytes?: number
  /** Site başına saklanacak iş sayısı (bitişte budanır). */
  keepPerSite?: number
  /** Bitmiş işin bellekte tutulma süresi (ms). */
  finishedTtlMs?: number
  /** Hiç kalıcılaşmamış (geçici) bitmiş işin bellekte tutulma süresi (ms). */
  ephemeralTtlMs?: number
  newId?: () => string
  schedule?: (fn: () => void, ms: number) => () => void
  /** Kalıcı iş bittiğinde (son yazımdan sonra) — audit vb. Hatası yutulur. */
  onFinish?: (job: SiteJobView, params: Record<string, unknown>) => Promise<void> | void
  onError?: (message: string, error: unknown) => void
}

interface LiveJob {
  record: SiteJobRecord
  persisted: boolean
  params: Record<string, unknown>
  run: StartJobInput["run"]
  dirty: boolean
  lastFlushAt: number
  cancelTimer: (() => void) | null
  writeChain: Promise<void>
  /** Depoya ilk kayıt (create) sonucu; geçici işte hemen true. */
  created: Promise<boolean>
  waiters: Array<(view: SiteJobView) => void>
}

export interface JobRegistry {
  start(input: StartJobInput): Promise<StartJobOutcome>
  get(id: string): SiteJobView | null
  isAlive(id: string): boolean
  /** Sitenin çalışan işi (geçiciler dahil değil, `includeEphemeral` verilmezse). */
  active(siteId: string, opts?: { includeEphemeral?: boolean }): SiteJobView | null
  queued(siteId: string): SiteJobView[]
  /** Bütün sitelerdeki çalışan/bekleyen kalıcı işler. */
  listActive(): SiteJobView[]
  wait(id: string): Promise<SiteJobView | null>
  /** Depoda queued/running olup bu süreçte yaşamayan işleri `interrupted` yapar. */
  markInterrupted(): Promise<SiteJobView[]>
}

function defaultSchedule(fn: () => void, ms: number): () => void {
  const timer = setTimeout(fn, ms)
  ;(timer as unknown as { unref?: () => void }).unref?.()
  return () => clearTimeout(timer)
}

function defaultId(): string {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function createJobRegistry(options: JobRegistryOptions): JobRegistry {
  const store = options.store
  const now = options.now ?? (() => Date.now())
  const interval = options.flushIntervalMs ?? JOB_FLUSH_INTERVAL_MS
  const maxBytes = options.maxOutputBytes ?? JOB_OUTPUT_MAX_BYTES
  const keep = options.keepPerSite ?? 20
  const ttl = options.finishedTtlMs ?? 15 * 60_000
  const ephemeralTtl = options.ephemeralTtlMs ?? 30_000
  const newId = options.newId ?? defaultId
  const schedule = options.schedule ?? defaultSchedule
  const onError = options.onError ?? ((message: string, error: unknown) => console.error(`[site-jobs] ${message}`, error))

  const jobs = new Map<string, LiveJob>()
  const activeBySite = new Map<string, LiveJob>()
  const queueBySite = new Map<string, LiveJob[]>()

  function view(job: LiveJob): SiteJobView {
    return toJobView(job.record)
  }

  function snapshot(job: LiveJob): SiteJobPatch {
    const r = job.record
    return {
      status: r.status,
      phase: r.phase,
      output: r.output,
      error: r.error,
      result: r.result,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
    }
  }

  function flushNow(job: LiveJob): Promise<void> {
    if (job.cancelTimer) {
      job.cancelTimer()
      job.cancelTimer = null
    }
    job.dirty = false
    job.lastFlushAt = now()
    if (!job.persisted) return job.writeChain
    job.writeChain = job.writeChain
      .then(() => store.update(job.record.id, snapshot(job)))
      .catch((error) => onError(`iş durumu yazılamadı (${job.record.id})`, error))
    return job.writeChain
  }

  function requestFlush(job: LiveJob, reason: FlushReason): void {
    const delay = flushDelay(job, now(), reason, interval)
    if (delay === null) return
    if (delay === 0) {
      void flushNow(job)
      return
    }
    if (!job.cancelTimer) {
      job.cancelTimer = schedule(() => {
        job.cancelTimer = null
        void flushNow(job)
      }, delay)
    }
  }

  function setStatus(job: LiveJob, to: SiteJobStatus): void {
    job.record.status = transition(job.record.status, to)
  }

  function makeContext(job: LiveJob): JobContext {
    const write = (chunk: string) => {
      if (!chunk || isTerminalStatus(job.record.status)) return
      job.record.output = appendOutput(job.record.output, chunk, maxBytes)
      job.dirty = true
      requestFlush(job, "output")
    }
    return {
      id: job.record.id,
      write,
      log: (line: string) => write(line.endsWith("\n") ? line : `${line}\n`),
      phase: (name: string) => {
        if (isTerminalStatus(job.record.status) || job.record.phase === name) return
        job.record.phase = name
        job.dirty = true
        requestFlush(job, "phase")
      },
      persist: async () => {
        if (job.persisted) return
        job.persisted = true
        job.writeChain = job.writeChain.then(() => store.create({ ...job.record }))
        await job.writeChain
      },
    }
  }

  async function finish(job: LiveJob, to: SiteJobStatus, error: string | null, result: Record<string, unknown> | null) {
    setStatus(job, to)
    job.record.error = error
    if (result !== null) job.record.result = result
    job.record.finishedAt = new Date(now())
    job.dirty = true
    await flushNow(job)

    const siteId = job.record.siteId
    const finishedView = view(job)
    for (const resolve of job.waiters.splice(0)) resolve(finishedView)
    schedule(() => {
      if (jobs.get(job.record.id) === job) jobs.delete(job.record.id)
    }, job.persisted ? ttl : ephemeralTtl)

    // Kilit hâlâ bu işteyse bırak ve sıradaki takip işini başlat. (Son yazım
    // beklenirken bu iş bitmiş sayılıp yerine yeni bir iş başlamış olabilir —
    // o durumda kuyruğu o iş bitince ilerletir.)
    if (activeBySite.get(siteId) === job) {
      activeBySite.delete(siteId)
      startNext(siteId)
    }

    if (job.persisted) {
      if (store.prune) await store.prune(siteId, keep).catch((err) => onError("eski işler budanamadı", err))
      if (options.onFinish) {
        try {
          await options.onFinish(finishedView, job.params)
        } catch (err) {
          onError("iş bitiş kancası başarısız", err)
        }
      }
    }
  }

  /**
   * Kuyruktaki ilk işi (FIFO) başlatır. Kilit HEMEN ona geçer; iş, depoya ilk
   * kaydı tamamlanınca çalışır. Kayıt başarısızsa kilit bırakılır, sıradakine
   * geçilir.
   */
  function startNext(siteId: string): void {
    const queue = queueBySite.get(siteId)
    const next = queue?.shift()
    if (queue && queue.length === 0) queueBySite.delete(siteId)
    if (!next) return
    activeBySite.set(siteId, next)
    void next.created.then((ok) => {
      if (ok) {
        void runJob(next)
        return
      }
      if (activeBySite.get(siteId) === next) {
        activeBySite.delete(siteId)
        startNext(siteId)
      }
    })
  }

  async function runJob(job: LiveJob): Promise<void> {
    activeBySite.set(job.record.siteId, job)
    setStatus(job, "running")
    job.record.startedAt = new Date(now())
    job.dirty = true
    await flushNow(job)
    const ctx = makeContext(job)
    let outcome: JobRunOutcome | void
    try {
      outcome = await job.run(ctx, job.params)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await finish(job, "failed", message || "İş başarısız oldu.", null)
      return
    }
    const o: JobRunOutcome = typeof outcome === "object" && outcome !== null ? outcome : {}
    const error = o.error ? o.error : null
    await finish(job, error ? "failed" : "succeeded", error, o.result ?? null)
  }

  function newLiveJob(input: StartJobInput, status: SiteJobStatus): LiveJob {
    return {
      record: {
        id: newId(),
        siteId: input.siteId,
        kind: input.kind,
        action: input.action ?? null,
        trigger: input.trigger,
        status,
        phase: null,
        actorId: input.actorId ?? null,
        actor: input.actor ?? null,
        output: "",
        error: null,
        result: null,
        createdAt: new Date(now()),
        startedAt: null,
        finishedAt: null,
      },
      persisted: !input.ephemeral,
      params: { ...(input.params ?? {}) },
      run: input.run,
      dirty: false,
      lastFlushAt: 0,
      cancelTimer: null,
      writeChain: Promise.resolve(),
      created: Promise.resolve(true),
      waiters: [],
    }
  }

  /** Sitenin kilidini tutan iş; bitmiş ama son yazımı süren iş, kuyruk boşsa sayılmaz. */
  function currentActive(siteId: string): LiveJob | null {
    const job = activeBySite.get(siteId) ?? null
    if (!job) return null
    if (isTerminalStatus(job.record.status) && !queueBySite.get(siteId)?.length) return null
    return job
  }

  return {
    async start(input) {
      const active = currentActive(input.siteId)
      const queue = queueBySite.get(input.siteId) ?? []
      const decision = decideConflict({
        trigger: input.trigger,
        kind: input.kind,
        active: active ? active.record : null,
        queued: queue.map((j) => j.record),
      })
      if (decision === "reject") return { status: "rejected", activeJob: active ? view(active) : null }
      if (decision === "skip") return { status: "skipped", activeJob: active ? view(active) : null }
      if (decision === "coalesce") {
        const existing = queue.find((j) => j.record.kind === input.kind) as LiveJob
        // Katılan istek zorlamalıysa (hook) bekleyen iş de zorlamalı olsun.
        if (input.params?.force === true) existing.params.force = true
        return { status: "coalesced", job: view(existing) }
      }

      // Kilit/kuyruk kaydı EŞZAMANLI yapılır (await'ten önce) — yarış olmasın.
      const job = newLiveJob(input, "queued")
      jobs.set(job.record.id, job)
      if (decision === "start") activeBySite.set(input.siteId, job)
      else queueBySite.set(input.siteId, [...queue, job])

      if (job.persisted) {
        let createError: unknown = null
        job.created = store.create({ ...job.record }).then(
          () => true,
          (err: unknown) => {
            createError = err
            return false
          }
        )
        job.writeChain = job.created.then(() => undefined)
        if (!(await job.created)) {
          jobs.delete(job.record.id)
          if (decision === "start") {
            // Kayıt sürerken kuyruğa giren takip işi beklemede kalmasın.
            if (activeBySite.get(input.siteId) === job) {
              activeBySite.delete(input.siteId)
              startNext(input.siteId)
            }
          } else {
            // Hâlâ kuyruktaysa çıkar. Kuyruktan alınmışsa kilidi `startNext` bırakır;
            // burada dokunmak başka bir işin kilidini silebilirdi.
            const q = queueBySite.get(input.siteId)
            if (q && q.includes(job)) {
              const rest = q.filter((j) => j !== job)
              if (rest.length) queueBySite.set(input.siteId, rest)
              else queueBySite.delete(input.siteId)
            }
          }
          throw createError
        }
      }
      if (decision === "start") {
        void runJob(job)
        return { status: "started", job: view(job) }
      }
      return { status: "queued", job: view(job) }
    },

    get(id) {
      const job = jobs.get(id)
      return job ? view(job) : null
    },

    isAlive(id) {
      const job = jobs.get(id)
      return Boolean(job && !isTerminalStatus(job.record.status))
    },

    active(siteId, opts) {
      const job = currentActive(siteId)
      if (!job) return null
      if (!job.persisted && !opts?.includeEphemeral) return null
      return view(job)
    },

    queued(siteId) {
      return (queueBySite.get(siteId) ?? []).map(view)
    },

    listActive() {
      const out: SiteJobView[] = []
      for (const job of activeBySite.values()) {
        if (job.persisted && !isTerminalStatus(job.record.status)) out.push(view(job))
      }
      for (const queue of queueBySite.values()) for (const job of queue) out.push(view(job))
      return out
    },

    wait(id) {
      const job = jobs.get(id)
      if (!job) return Promise.resolve(null)
      if (isTerminalStatus(job.record.status)) return Promise.resolve(view(job))
      return new Promise((resolve) => job.waiters.push(resolve))
    },

    async markInterrupted() {
      const rows = await store.listUnfinished()
      const marked: SiteJobView[] = []
      for (const row of rows) {
        if (jobs.has(row.id)) continue
        const finishedAt = new Date(now())
        const error = interruptedMessage(row.kind)
        await store.update(row.id, { status: "interrupted", error, finishedAt })
        marked.push(toJobView({ ...row, status: "interrupted", error, finishedAt }))
      }
      return marked
    },
  }
}
