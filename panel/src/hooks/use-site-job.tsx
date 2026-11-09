"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import {
  computeServerOffset,
  isTerminalStatus,
  jobElapsedMs,
  type SiteJobKind,
  type SiteJobResponse,
  type SiteJobsListResponse,
  type SiteJobView,
} from "@/hooks/site-job-utils"

export type { SiteJobView } from "@/hooks/site-job-utils"

/** Yoklama aralıkları: görünür sekmede 1,5 sn, gizli sekmede 5 sn. */
const POLL_MS = 1500
const HIDDEN_POLL_MS = 5000
/** Aktif iş yokken başka yerden (webhook, auto-pull, başka sekme) başlayan işi yakalamak için. */
const IDLE_CHECK_MS = 20_000
/** Sayfa açılışında yakın zamanda yarıda kalmış iş varsa gösterilir. */
const RECENT_INTERRUPTED_MS = 10 * 60_000

export type StartJobResult =
  /** İşe bağlanıldı (202 + jobId ya da 409 + activeJob). */
  | { kind: "job"; job: SiteJobView; data: Record<string, unknown> | null; alreadyRunning: boolean }
  /** İş üretmeyen (senkron) yanıt — çağıran eski davranışı uygular. */
  | { kind: "sync"; res: Response; data: Record<string, unknown> | null }
  | { kind: "network-error" }

interface SiteJobContextValue {
  siteId: string
  /** İzlenen iş (sürüyor ya da bu oturumda bitmiş, kapatılmamış). */
  job: SiteJobView | null
  /** Süren (queued/running) iş; yoksa null. */
  active: SiteJobView | null
  /** Geçen süre (ms), sunucu saatine göre; süren işte saniyede bir güncellenir. */
  elapsedMs: number
  /** 409 ile mevcut işe bağlanıldıysa bilgi notu. */
  notice: "already-running" | null
  /** Son yoklama ağ hatasıyla düştüyse (iş başarısız sayılmaz, yoklama sürer). */
  networkWarning: boolean
  /** POST isteği yoldayken çağıranın verdiği anahtar. */
  starting: string | null
  /** Uzun ya da kısa her eylem için: 202/409'da işe bağlanır, değilse senkron yanıtı döndürür. */
  startJob: (
    key: string,
    url: string,
    init?: RequestInit,
    expect?: { kind: SiteJobKind; action?: string | null }
  ) => Promise<StartJobResult>
  dismiss: () => void
  /** İş (bu sayfada izlenirken) bitince çağrılır; abonelikten çıkış fonksiyonu döner. */
  subscribeFinished: (fn: (job: SiteJobView) => void) => () => void
}

const SiteJobContext = createContext<SiteJobContextValue | null>(null)

function isJobLike(v: unknown): v is SiteJobView {
  if (!v || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  return typeof o.id === "string" && typeof o.status === "string" && typeof o.kind === "string"
}

function serverNowOf(data: unknown): string | null {
  if (!data || typeof data !== "object") return null
  const v = (data as Record<string, unknown>).serverNow
  return typeof v === "string" ? v : null
}

export function SiteJobProvider({
  siteId,
  onJobFinished,
  children,
}: {
  siteId: string
  /** Bitişte sayfa verisini yenilemek için (ör. siteyi yeniden çek). */
  onJobFinished?: (job: SiteJobView) => void
  children: ReactNode
}) {
  const [job, setJob] = useState<SiteJobView | null>(null)
  const [offset, setOffset] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [notice, setNotice] = useState<"already-running" | null>(null)
  const [networkWarning, setNetworkWarning] = useState(false)
  const [starting, setStarting] = useState<string | null>(null)

  const jobRef = useRef<SiteJobView | null>(null)
  /** Bitişi bildirilecek iş (yalnız süren hâlinde izlenen ya da bizim başlattığımız). */
  const watchingRef = useRef<string | null>(null)
  const listenersRef = useRef(new Set<(job: SiteJobView) => void>())
  const onFinishedRef = useRef(onJobFinished)
  useEffect(() => {
    onFinishedRef.current = onJobFinished
  }, [onJobFinished])

  const fireFinished = useCallback((finished: SiteJobView) => {
    onFinishedRef.current?.(finished)
    listenersRef.current.forEach((fn) => {
      try {
        fn(finished)
      } catch {
        // dinleyici hatası diğerlerini durdurmasın
      }
    })
  }, [])

  /** Yeni iş durumu uygula; süren hâlden bitmişe geçişte dinleyicileri çağır. */
  const applyJob = useCallback(
    (next: SiteJobView, serverNow: string | null, opts?: { watch?: boolean }) => {
      if (serverNow) setOffset(computeServerOffset(serverNow, Date.now()))
      if (opts?.watch || !isTerminalStatus(next.status)) watchingRef.current = next.id
      jobRef.current = next
      setJob(next)
      setNow(Date.now())
      if (isTerminalStatus(next.status) && watchingRef.current === next.id) {
        watchingRef.current = null
        fireFinished(next)
      }
    },
    [fireFinished]
  )

  /** GET /jobs: aktif iş varsa ona bağlan. Bağlanılan aktif işi döndürür. */
  const checkActive = useCallback(
    async (initial: boolean): Promise<SiteJobView | null> => {
      try {
        const res = await fetch(`/api/sites/${siteId}/jobs`, { cache: "no-store" })
        if (!res.ok) return null
        const data = (await res.json().catch(() => null)) as SiteJobsListResponse | null
        if (!data) return null
        const serverNow = serverNowOf(data)
        if (isJobLike(data.active)) {
          const current = jobRef.current
          if (!current || current.id !== data.active.id || isTerminalStatus(current.status)) {
            applyJob(data.active, serverNow)
          }
          return data.active
        }
        if (initial && !jobRef.current && Array.isArray(data.recent)) {
          const last = data.recent[0]
          if (isJobLike(last) && last.status === "interrupted" && last.finishedAt) {
            const off = computeServerOffset(serverNow, Date.now())
            const age = Date.now() + off - Date.parse(last.finishedAt)
            if (Number.isFinite(age) && age < RECENT_INTERRUPTED_MS) applyJob(last, serverNow)
          }
        }
        return null
      } catch {
        return null
      }
    },
    [siteId, applyJob]
  )

  // Sayfa açılışı / site değişimi: aktif işe yeniden bağlan.
  useEffect(() => {
    jobRef.current = null
    watchingRef.current = null
    const timer = setTimeout(() => {
      setJob(null)
      setNotice(null)
      setNetworkWarning(false)
      void checkActive(true)
    }, 0)
    return () => clearTimeout(timer)
  }, [siteId, checkActive])

  const jobId = job?.id ?? null
  const jobTerminal = job ? isTerminalStatus(job.status) : true

  // Süren işi yokla.
  useEffect(() => {
    if (!jobId || jobTerminal) return
    let cancelled = false
    let inFlight = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const nextDelay = () => (document.visibilityState === "hidden" ? HIDDEN_POLL_MS : POLL_MS)
    const schedule = () => {
      if (cancelled) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(tick, nextDelay())
    }

    async function tick() {
      if (cancelled || inFlight) return
      inFlight = true
      try {
        const res = await fetch(`/api/sites/${siteId}/jobs/${jobId}`, { cache: "no-store" })
        if (res.status === 404) {
          // Kayıt yok: listeden yeniden bağlanmayı dene; o da yoksa izlemeyi bırak.
          const found = await checkActive(false)
          if (!cancelled && !found) {
            watchingRef.current = null
            jobRef.current = null
            setJob(null)
          }
          return
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json().catch(() => null)) as SiteJobResponse | null
        if (!data || !isJobLike(data.job)) throw new Error("bad response")
        if (cancelled) return
        setNetworkWarning(false)
        applyJob(data.job, serverNowOf(data))
        if (isTerminalStatus(data.job.status)) return
      } catch {
        // Geçici bağlantı hatası (Cloudflare, panel yeniden başlıyor…): iş başarısız
        // sayılmaz, yoklama sürer.
        if (!cancelled) setNetworkWarning(true)
      } finally {
        inFlight = false
      }
      schedule()
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !inFlight) {
        if (timer) clearTimeout(timer)
        void tick()
      }
    }

    timer = setTimeout(tick, POLL_MS)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [jobId, jobTerminal, siteId, applyJob, checkActive])

  // Süren işte geçen süre sayacı.
  useEffect(() => {
    if (!jobId || jobTerminal) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [jobId, jobTerminal])

  // Aktif iş yokken başka yerden başlayan işi yakala.
  useEffect(() => {
    if (!jobTerminal) return
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void checkActive(false)
    }, IDLE_CHECK_MS)
    const onVisibility = () => {
      if (document.visibilityState === "visible") void checkActive(false)
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [jobTerminal, checkActive])

  const startJob = useCallback<SiteJobContextValue["startJob"]>(
    async (key, url, init, expect) => {
      setStarting(key)
      setNotice(null)
      try {
        let res: Response
        try {
          res = await fetch(url, init)
        } catch {
          // İstek sunucuya ulaşmış ve işi başlatmış olabilir — aktif işe bak.
          const found = await checkActive(false)
          if (found) return { kind: "job", job: found, data: null, alreadyRunning: false }
          return { kind: "network-error" }
        }
        const raw: unknown = await res.json().catch(() => null)
        const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null
        const serverNow = serverNowOf(data)

        if (res.status === 409 && data && isJobLike(data.activeJob)) {
          applyJob(data.activeJob, serverNow)
          setNotice("already-running")
          return { kind: "job", job: data.activeJob, data, alreadyRunning: true }
        }

        const newJobId = res.ok && data && typeof data.jobId === "string" ? data.jobId : null
        if (newJobId) {
          let started: SiteJobView | null = data && isJobLike(data.job) && data.job.id === newJobId ? data.job : null
          let startedNow = serverNow
          if (!started) {
            try {
              const jr = await fetch(`/api/sites/${siteId}/jobs/${newJobId}`, { cache: "no-store" })
              const jd = jr.ok ? ((await jr.json().catch(() => null)) as SiteJobResponse | null) : null
              if (jd && isJobLike(jd.job)) {
                started = jd.job
                startedNow = serverNowOf(jd)
              }
            } catch {
              // yoklama tamamlar
            }
          }
          if (!started) {
            // Yer tutucu: yoklama gerçek durumu getirir.
            started = {
              id: newJobId,
              siteId,
              kind: expect?.kind ?? "deploy",
              action: expect?.action ?? null,
              trigger: "manual",
              status: "queued",
              phase: null,
              output: "",
              error: null,
              result: null,
              actor: null,
              createdAt: new Date().toISOString(),
              startedAt: null,
              finishedAt: null,
            }
          }
          setNetworkWarning(false)
          applyJob(started, startedNow, { watch: true })
          return { kind: "job", job: started, data, alreadyRunning: false }
        }

        return { kind: "sync", res, data }
      } finally {
        setStarting(null)
      }
    },
    [siteId, applyJob, checkActive]
  )

  const dismiss = useCallback(() => {
    const current = jobRef.current
    if (current && !isTerminalStatus(current.status)) return
    jobRef.current = null
    setJob(null)
    setNotice(null)
    setNetworkWarning(false)
  }, [])

  const subscribeFinished = useCallback((fn: (job: SiteJobView) => void) => {
    listenersRef.current.add(fn)
    return () => {
      listenersRef.current.delete(fn)
    }
  }, [])

  const active = job && !isTerminalStatus(job.status) ? job : null
  const elapsedMs = job ? jobElapsedMs(job, now, offset) : 0

  const value = useMemo<SiteJobContextValue>(
    () => ({ siteId, job, active, elapsedMs, notice, networkWarning, starting, startJob, dismiss, subscribeFinished }),
    [siteId, job, active, elapsedMs, notice, networkWarning, starting, startJob, dismiss, subscribeFinished]
  )

  return <SiteJobContext.Provider value={value}>{children}</SiteJobContext.Provider>
}

export function useSiteJob(): SiteJobContextValue {
  const ctx = useContext(SiteJobContext)
  if (!ctx) throw new Error("useSiteJob, SiteJobProvider içinde kullanılmalı.")
  return ctx
}

/** İş bitince `fn` çağrılır (ör. kartın kendi listesini yenilemesi için). */
export function useSiteJobFinished(fn: (job: SiteJobView) => void) {
  const { subscribeFinished } = useSiteJob()
  const fnRef = useRef(fn)
  useEffect(() => {
    fnRef.current = fn
  }, [fn])
  useEffect(() => subscribeFinished((job) => fnRef.current(job)), [subscribeFinished])
}
