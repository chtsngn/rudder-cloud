"use client"

import { useEffect, useRef } from "react"
import { AlertTriangle, CheckCircle2, Info, Loader2, WifiOff, X, XCircle } from "lucide-react"

import { useTranslation } from "@/components/language-provider"
import { useSiteJob } from "@/hooks/use-site-job"
import {
  formatDuration,
  isTerminalStatus,
  jobOutcome,
  jobRunningLabel,
  jobTitle,
  triggerLabel,
  type Lang,
  type SiteJobKind,
  type SiteJobView,
} from "@/hooks/site-job-utils"
import { cn } from "@/lib/utils"

/**
 * Bir düğmenin iş durumu: `busy` — sitede iş sürüyor ya da istek yolda (düğmeyi
 * kapat); `label` — süren iş bu düğmeye aitse "Deploy sürüyor… (2 dk 14 sn)";
 * `starting` — bu düğmenin isteği yolda.
 */
export function useJobButton(key: string, match: (job: SiteJobView) => boolean) {
  const { lang } = useTranslation()
  const l: Lang = lang === "en" ? "en" : "tr"
  const { active, starting, elapsedMs } = useSiteJob()
  const mine = !!active && match(active)
  return {
    busy: !!active || starting !== null,
    starting: starting === key,
    spinning: starting === key || mine,
    label: active && mine ? `${jobRunningLabel(active, l)} (${formatDuration(elapsedMs, l)})` : null,
  }
}

/**
 * Sitenin arka plan işinin durumu: etiket, faz, geçen süre, canlı çıktı ve
 * bitince sonuç. `kinds` dışındaki bir iş sürüyorsa yalnızca tek satırlık bir
 * not gösterilir (düğmelerin neden kapalı olduğunu anlatmak için); 409 ile o işe
 * bağlanıldıysa tam panel gösterilir.
 */
export function SiteJobStatus({ kinds, className }: { kinds: SiteJobKind[]; className?: string }) {
  const { lang } = useTranslation()
  const l: Lang = lang === "en" ? "en" : "tr"
  const en = l === "en"
  const { job, elapsedMs, notice, networkWarning, dismiss } = useSiteJob()

  const preRef = useRef<HTMLPreElement | null>(null)
  const stickRef = useRef(true)
  const output = job?.output ?? ""

  useEffect(() => {
    const el = preRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [output])

  if (!job) return null

  const terminal = isTerminalStatus(job.status)
  const relevant = kinds.includes(job.kind) || notice === "already-running"

  if (!relevant) {
    if (terminal) return null
    return (
      <p className={cn("flex items-center gap-1.5 text-[11px] text-muted-foreground", className)}>
        <Loader2 className="size-3 animate-spin shrink-0" />
        {en ? "Another job is running on this site" : "Bu sitede başka bir iş sürüyor"}: {jobTitle(job, l)} · {jobRunningLabel(job, l)} ({formatDuration(elapsedMs, l)})
      </p>
    )
  }

  const outcome = terminal ? jobOutcome(job, l) : null
  const tone = outcome?.tone ?? "running"
  const trig = triggerLabel(job.trigger, l)

  const boxCls =
    tone === "success"
      ? "border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
      : tone === "error"
        ? "border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
        : tone === "warning"
          ? "border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300"
          : "border-border bg-muted/30 text-foreground"

  const Icon = tone === "success" ? CheckCircle2 : tone === "error" ? XCircle : tone === "warning" ? AlertTriangle : Loader2

  return (
    <div className={cn("rounded-xl border p-3 text-xs space-y-2", boxCls, className)} aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Icon className={cn("size-4 shrink-0 mt-px", tone === "running" && "animate-spin text-muted-foreground")} />
          <div className="min-w-0">
            <p className="font-semibold break-words">
              {outcome ? outcome.text : jobRunningLabel(job, l)}
            </p>
            <p className="text-[11px] opacity-80 font-mono break-words">
              {jobTitle(job, l)}
              {!terminal && job.phase ? ` · ${job.phase}` : ""}
              {trig ? ` · ${trig}` : ""}
              {job.actor ? ` · ${job.actor}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-mono text-[11px] tabular-nums opacity-80">{formatDuration(elapsedMs, l)}</span>
          {terminal && (
            <button
              type="button"
              onClick={dismiss}
              title={en ? "Close" : "Kapat"}
              className="size-6 rounded-md flex items-center justify-center opacity-70 hover:opacity-100 cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {notice === "already-running" && (
        <p className="flex items-center gap-1.5 text-[11px] text-sky-700 dark:text-sky-300">
          <Info className="size-3.5 shrink-0" />
          {en ? "A job is already running on this site — showing it." : "Bu sitede zaten bir iş sürüyor — ona bağlanıldı."}
        </p>
      )}

      {networkWarning && !terminal && (
        <p className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
          <WifiOff className="size-3.5 shrink-0" />
          {en
            ? "Cannot reach the server right now, retrying… The job keeps running on the server."
            : "Sunucuya şu an ulaşılamıyor, yeniden deneniyor… İş sunucuda sürmeye devam eder."}
        </p>
      )}

      {(output || !terminal) && (
        <pre
          ref={preRef}
          onScroll={(e) => {
            const el = e.currentTarget
            stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
          }}
          className="h-64 overflow-auto rounded-lg bg-slate-900 dark:bg-[#030610] p-3 font-mono text-[11px] text-slate-100 whitespace-pre-wrap break-words"
        >
          {output || (job.status === "queued" ? (en ? "Queued…" : "Sırada…") : en ? "Waiting for output…" : "Çıktı bekleniyor…")}
        </pre>
      )}
    </div>
  )
}
