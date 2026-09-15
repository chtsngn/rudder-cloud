"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { createPortal } from "react-dom"
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Code2,
  Database,
  FolderOpen,
  GitBranch,
  Globe,
  Layers,
  Loader2,
  Server,
  Settings2,
  ShieldAlert,
  Terminal,
  Trash2,
  Users,
  Box,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BusyPortsHint } from "@/components/busy-ports-hint"
import { SiteAccessCard } from "@/components/site-access-card"
import { SiteBackupCard } from "@/components/site-backup-card"
import { SiteDeployHookCard } from "@/components/site-deploy-hook-card"
import { SiteGitCard } from "@/components/site-git-card"
import { SiteProcessCard } from "@/components/site-process-card"
import { SiteFileEditor } from "@/components/site-file-editor"
import { SiteFileManager } from "@/components/site-file-manager"
import { SITE_TYPES, type Site, type SiteType } from "@/lib/mock-data"
import { apiSiteToUiSite, GIT_CAPABLE_DB_TYPES, sitePortFromConfig, type ApiSite } from "@/lib/site-adapter"
import { useTranslation } from "@/components/language-provider"
import { useTerminalDock } from "@/components/terminal-dock-context"
import { useCurrentUser } from "@/hooks/use-current-user"
import { cn } from "@/lib/utils"

const STATUS_CONFIG: Record<Site["status"], { label: string; dot: string; badge: string }> = {
  active: { label: "Aktif", dot: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]", badge: "bg-emerald-50 text-emerald-700 border-emerald-200/80" },
  running: { label: "Çalışıyor", dot: "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]", badge: "bg-emerald-50 text-emerald-700 border-emerald-200/80" },
  stopped: { label: "Durduruldu", dot: "bg-slate-400", badge: "bg-slate-100 text-slate-600 border-slate-200" },
  provisioning: { label: "Kuruluyor", dot: "bg-amber-500 animate-pulse", badge: "bg-amber-50 text-amber-700 border-amber-200/80" },
  error: { label: "Hata", dot: "bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]", badge: "bg-red-50 text-red-700 border-red-200/80" },
}

type ActiveTab = "overview" | "git" | "files" | "backups" | "access" | "logs"
const TAB_IDS: ActiveTab[] = ["overview", "git", "files", "backups", "access", "logs"]

function parentDirOf(filePath: string): string {
  return filePath.split("/").slice(0, -1).join("/")
}

interface DnsCheck {
  ok: boolean
  matches: boolean
  cloudflare: boolean
  resolved: string[]
  server: string[]
  message: string
}

function renderTypeIcon(type: SiteType) {
  const cls = "size-6"
  switch (type) {
    case "nodejs":
      return <Code2 className={cls} />
    case "python":
      return <Layers className={cls} />
    case "proxy":
      return <Server className={cls} />
    case "docker":
      return <Box className={cls} />
    default:
      return <Globe className={cls} />
  }
}

const tabBtn = (active: boolean) =>
  cn(
    "flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer shrink-0 whitespace-nowrap",
    active ? "border-[#580619] text-[#580619] dark:border-[#38bdf8] dark:text-[#38bdf8]" : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
  )
const tabIcon = (active: boolean) => cn("size-4", active ? "text-[#580619] dark:text-[#38bdf8]" : "text-slate-400 dark:text-slate-500")
const panelCls = "rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-6 shadow-xs space-y-4"
const inputCls = "font-mono text-xs h-10 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100"
const primaryBtn = "bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white h-10 px-5 rounded-xl text-xs font-semibold shrink-0 cursor-pointer border border-[#c8a87c]/40 dark:border-[#2a4687]/60"

export default function SiteDetailPage() {
  const { t, lang } = useTranslation()
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { openDock } = useTerminalDock()
  const { user: me } = useCurrentUser()
  const isSuperAdmin = me?.role === "SUPER_ADMIN"

  const [api, setApi] = useState<ApiSite | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  // Sekme ve dosya durumu URL'de (?tab=files&dir=... / &file=...) — yenileme
  // ve geri tuşu aynı yere döner, eski /files bağlantıları buraya yönlenir.
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const tab = searchParams.get("tab") ?? ""
    return (TAB_IDS as string[]).includes(tab) ? (tab as ActiveTab) : "overview"
  })
  const [filesDir, setFilesDir] = useState(() => searchParams.get("dir") ?? "")
  const [editingFile, setEditingFile] = useState<string | null>(() => searchParams.get("file"))

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteRemoveFolder, setDeleteRemoveFolder] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [sslRetrying, setSslRetrying] = useState(false)
  const [sslRetryError, setSslRetryError] = useState<string | null>(null)
  const [dnsCheck, setDnsCheck] = useState<DnsCheck | null>(null)

  const [logs, setLogs] = useState("")
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState<string | null>(null)

  const [upstreamUrl, setUpstreamUrl] = useState("")
  const [upstreamSaving, setUpstreamSaving] = useState(false)
  const [upstreamSaveError, setUpstreamSaveError] = useState<string | null>(null)
  const [upstreamSaveOk, setUpstreamSaveOk] = useState(false)

  const [appPort, setAppPort] = useState("")
  const [appStart, setAppStart] = useState("")
  const [appSaving, setAppSaving] = useState(false)
  const [appSaveError, setAppSaveError] = useState<string | null>(null)
  const [appSaveOk, setAppSaveOk] = useState(false)

  function syncUrl(next: { tab: ActiveTab; dir?: string; file?: string | null }) {
    const qs = new URLSearchParams()
    if (next.tab !== "overview") qs.set("tab", next.tab)
    if (next.tab === "files") {
      if (next.file) qs.set("file", next.file)
      else if (next.dir) qs.set("dir", next.dir)
    }
    const query = qs.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  function selectTab(tab: ActiveTab) {
    setActiveTab(tab)
    syncUrl({ tab, dir: filesDir, file: tab === "files" ? editingFile : null })
  }

  function openFile(filePath: string) {
    setEditingFile(filePath)
    syncUrl({ tab: "files", file: filePath })
  }

  function openFilesDir(dir: string) {
    setEditingFile(null)
    setFilesDir(dir)
    syncUrl({ tab: "files", dir })
  }

  const applySite = useCallback((data: ApiSite) => {
    setApi(data)
    const cfg = (data.config ?? {}) as Record<string, unknown>
    setUpstreamUrl(typeof cfg.upstreamUrl === "string" ? cfg.upstreamUrl : "")
    setAppPort(sitePortFromConfig(cfg) !== null ? String(sitePortFromConfig(cfg)) : "")
    setAppStart(typeof cfg.startCommand === "string" ? cfg.startCommand : "")
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/sites/${params.id}`, { cache: "no-store" })
        if (res.status === 404) {
          if (!cancelled) setNotFound(true)
          return
        }
        if (!res.ok) throw new Error("failed")
        const data = (await res.json()) as ApiSite
        if (!cancelled) applySite(data)
      } catch {
        if (!cancelled) setNotFound(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [params.id, applySite])

  const site = api ? apiSiteToUiSite(api) : null
  const config = (api?.config ?? {}) as Record<string, unknown>
  const hasSystemd = api?.type === "NODEJS" || api?.type === "PYTHON"
  const isProxy = api?.type === "REVERSE_PROXY"
  const isDocker = api?.type === "DOCKER"
  const gitCapable = !!api && (GIT_CAPABLE_DB_TYPES as string[]).includes(api.type)
  const isCompose = api?.processManager === "DOCKER_COMPOSE"
  const showLogsTab = hasSystemd || isCompose
  const logsSource: "journal" | "compose" = isCompose ? "compose" : "journal"

  const loadLogs = useCallback(async () => {
    if (!api || !showLogsTab) return
    setLogsLoading(true)
    setLogsError(null)
    try {
      const endpoint = logsSource === "compose" ? "docker-logs" : "logs"
      const res = await fetch(`/api/sites/${api.id}/${endpoint}?lines=200`, { cache: "no-store" })
      const data = (await res.json().catch(() => null)) as { logs?: string; error?: string } | null
      if (!res.ok || !data) {
        setLogsError(data?.error ?? "Loglar alınamadı.")
        return
      }
      setLogs(data.logs ?? "")
    } catch {
      setLogsError("Sunucuya bağlanılamadı.")
    } finally {
      setLogsLoading(false)
    }
  }, [api, showLogsTab, logsSource])

  useEffect(() => {
    if (activeTab !== "logs") return
    const timer = setTimeout(() => {
      loadLogs()
    }, 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, api?.id, logsSource])

  useEffect(() => {
    if (!api || api.sslStatus !== "error") return
    let cancelled = false
    fetch(`/api/sites/${api.id}/dns-check`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: DnsCheck | null) => {
        if (!cancelled && data) setDnsCheck(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [api?.id, api?.sslStatus, api])

  async function handleUpstreamSave() {
    if (!api) return
    const trimmed = upstreamUrl.trim()
    if (!trimmed) {
      setUpstreamSaveError("Hedef adres boş olamaz.")
      return
    }
    setUpstreamSaving(true)
    setUpstreamSaveError(null)
    setUpstreamSaveOk(false)
    try {
      const res = await fetch(`/api/sites/${api.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upstreamUrl: trimmed }),
      })
      const data = (await res.json().catch(() => null)) as (ApiSite & { error?: string }) | null
      if (!res.ok || !data) {
        setUpstreamSaveError(data?.error ?? "Hedef adres güncellenemedi.")
        return
      }
      applySite(data)
      setUpstreamSaveOk(true)
    } catch {
      setUpstreamSaveError("Sunucuya bağlanılamadı.")
    } finally {
      setUpstreamSaving(false)
    }
  }

  async function handleAppSettingsSave() {
    if (!api) return
    setAppSaving(true)
    setAppSaveError(null)
    setAppSaveOk(false)
    try {
      const payload: Record<string, unknown> = { port: Number(appPort) }
      if (hasSystemd) payload.startCommand = appStart.trim()
      const res = await fetch(`/api/sites/${api.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = (await res.json().catch(() => null)) as (ApiSite & { error?: string }) | null
      if (!res.ok || !data) {
        setAppSaveError(data?.error ?? "Kaydedilemedi.")
        return
      }
      applySite(data)
      setAppSaveOk(true)
    } catch {
      setAppSaveError("Sunucuya bağlanılamadı.")
    } finally {
      setAppSaving(false)
    }
  }

  async function handleDelete() {
    if (!api) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const qs = deleteRemoveFolder ? "?removeFolder=true&removeUser=true" : ""
      const res = await fetch(`/api/sites/${api.id}${qs}`, { method: "DELETE" })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        setDeleteError(data?.error ?? "Site silinemedi.")
        return
      }
      router.push("/sites")
      router.refresh()
    } catch {
      setDeleteError("Sunucuya bağlanılamadı.")
    } finally {
      setDeleting(false)
    }
  }

  async function handleRetrySsl(force = false) {
    if (!api) return
    setSslRetrying(true)
    setSslRetryError(null)
    try {
      const res = await fetch(`/api/sites/${api.id}/ssl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      })
      const data = (await res.json().catch(() => null)) as (ApiSite & { error?: string; dns?: DnsCheck }) | null
      if (!data) {
        setSslRetryError("Sunucuya bağlanılamadı.")
        return
      }
      if (data.dns) setDnsCheck(data.dns)
      if (typeof data.id === "string") applySite(data)
      if (!res.ok) setSslRetryError(data.error ?? "SSL sertifikası alınamadı.")
    } catch {
      setSslRetryError("Sunucuya bağlanılamadı.")
    } finally {
      setSslRetrying(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-400">
        <Loader2 className="size-6 animate-spin text-[#580619]" />
      </div>
    )
  }

  if (notFound || !api || !site) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href="/sites" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:text-[#580619] hover:border-[#c8a87c] shadow-xs transition-all">
          <ArrowLeft className="size-3.5" />
          {t("sites.detail.backToList")}
        </Link>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          {lang === "en" ? "Site not found or may have been deleted." : "Site bulunamadı veya silinmiş olabilir."}
        </div>
      </div>
    )
  }

  const typeInfo = SITE_TYPES.find((tItem) => tItem.type === site.type)!
  const status = STATUS_CONFIG[site.status] ?? STATUS_CONFIG.stopped
  const statusLabels: Record<string, string> = {
    active: t("sites.statusActive"),
    running: t("sites.statusRunning"),
    provisioning: t("sites.statusProvisioning"),
    stopped: t("sites.statusStopped"),
    error: t("sites.statusFailed"),
  }
  const localizedTypeLabel = t(`sites.types.${site.type}.label`) || typeInfo.label
  const linuxUser = typeof config.linuxUser === "string" && config.linuxUser ? config.linuxUser : null
  const workdir =
    typeof config.workingDir === "string" && config.workingDir
      ? config.workingDir
      : typeof config.siteRoot === "string" && config.siteRoot
        ? config.siteRoot
        : `/var/www/${site.domain}`
  const siteUrl = `${api.sslStatus === "active" ? "https" : "http"}://${site.domain}`

  const configRows: Array<{ label: string; value: string }> = [
    { label: t("sites.detail.domainLabel"), value: site.domain },
    ...(hasSystemd || isDocker ? [{ label: t("sites.detail.appPortLabel"), value: String(sitePortFromConfig(config) ?? "-") }] : []),
    ...(hasSystemd ? [{ label: t("sites.detail.startCmdLabel"), value: String(config.startCommand ?? "-") }] : []),
    ...(isProxy ? [{ label: t("sites.detail.upstreamLabel"), value: String(config.upstreamUrl ?? "-") }] : []),
    { label: gitCapable ? (lang === "en" ? "Site folder" : "Site klasörü") : t("sites.detail.siteRootLabel"), value: workdir },
    { label: t("sites.detail.linuxUserLabel"), value: linuxUser ?? (lang === "en" ? "— (set up from the Access tab)" : "— (Erişim sekmesinden kurulabilir)") },
    {
      label: t("sites.detail.sslStatusLabel"),
      value: !api.sslEnabled && api.sslStatus !== "active"
        ? t("sites.detail.sslInactive")
        : api.sslStatus === "active"
          ? t("sites.detail.sslActiveLetsEncrypt")
          : api.sslStatus === "error"
            ? t("sites.detail.sslErrorPending")
            : t("sites.detail.sslPending"),
    },
    ...(hasSystemd ? [{ label: t("sites.detail.systemdUnitLabel"), value: `site-${site.domain.replace(/\./g, "-")}.service` }] : []),
  ]

  return (
    <div className="max-w-7xl mx-auto space-y-7 pb-12">
      {/* ═══ 1. BAŞLIK ═══ */}
      <div className="space-y-4 pb-5 border-b border-border">
        <Link href="/sites" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-card text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-[#580619] dark:hover:text-[#38bdf8] hover:border-[#c8a87c] dark:hover:border-[#38bdf8]/50 shadow-xs transition-all">
          <ArrowLeft className="size-3.5 text-[#580619] dark:text-[#38bdf8]" />
          {t("sites.detail.backToList")}
        </Link>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="size-12 rounded-2xl bg-[#580619]/10 dark:bg-sky-500/15 border border-[#580619]/20 dark:border-sky-500/30 flex items-center justify-center text-[#580619] dark:text-[#38bdf8] font-mono text-xs font-black shadow-sm shrink-0">
              {renderTypeIcon(site.type)}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="font-heading text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">{site.domain}</h1>
                <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border shadow-2xs", status.badge)}>
                  <span className={cn("size-1.5 rounded-full", status.dot)} />
                  {statusLabels[site.status] ?? status.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 font-sans flex items-center gap-2">
                <span>{localizedTypeLabel} {t("sites.siteSuffix")}</span>
                <span>•</span>
                <span>{api.sslStatus === "active" ? t("sites.sslActiveLabel") : t("sites.httpOnlyLabel")}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button asChild variant="outline" size="sm" className="h-9 px-3 rounded-xl border border-border bg-card text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-[#580619] dark:hover:text-[#38bdf8] hover:border-[#c8a87c] dark:hover:border-[#38bdf8]/50 shadow-2xs">
              <a href={siteUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5">
                <Globe className="size-3.5" />
                {t("sites.openSiteBtn")}
                <ArrowUpRight className="size-3 text-muted-foreground" />
              </a>
            </Button>
            {isSuperAdmin && (
              <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)} disabled={deleting} className="h-9 px-3 rounded-xl border-red-200 dark:border-red-900/60 bg-white dark:bg-[#090e1f] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-300 text-xs font-semibold shadow-2xs">
                <Trash2 className="size-3.5" />
                {t("sites.deleteSiteBtn")}
              </Button>
            )}
          </div>
        </div>

        {api.status === "FAILED" && typeof config.provisionError === "string" && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-xs text-red-700 dark:text-red-300 font-mono">
            {config.provisionError}
          </div>
        )}

        {/* SSL hata bandı + DNS ön kontrolü */}
        {api.sslStatus === "error" && (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-200/80 dark:border-[#16223f] bg-amber-50/60 dark:bg-[#090e1f] p-4 text-xs text-amber-900 dark:text-slate-200 shadow-2xs">
            <div className="flex items-start gap-3">
              <div className="size-8 rounded-xl bg-amber-500/10 dark:bg-[#101c38] border border-amber-500/30 dark:border-[#1e3568]/50 flex items-center justify-center shrink-0 mt-0.5">
                <ShieldAlert className="size-4.5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-heading font-bold text-slate-900 dark:text-slate-100 text-xs">
                  {lang === "en" ? "SSL certificate is not active, the site is served over HTTP." : "SSL sertifikası aktif değil, site HTTP üzerinden yayında."}
                </p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 font-sans break-words">
                  {api.sslLastError || (lang === "en" ? "Make sure your DNS A record points to this server, then retry." : "DNS A kaydının bu sunucuya yönlendiğinden emin olduktan sonra tekrar deneyin.")}
                </p>
                {dnsCheck && (
                  <p className={cn("text-[11px] mt-1 font-mono break-words", dnsCheck.ok ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-300")}>
                    DNS: {dnsCheck.message}
                  </p>
                )}
                {sslRetryError && <p className="text-[11px] text-red-600 dark:text-red-400 mt-1 font-mono break-words">{sslRetryError}</p>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:pl-11">
              <Button size="sm" variant="outline" disabled={sslRetrying} onClick={() => handleRetrySsl(false)} className="h-8 rounded-xl border-amber-300 dark:border-[#16223f] bg-white dark:bg-[#060a17] text-amber-900 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-[#111f40] text-xs font-semibold">
                {sslRetrying && <Loader2 className="size-3 animate-spin mr-1" />}
                {lang === "en" ? "Retry SSL" : "SSL'i Yeniden Dene"}
              </Button>
              {dnsCheck && !dnsCheck.ok && (
                <Button size="sm" variant="ghost" disabled={sslRetrying} onClick={() => handleRetrySsl(true)} className="h-8 rounded-xl text-xs text-slate-600 dark:text-slate-300">
                  {lang === "en" ? "Skip DNS check and force" : "DNS kontrolünü atla, zorla"}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══ 2. SEKMELER ═══ */}
      <div className="flex items-center gap-1.5 border-b border-border pb-px overflow-x-auto no-scrollbar">
        <button type="button" onClick={() => selectTab("overview")} className={tabBtn(activeTab === "overview")}>
          <Settings2 className={tabIcon(activeTab === "overview")} />
          {t("sites.tabs.overview")}
        </button>
        {gitCapable && (
          <button type="button" onClick={() => selectTab("git")} className={tabBtn(activeTab === "git")}>
            <GitBranch className={tabIcon(activeTab === "git")} />
            {t("sites.tabs.git")}
          </button>
        )}
        <button type="button" onClick={() => selectTab("files")} className={tabBtn(activeTab === "files")}>
          <FolderOpen className={tabIcon(activeTab === "files")} />
          {t("sites.filesBtn")}
        </button>
        <button
          type="button"
          onClick={() => openDock({ id: site.id, promptUser: isSuperAdmin ? "root" : (linuxUser ?? "root") })}
          className={tabBtn(false)}
        >
          <Terminal className={tabIcon(false)} />
          Terminal
        </button>
        <button type="button" onClick={() => selectTab("backups")} className={tabBtn(activeTab === "backups")}>
          <Database className={tabIcon(activeTab === "backups")} />
          {t("sites.tabs.backups")}
        </button>
        <button type="button" onClick={() => selectTab("access")} className={tabBtn(activeTab === "access")}>
          <Users className={tabIcon(activeTab === "access")} />
          {t("sites.tabs.access")}
        </button>
        {showLogsTab && (
          <button type="button" onClick={() => selectTab("logs")} className={tabBtn(activeTab === "logs")}>
            <Terminal className={tabIcon(activeTab === "logs")} />
            {t("sites.tabs.logs")}
          </button>
        )}
      </div>

      {/* ═══ 3. GENEL BAKIŞ ═══ */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {gitCapable && <SiteProcessCard site={api} onSiteUpdate={applySite} />}

          {isProxy && (
            <div className={panelCls}>
              <div>
                <h3 className="font-heading font-bold text-slate-900 dark:text-slate-100 text-sm">{t("sites.detail.proxyPassTitle")}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t("sites.detail.proxyPassDesc")}</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <Input id="upstreamUrl" placeholder="http://127.0.0.1:3000" value={upstreamUrl} onChange={(e) => setUpstreamUrl(e.target.value)} className={inputCls} />
                <Button type="button" onClick={handleUpstreamSave} disabled={upstreamSaving || !upstreamUrl.trim()} className={primaryBtn}>
                  {upstreamSaving && <Loader2 className="size-3.5 animate-spin mr-1" />}
                  {upstreamSaving ? t("sites.detail.updatingBtn") : t("sites.detail.updateBtn")}
                </Button>
              </div>
              <BusyPortsHint />
              {upstreamSaveError && <p className="text-xs text-red-600 dark:text-red-400 font-mono">{upstreamSaveError}</p>}
              {upstreamSaveOk && !upstreamSaveError && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                  <Check className="size-3.5 stroke-[3]" />
                  {t("sites.detail.targetUpdated")}
                </p>
              )}
            </div>
          )}

          {(hasSystemd || isDocker) && isSuperAdmin && (
            <div className={panelCls}>
              <div>
                <h3 className="font-heading font-bold text-slate-900 dark:text-slate-100 text-sm">{lang === "en" ? "Application settings" : "Uygulama ayarları"}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {hasSystemd
                    ? (lang === "en" ? "Changing the port rewrites the Nginx upstream and the systemd unit, then restarts the service." : "Port değişince Nginx hedefi ve systemd birimi yeniden yazılır, servis yeniden başlatılır.")
                    : (lang === "en" ? "The port Nginx proxies to — must match the port your compose file publishes on 127.0.0.1." : "Nginx'in yönlendirdiği port — compose dosyanızın 127.0.0.1'de yayınladığı portla aynı olmalı.")}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
                <div className="space-y-1.5">
                  <Label htmlFor="appPort" className="text-xs font-bold text-slate-700 dark:text-slate-300">{t("sites.detail.appPortLabel")}</Label>
                  <Input id="appPort" type="number" value={appPort} onChange={(e) => setAppPort(e.target.value)} className={inputCls} />
                </div>
                {hasSystemd && (
                  <div className="space-y-1.5">
                    <Label htmlFor="appStart" className="text-xs font-bold text-slate-700 dark:text-slate-300">{t("sites.detail.startCmdLabel")}</Label>
                    <Input id="appStart" value={appStart} onChange={(e) => setAppStart(e.target.value)} className={inputCls} />
                  </div>
                )}
              </div>
              <BusyPortsHint />
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={handleAppSettingsSave} disabled={appSaving || !appPort} className={primaryBtn}>
                  {appSaving && <Loader2 className="size-3.5 animate-spin mr-1" />}
                  {t("common.save")}
                </Button>
                {appSaveOk && !appSaveError && <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">{lang === "en" ? "Saved and applied." : "Kaydedildi ve uygulandı."}</span>}
              </div>
              {appSaveError && <p className="text-xs text-red-600 dark:text-red-400 font-mono">{appSaveError}</p>}
            </div>
          )}

          <div className={panelCls}>
            <h3 className="font-heading font-bold text-slate-900 dark:text-slate-100 text-sm">{t("sites.detail.serverConfigDetails")}</h3>
            <div className="divide-y divide-slate-100 dark:divide-[#16223f]">
              {configRows.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-4 py-3 text-xs">
                  <span className="font-medium text-slate-500 dark:text-slate-400 shrink-0">{item.label}</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-right break-all">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ 4. GİT & DAĞITIM ═══ */}
      {activeTab === "git" && gitCapable && (
        <div className="space-y-6">
          <SiteGitCard site={api} isSuperAdmin={isSuperAdmin} onSiteUpdate={applySite} />
          <SiteDeployHookCard siteId={api.id} githubConnected={!!api.githubRepoFullName} />
        </div>
      )}

      {/* ═══ DOSYALAR — yönetici ve editör sekmenin içinde ═══ */}
      {activeTab === "files" && (
        <div className="space-y-6">
          {editingFile ? (
            <SiteFileEditor key={editingFile} siteId={api.id} path={editingFile} onBack={() => openFilesDir(parentDirOf(editingFile))} />
          ) : (
            <SiteFileManager
              key={filesDir}
              siteId={api.id}
              initialPath={filesDir}
              onOpenFile={openFile}
              onPathChange={(dir) => {
                setFilesDir(dir)
                syncUrl({ tab: "files", dir })
              }}
            />
          )}
        </div>
      )}

      {activeTab === "backups" && (
        <div className="space-y-6">
          <SiteBackupCard siteId={site.id} />
        </div>
      )}

      {activeTab === "access" && (
        <div className="space-y-6">
          <SiteAccessCard siteId={site.id} hasLinuxUser={!!linuxUser} canProvisionTerminalUser />
        </div>
      )}

      {/* ═══ 5. LOGLAR ═══ */}
      {activeTab === "logs" && showLogsTab && (
        <div className="rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-6 md:p-8 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#16223f] pb-4">
            <div>
              <h3 className="font-heading font-bold text-slate-900 dark:text-slate-100 text-base">{t("sites.detail.liveLogsTitle")}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {logsSource === "compose" ? "docker compose logs --tail 200" : t("sites.detail.liveLogsDesc")}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => loadLogs()} disabled={logsLoading} className="h-8 px-3 rounded-xl border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#060a17] text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer dark:hover:bg-[#111f40]">
              {logsLoading ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {t("common.refresh")}
            </Button>
          </div>
          {logsError ? (
            <p className="text-xs text-red-600 dark:text-red-400 font-mono">{logsError}</p>
          ) : (
            <pre className="max-h-96 overflow-auto rounded-xl bg-slate-900 dark:bg-[#030610] p-4 font-mono text-xs text-emerald-400 leading-relaxed shadow-inner border border-slate-800 dark:border-[#16223f]">
              {logsLoading && !logs ? t("sites.detail.logsLoading") : logs.trim() ? logs : t("sites.detail.logsEmpty")}
            </pre>
          )}
        </div>
      )}

      {/* ═══ SİLME DİYALOĞU ═══ */}
      {deleteOpen &&
        createPortal(
          <div onClick={(e) => e.target === e.currentTarget && !deleting && setDeleteOpen(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#0f141f] text-slate-900 dark:text-slate-200 shadow-2xl p-5 space-y-4">
              <h3 className="font-heading font-bold text-base">{t("sites.deleteSiteBtn")}: {site.domain}</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {lang === "en"
                  ? "The Nginx vhost, systemd unit, PHP-FPM pool and running compose containers are removed. Choose whether to also delete the files and the dedicated Linux user."
                  : "Nginx vhost, systemd birimi, PHP-FPM havuzu ve çalışan compose konteynerleri kaldırılır. Dosyaların ve dedicated Linux kullanıcısının da silinip silinmeyeceğini seçin."}
              </p>
              <label className="flex items-start gap-2.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/60 dark:bg-red-950/20 p-3 text-xs cursor-pointer">
                <input type="checkbox" checked={deleteRemoveFolder} onChange={(e) => setDeleteRemoveFolder(e.target.checked)} className="size-4 mt-0.5 rounded border-input" />
                <span>
                  <span className="font-semibold text-red-700 dark:text-red-300">
                    {lang === "en" ? "Also delete the site folder and Linux user" : "Site klasörünü ve Linux kullanıcısını da sil"}
                  </span>
                  <span className="block text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 font-mono break-all">{workdir}{linuxUser ? ` · ${linuxUser}` : ""}</span>
                  <span className="block text-[11px] text-red-600 dark:text-red-400 mt-0.5">{lang === "en" ? "Irreversible — uploads, .env, databases inside the folder are gone." : "Geri alınamaz — klasördeki yüklemeler, .env, veritabanı dosyaları gider."}</span>
                </span>
              </label>
              {deleteError && <p className="text-xs text-red-600 dark:text-red-400 font-mono">{deleteError}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" disabled={deleting} onClick={() => setDeleteOpen(false)} className="h-9 rounded-xl text-xs">
                  {t("common.back")}
                </Button>
                <Button size="sm" disabled={deleting} onClick={handleDelete} className="h-9 rounded-xl text-xs bg-red-600 hover:bg-red-700 text-white">
                  {deleting ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Trash2 className="size-3.5 mr-1" />}
                  {t("sites.deleteSiteBtn")}
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
