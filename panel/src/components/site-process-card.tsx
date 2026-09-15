"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Activity,
  Box,
  Download,
  Hammer,
  Loader2,
  Play,
  RefreshCw,
  Rocket,
  RotateCw,
  Square,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTranslation } from "@/components/language-provider"
import { PROCESS_MANAGER_LABELS, type ApiSite } from "@/lib/site-adapter"
import { cn } from "@/lib/utils"

interface ContainerStatus {
  name: string
  service: string
  state: string
  status: string
}

interface ProcessStatusResponse {
  process: {
    manager: string
    state: "running" | "stopped" | "partial" | "failed" | "unknown" | "not-applicable"
    detail: string
    containers?: ContainerStatus[]
    memoryBytes?: number | null
  }
  upstream: {
    target: string
    reachable: boolean
    latencyMs: number | null
    error: string | null
  } | null
  checkedAt: string
}

type ComposeAction = "up" | "down" | "restart" | "rebuild" | "pull"
type ServiceAction = "start" | "stop" | "restart"

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

async function parseError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  return data?.error ?? `İstek başarısız oldu (${res.status}).`
}

const STATE_STYLES: Record<ProcessStatusResponse["process"]["state"], { tr: string; en: string; cls: string }> = {
  running: { tr: "Çalışıyor", en: "Running", cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900" },
  partial: { tr: "Kısmen çalışıyor", en: "Partially running", cls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900" },
  stopped: { tr: "Durdu", en: "Stopped", cls: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700" },
  failed: { tr: "Hata", en: "Failed", cls: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900" },
  unknown: { tr: "Bilinmiyor", en: "Unknown", cls: "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700" },
  "not-applicable": { tr: "Panel yönetmiyor", en: "Not managed", cls: "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700" },
}

const btnBase =
  "h-9 px-3.5 rounded-xl border border-border bg-card text-xs font-semibold cursor-pointer disabled:opacity-50"

/**
 * Süreç & Durum kartı (2026-09-15): sitenin GERÇEK durumu (systemd / compose
 * ps / pm2 + hedef portta dinleyen var mı) ve süreç yöneticisine göre doğru
 * kontroller. Eskiden Docker sitelerinde systemd butonları gösterilip 400
 * dönüyordu; ters proxy'de hiçbir kontrol yoktu.
 */
export function SiteProcessCard({
  site,
  onSiteUpdate,
}: {
  site: ApiSite
  onSiteUpdate: (site: ApiSite) => void
}) {
  const { lang } = useTranslation()
  const [status, setStatus] = useState<ProcessStatusResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string; output?: string } | null>(null)

  const hasSystemd = (site.type === "NODEJS" || site.type === "PYTHON") && site.processManager === "SYSTEMD"
  const isCompose = site.processManager === "DOCKER_COMPOSE"
  const isNone = site.processManager === "NONE"

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/sites/${site.id}/process-status`, { cache: "no-store" })
      if (res.ok) setStatus((await res.json()) as ProcessStatusResponse)
    } catch {
      // sessizce
    } finally {
      setLoading(false)
    }
  }, [site.id])

  useEffect(() => {
    const timer = setTimeout(load, 0)
    const interval = setInterval(load, 20_000)
    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [load])

  async function runServiceAction(action: ServiceAction) {
    setPending(action)
    setMessage(null)
    try {
      const res = await fetch(`/api/sites/${site.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        setMessage({ ok: false, text: await parseError(res) })
        return
      }
      const data = (await res.json()) as ApiSite
      onSiteUpdate(data)
      setMessage({ ok: true, text: lang === "en" ? `${action} completed.` : `${action} tamamlandı.` })
      await load()
    } catch {
      setMessage({ ok: false, text: lang === "en" ? "Could not reach the server." : "Sunucuya bağlanılamadı." })
    } finally {
      setPending(null)
    }
  }

  async function runCompose(action: ComposeAction) {
    setPending(action)
    setMessage(null)
    try {
      const res = await fetch(`/api/sites/${site.id}/docker-compose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const data = (await res.json().catch(() => null)) as (ApiSite & { output?: string; process?: ProcessStatusResponse["process"]; error?: string }) | null
      if (!res.ok || !data) {
        setMessage({ ok: false, text: data?.error ?? `İstek başarısız oldu (${res.status}).` })
        return
      }
      onSiteUpdate(data)
      setMessage({ ok: true, text: `docker compose ${action === "rebuild" ? "up -d --build" : action} ${lang === "en" ? "completed." : "tamamlandı."}`, output: data.output })
      await load()
    } catch {
      setMessage({ ok: false, text: lang === "en" ? "Could not reach the server." : "Sunucuya bağlanılamadı." })
    } finally {
      setPending(null)
    }
  }

  async function runDeploy() {
    setPending("deploy")
    setMessage(null)
    try {
      const res = await fetch(`/api/sites/${site.id}/deploy`, { method: "POST" })
      const data = (await res.json().catch(() => null)) as
        | (Partial<ApiSite> & { error?: string; restartError?: string | null; deployOutput?: string; pullChanged?: boolean; site?: ApiSite })
        | null
      if (!data) {
        setMessage({ ok: false, text: lang === "en" ? "Could not reach the server." : "Sunucuya bağlanılamadı." })
        return
      }
      if (!res.ok) {
        if (data.site) onSiteUpdate(data.site)
        setMessage({ ok: false, text: data.error ?? "Deploy başarısız oldu.", output: data.deployOutput })
        return
      }
      onSiteUpdate(data as ApiSite)
      setMessage({
        ok: !data.restartError,
        text: data.restartError
          ? (lang === "en" ? `Deployed, but restart failed: ${data.restartError}` : `Deploy edildi ama yeniden başlatma başarısız: ${data.restartError}`)
          : (lang === "en" ? "Deployed and restarted." : "Deploy edildi ve yeniden başlatıldı."),
        output: data.deployOutput,
      })
      await load()
    } catch {
      setMessage({ ok: false, text: lang === "en" ? "Could not reach the server." : "Sunucuya bağlanılamadı." })
    } finally {
      setPending(null)
    }
  }

  const state = status?.process.state ?? "unknown"
  const stateStyle = STATE_STYLES[state]
  const managerLabel = PROCESS_MANAGER_LABELS[site.processManager]?.[lang === "en" ? "en" : "tr"] ?? site.processManager

  return (
    <div className="rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-6 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="font-heading font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
            <Activity className="size-4 text-[#580619] dark:text-[#38bdf8]" />
            {lang === "en" ? "Process & Status" : "Süreç & Durum"}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {lang === "en" ? "Manager" : "Yönetici"}: <span className="font-mono">{managerLabel}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border", stateStyle.cls)}>
            <span className={cn("size-1.5 rounded-full", state === "running" ? "bg-emerald-500 animate-pulse" : state === "failed" ? "bg-red-500" : "bg-slate-400")} />
            {lang === "en" ? stateStyle.en : stateStyle.tr}
          </span>
          <button
            type="button"
            onClick={load}
            title={lang === "en" ? "Refresh" : "Yenile"}
            className="size-8 rounded-lg border border-border bg-card text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 flex items-center justify-center cursor-pointer"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {status?.process.detail && (
        <p className="text-xs text-slate-600 dark:text-slate-300 font-mono">
          {status.process.detail}
          {typeof status.process.memoryBytes === "number" && (
            <span className="ml-2 text-slate-500 dark:text-slate-400">· RAM {formatBytes(status.process.memoryBytes)}</span>
          )}
        </p>
      )}

      {status?.upstream && (
        <div
          className={cn(
            "flex items-center justify-between gap-3 rounded-xl border p-3 text-xs",
            status.upstream.reachable
              ? "border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300"
              : "border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/20 text-amber-900 dark:text-amber-300"
          )}
        >
          <span>
            {lang === "en" ? "Upstream" : "Hedef"}: <span className="font-mono">{status.upstream.target}</span>
          </span>
          <span className="font-semibold shrink-0">
            {status.upstream.reachable
              ? (lang === "en" ? `listening (${status.upstream.latencyMs} ms)` : `dinliyor (${status.upstream.latencyMs} ms)`)
              : (lang === "en" ? `nothing listening (${status.upstream.error ?? "—"}) — visitors get 502` : `dinleyen yok (${status.upstream.error ?? "—"}) — ziyaretçi 502 görür`)}
          </span>
        </div>
      )}

      {status?.process.containers && status.process.containers.length > 0 && (
        <div className="rounded-xl border border-border divide-y divide-border text-xs">
          {status.process.containers.map((c) => (
            <div key={c.name} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="font-mono text-slate-800 dark:text-slate-200 truncate">
                <Box className="size-3.5 inline mr-1.5 text-slate-400" />
                {c.service || c.name}
              </span>
              <span className={cn("shrink-0 font-semibold", c.state === "running" ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500")}>
                {c.status || c.state}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {hasSystemd && (
          <>
            <Button variant="outline" size="sm" disabled={pending !== null} onClick={() => runServiceAction("start")} className={cn(btnBase, "text-emerald-700 dark:text-emerald-400")}>
              {pending === "start" ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Play className="size-3.5 mr-1" />}
              {lang === "en" ? "Start" : "Başlat"}
            </Button>
            <Button variant="outline" size="sm" disabled={pending !== null} onClick={() => runServiceAction("stop")} className={btnBase}>
              {pending === "stop" ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Square className="size-3.5 mr-1" />}
              {lang === "en" ? "Stop" : "Durdur"}
            </Button>
            <Button variant="outline" size="sm" disabled={pending !== null} onClick={() => runServiceAction("restart")} className={btnBase}>
              {pending === "restart" ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <RotateCw className="size-3.5 mr-1" />}
              {lang === "en" ? "Restart" : "Yeniden Başlat"}
            </Button>
          </>
        )}
        {isCompose && (
          <>
            <Button variant="outline" size="sm" disabled={pending !== null} onClick={() => runCompose("up")} className={cn(btnBase, "text-emerald-700 dark:text-emerald-400")}>
              {pending === "up" ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Play className="size-3.5 mr-1" />}
              up
            </Button>
            <Button variant="outline" size="sm" disabled={pending !== null} onClick={() => runCompose("down")} className={btnBase}>
              {pending === "down" ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Square className="size-3.5 mr-1" />}
              down
            </Button>
            <Button variant="outline" size="sm" disabled={pending !== null} onClick={() => runCompose("restart")} className={btnBase}>
              {pending === "restart" ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <RotateCw className="size-3.5 mr-1" />}
              restart
            </Button>
            <Button variant="outline" size="sm" disabled={pending !== null} onClick={() => runCompose("rebuild")} className={cn(btnBase, "text-[#580619] dark:text-blue-300")} title="docker compose up -d --build --remove-orphans">
              {pending === "rebuild" ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Hammer className="size-3.5 mr-1" />}
              {lang === "en" ? "Rebuild (up --build)" : "Yeniden derle (up --build)"}
            </Button>
            <Button variant="outline" size="sm" disabled={pending !== null} onClick={() => runCompose("pull")} className={btnBase} title="docker compose pull">
              {pending === "pull" ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Download className="size-3.5 mr-1" />}
              pull
            </Button>
          </>
        )}
        {!hasSystemd && !isCompose && !isNone && (
          <Button variant="outline" size="sm" disabled={pending !== null} onClick={() => runServiceAction("restart")} className={btnBase}>
            {pending === "restart" ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <RotateCw className="size-3.5 mr-1" />}
            {lang === "en" ? "Restart" : "Yeniden Başlat"}
          </Button>
        )}
        <Button
          size="sm"
          disabled={pending !== null}
          onClick={runDeploy}
          className="h-9 px-4 rounded-xl bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white text-xs font-semibold cursor-pointer border border-[#c8a87c]/40 dark:border-[#2a4687]/60"
          title={lang === "en" ? "pull → deploy command → restart (forced)" : "pull → deploy komutu → yeniden başlatma (zorla)"}
        >
          {pending === "deploy" ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Rocket className="size-3.5 mr-1" />}
          {lang === "en" ? "Deploy" : "Deploy Et"}
        </Button>
      </div>

      {isNone && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {lang === "en"
            ? "Process manager is \"None\": the panel does not start or restart anything for this site. Pick Docker Compose / PM2 / custom script in the Git & Deployment tab to enable controls and automatic restarts after a pull."
            : "Süreç yöneticisi \"Yok\": panel bu site için hiçbir şeyi başlatmaz/yeniden başlatmaz. Git & Dağıtım sekmesinden Docker Compose / PM2 / özel betik seçerseniz kontroller ve pull sonrası otomatik yeniden başlatma açılır."}
        </p>
      )}

      {message && (
        <div
          className={cn(
            "rounded-xl border p-3 text-xs space-y-2",
            message.ok
              ? "border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
              : "border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
          )}
        >
          <p className="font-mono">{message.text}</p>
          {message.output && (
            <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900 dark:bg-[#030610] p-3 font-mono text-[11px] text-slate-100 whitespace-pre-wrap">{message.output}</pre>
          )}
        </div>
      )}
    </div>
  )
}
