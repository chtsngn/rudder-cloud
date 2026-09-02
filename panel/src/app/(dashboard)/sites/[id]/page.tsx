"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  FolderOpen,
  GitBranch,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  Play,
  RotateCw,
  Server,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Square,
  Terminal,
  Trash2,
  Users,
  Database,
  FileText,
  Activity,
  Globe,
  Code2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { SiteAccessCard } from "@/components/site-access-card"
import { SiteBackupCard } from "@/components/site-backup-card"
import { SiteGithubKeysCard } from "@/components/site-github-keys-card"
import { StatMeter } from "@/components/stat-meter"
import { SITE_TYPES, type Site, type SiteType } from "@/lib/mock-data"
import { apiSiteToUiSite, type ApiSite } from "@/lib/site-adapter"
import { CustomSelect } from "@/components/ui/custom-select"
import { cn } from "@/lib/utils"

const STATUS_CONFIG: Record<
  Site["status"],
  { label: string; dot: string; badge: string }
> = {
  active: {
    label: "Aktif",
    dot: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
  },
  running: {
    label: "Çalışıyor",
    dot: "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
  },
  stopped: {
    label: "Durduruldu",
    dot: "bg-slate-400",
    badge: "bg-slate-100 text-slate-600 border-slate-200",
  },
  provisioning: {
    label: "Kuruluyor",
    dot: "bg-amber-500 animate-pulse",
    badge: "bg-amber-50 text-amber-700 border-amber-200/80",
  },
  error: {
    label: "Hata",
    dot: "bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]",
    badge: "bg-red-50 text-red-700 border-red-200/80",
  },
}

type ServiceAction = "start" | "stop" | "restart"
type ActiveTab = "overview" | "git" | "backups" | "access" | "logs"

function getTypeIcon(type: SiteType) {
  switch (type) {
    case "wordpress":
    case "php":
      return Globe
    case "nodejs":
      return Code2
    case "python":
      return Layers
    case "proxy":
      return Server
    default:
      return Globe
  }
}

export default function SiteDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()

  const [site, setSite] = useState<Site | null>(null)
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [sslInfo, setSslInfo] = useState<{
    sslEnabled: boolean
    sslStatus: string
    sslLastError: string | null
  } | null>(null)
  const [sslRetrying, setSslRetrying] = useState(false)
  const [sslRetryError, setSslRetryError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview")

  const [actionPending, setActionPending] = useState<ServiceAction | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [logs, setLogs] = useState<string>("")
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState<string | null>(null)

  const [gitForm, setGitForm] = useState<{
    repoUrl: string
    gitBranch: string
    autoPullEnabled: boolean
    autoPullIntervalSeconds: number
    processManager: ApiSite["processManager"]
    customRestartCommand: string
  }>({
    repoUrl: "",
    gitBranch: "main",
    autoPullEnabled: false,
    autoPullIntervalSeconds: 15,
    processManager: "SYSTEMD",
    customRestartCommand: "",
  })
  const [gitLastPull, setGitLastPull] = useState<{
    at: string | null
    ok: boolean | null
    error: string | null
  }>({ at: null, ok: null, error: null })
  const [gitSaving, setGitSaving] = useState(false)
  const [gitSaveError, setGitSaveError] = useState<string | null>(null)
  const [gitSaveOk, setGitSaveOk] = useState(false)
  const [gitPulling, setGitPulling] = useState(false)
  const [gitPullError, setGitPullError] = useState<string | null>(null)
  const [gitPullMessage, setGitPullMessage] = useState<string | null>(null)

  const [upstreamUrl, setUpstreamUrl] = useState("")
  const [upstreamSaving, setUpstreamSaving] = useState(false)
  const [upstreamSaveError, setUpstreamSaveError] = useState<string | null>(null)
  const [upstreamSaveOk, setUpstreamSaveOk] = useState(false)

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
        if (!cancelled) {
          setSite(apiSiteToUiSite(data))
          setConfig((data.config ?? {}) as Record<string, unknown>)
          setSslInfo({ sslEnabled: data.sslEnabled, sslStatus: data.sslStatus, sslLastError: data.sslLastError })
          setGitForm({
            repoUrl: data.repoUrl ?? "",
            gitBranch: data.gitBranch || "main",
            autoPullEnabled: data.autoPullEnabled,
            autoPullIntervalSeconds: data.autoPullIntervalSeconds,
            // REVERSE_PROXY için panel hiçbir zaman systemd birimi
            // oluşturmaz (bkz. provision-site.sh cmd_create_service —
            // yalnızca NODEJS/PYTHON çağırır), dolayısıyla DB'deki
            // varsayılan "SYSTEMD" değeri bu tip için hiç işlevsel olmamış
            // demektir — kullanıcı gerçek bir seçim yapana kadar PM2'ye
            // (CloudPanel-tarzı akışta en sık kullanılan yöntem) düşüyoruz.
            processManager:
              data.type === "REVERSE_PROXY" && data.processManager === "SYSTEMD"
                ? "PM2"
                : data.processManager,
            customRestartCommand: data.customRestartCommand ?? "",
          })
          setGitLastPull({ at: data.lastPullAt, ok: data.lastPullOk, error: data.lastPullError })
          setUpstreamUrl(
            data.config && typeof (data.config as Record<string, unknown>).upstreamUrl === "string"
              ? ((data.config as Record<string, unknown>).upstreamUrl as string)
              : ""
          )
        }
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
  }, [params.id])

  const isManaged = site ? (SITE_TYPES.find((t) => t.type === site.type)?.managed ?? false) : false

  const loadLogs = useCallback(async () => {
    if (!site || !isManaged) return
    setLogsLoading(true)
    setLogsError(null)
    try {
      const res = await fetch(`/api/sites/${site.id}/logs?lines=200`, { cache: "no-store" })
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
  }, [site, isManaged])

  useEffect(() => {
    if (!site || !isManaged) return
    // setTimeout ile bir sonraki makrotaşka erteleniyor: loadLogs() ilk iş
    // olarak setLogsLoading(true) çağırıyor, bunu efekt gövdesinin senkron
    // kısmından çıkarmak "setState-in-effect" kuralını tetiklememek için
    // gerekli (bkz. react-hooks/set-state-in-effect).
    const timer = setTimeout(() => {
      loadLogs()
    }, 0)
    return () => clearTimeout(timer)
    // Yalnızca site ilk yüklendiğinde / id değiştiğinde çalışsın — loadLogs'un
    // kendisi her render'da yeniden oluşuyor (useCallback'e rağmen site
    // referansı değiştiği için), o yüzden buraya bağımlılık olarak eklenmiyor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site?.id, isManaged])

  async function handleServiceAction(action: ServiceAction) {
    if (!site) return
    setActionPending(action)
    setActionError(null)
    try {
      const res = await fetch(`/api/sites/${site.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const data = (await res.json().catch(() => null)) as (ApiSite & { error?: string }) | null
      if (!res.ok || !data || typeof data.id !== "string") {
        setActionError(data?.error ?? "Eylem gerçekleştirilemedi.")
        return
      }
      setSite(apiSiteToUiSite(data))
      setConfig((data.config ?? {}) as Record<string, unknown>)
      setSslInfo({ sslEnabled: data.sslEnabled, sslStatus: data.sslStatus, sslLastError: data.sslLastError })
      loadLogs()
    } catch {
      setActionError("Sunucuya bağlanılamadı.")
    } finally {
      setActionPending(null)
    }
  }

  async function handleGitSave() {
    if (!site) return
    setGitSaving(true)
    setGitSaveError(null)
    setGitSaveOk(false)
    try {
      const res = await fetch(`/api/sites/${site.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl: gitForm.repoUrl.trim() === "" ? null : gitForm.repoUrl.trim(),
          gitBranch: gitForm.gitBranch.trim() || "main",
          autoPullEnabled: gitForm.autoPullEnabled,
          autoPullIntervalSeconds: gitForm.autoPullIntervalSeconds,
          processManager: gitForm.processManager,
          customRestartCommand:
            gitForm.processManager === "CUSTOM_SCRIPT" && gitForm.customRestartCommand.trim() !== ""
              ? gitForm.customRestartCommand.trim()
              : null,
        }),
      })
      const data = (await res.json().catch(() => null)) as (ApiSite & { error?: string }) | null
      if (!res.ok || !data) {
        setGitSaveError(data?.error ?? "Kaydedilemedi.")
        return
      }
      setGitForm({
        repoUrl: data.repoUrl ?? "",
        gitBranch: data.gitBranch || "main",
        autoPullEnabled: data.autoPullEnabled,
        autoPullIntervalSeconds: data.autoPullIntervalSeconds,
        processManager: data.processManager,
        customRestartCommand: data.customRestartCommand ?? "",
      })
      setGitSaveOk(true)
    } catch {
      setGitSaveError("Sunucuya bağlanılamadı.")
    } finally {
      setGitSaving(false)
    }
  }

  async function handleGitPull() {
    if (!site) return
    setGitPulling(true)
    setGitPullError(null)
    setGitPullMessage(null)
    try {
      const res = await fetch(`/api/sites/${site.id}/git-pull`, { method: "POST" })
      const data = (await res.json().catch(() => null)) as
        | (Partial<ApiSite> & {
            pullChanged?: boolean
            restartError?: string | null
            error?: string
            site?: Partial<ApiSite>
          })
        | null
      if (!data) {
        setGitPullError("Sunucuya bağlanılamadı.")
        return
      }
      const statusSource = res.ok ? data : (data.site ?? data)
      setGitLastPull({
        at: statusSource.lastPullAt ?? null,
        ok: statusSource.lastPullOk ?? false,
        error: statusSource.lastPullError ?? (res.ok ? null : (data.error ?? null)),
      })
      if (!res.ok) {
        setGitPullError(data.error ?? "git pull başarısız oldu.")
      } else if (data.restartError) {
        setGitPullError(`Pull başarılı ama yeniden başlatma başarısız: ${data.restartError}`)
      } else {
        setGitPullMessage(
          data.pullChanged ? "Yeni commit çekildi, proje yeniden başlatıldı." : "Zaten güncel, değişiklik yok."
        )
      }
    } catch {
      setGitPullError("Sunucuya bağlanılamadı.")
    } finally {
      setGitPulling(false)
    }
  }

  async function handleUpstreamSave() {
    if (!site) return
    const trimmed = upstreamUrl.trim()
    if (!trimmed) {
      setUpstreamSaveError("Hedef adres boş olamaz.")
      return
    }
    setUpstreamSaving(true)
    setUpstreamSaveError(null)
    setUpstreamSaveOk(false)
    try {
      const res = await fetch(`/api/sites/${site.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upstreamUrl: trimmed }),
      })
      const data = (await res.json().catch(() => null)) as (ApiSite & { error?: string }) | null
      if (!res.ok || !data) {
        setUpstreamSaveError(data?.error ?? "Hedef adres güncellenemedi.")
        return
      }
      setConfig((data.config ?? {}) as Record<string, unknown>)
      setUpstreamUrl(trimmed)
      setUpstreamSaveOk(true)
    } catch {
      setUpstreamSaveError("Sunucuya bağlanılamadı.")
    } finally {
      setUpstreamSaving(false)
    }
  }

  async function handleDelete() {
    if (!site) return
    if (!window.confirm(`${site.domain} silinsin mi? Bu işlem geri alınamaz.`)) return

    setDeleting(true)
    try {
      await fetch(`/api/sites/${site.id}`, { method: "DELETE" })
      router.push("/")
      router.refresh()
    } finally {
      setDeleting(false)
    }
  }

  async function handleRetrySsl() {
    if (!site) return
    setSslRetrying(true)
    setSslRetryError(null)
    try {
      const res = await fetch(`/api/sites/${site.id}/ssl`, { method: "POST" })
      const data = (await res.json().catch(() => null)) as (ApiSite & { error?: string }) | null
      if (!data) {
        setSslRetryError("Sunucuya bağlanılamadı.")
        return
      }
      setSslInfo({ sslEnabled: data.sslEnabled, sslStatus: data.sslStatus, sslLastError: data.sslLastError })
      if (!res.ok) {
        setSslRetryError(data.error ?? "SSL sertifikası alınamadı.")
      }
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

  if (notFound || !site) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Link
          href="/sites"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:text-[#580619] hover:border-[#c8a87c] shadow-xs transition-all"
        >
          <ArrowLeft className="size-3.5" />
          Siteler listesine dön
        </Link>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Site bulunamadı veya silinmiş olabilir.
        </div>
      </div>
    )
  }

  const typeInfo = SITE_TYPES.find((t) => t.type === site.type)!
  const isRunning = site.status === "running"
  const isProxy = site.type === "proxy"
  const status = STATUS_CONFIG[site.status] ?? STATUS_CONFIG.stopped
  const TypeIcon = getTypeIcon(site.type)

  const configRows = [
    { label: "Alan Adı (Domain)", value: site.domain },
    ...(isManaged
      ? [{ label: "Uygulama Portu", value: String(config.port ?? "-") }]
      : []),
    ...(isManaged
      ? [{ label: "Başlatma Komutu", value: String(config.startCommand ?? "-") }]
      : []),
    ...(isProxy
      ? [{ label: "Hedef Adres (Upstream)", value: String(config.upstreamUrl ?? "-") }]
      : [
          {
            label: "Site Kök Dizini",
            value: String(config.siteRoot ?? `/var/www/${site.domain}`),
          },
          {
            label: "Linux Kullanıcısı",
            value: String(config.linuxUser ?? site.domain.split(".")[0]),
          },
        ]),
    {
      label: "SSL Durumu",
      value: !sslInfo || !sslInfo.sslEnabled
        ? "Pasif"
        : sslInfo.sslStatus === "active"
          ? "Aktif (Let's Encrypt)"
          : sslInfo.sslStatus === "error"
            ? "Hata (Doğrulama Bekliyor)"
            : "Bekliyor",
    },
    ...(isManaged
      ? [
          {
            label: "systemd Servis Birimi",
            value: `site-${site.domain.replace(/\./g, "-")}.service`,
          },
        ]
      : []),
  ]

  return (
    <div className="max-w-7xl mx-auto space-y-7 pb-12">
      {/* ═══ 1. ÜST GERİ DÖNÜŞ & BAŞLIK KONTROLLERİ ═══ */}
      <div className="space-y-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <Link
          href="/sites"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#090e1f] text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-[#580619] dark:hover:text-blue-400 hover:border-[#c8a87c] dark:hover:border-blue-500/50 shadow-xs transition-all"
        >
          <ArrowLeft className="size-3.5 text-[#580619] dark:text-blue-400" />
          Siteler listesine dön
        </Link>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Site Başlığı & Rozetler */}
          <div className="flex items-center gap-3.5">
            <div className="size-12 rounded-2xl bg-[#580619]/5 dark:bg-[#101c38] border border-[#c8a87c]/30 dark:border-[#1e3568]/50 flex items-center justify-center text-[#580619] dark:text-blue-300 font-mono text-xs font-black shadow-sm shrink-0">
              <TypeIcon className="size-6" />
            </div>

            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="font-heading text-2xl md:text-3xl font-extrabold tracking-tight text-[#580619] dark:text-slate-100">
                  {site.domain}
                </h1>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border shadow-2xs",
                    status.badge
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", status.dot)} />
                  {status.label}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-sans flex items-center gap-2">
                <span>{typeInfo.label} sitesi</span>
                <span>•</span>
                <span>{sslInfo?.sslEnabled ? "SSL Aktif" : "HTTP"}</span>
              </p>
            </div>
          </div>

          {/* Aksiyon Butonları */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-9 px-3 rounded-xl border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#090e1f] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-[#580619] dark:hover:text-blue-300 hover:border-[#c8a87c] dark:hover:border-[#2a4687] shadow-2xs"
            >
              <a
                href={`http://${site.domain}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5"
              >
                <Globe className="size-3.5" />
                Siteyi Aç
                <ArrowUpRight className="size-3 text-slate-400 dark:text-slate-500" />
              </a>
            </Button>

            {site.type !== "proxy" && (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-9 px-3 rounded-xl border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#090e1f] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-[#580619] dark:hover:text-blue-300 hover:border-[#c8a87c] dark:hover:border-[#2a4687] shadow-2xs"
              >
                <Link href={`/sites/${site.id}/files`} className="flex items-center gap-1.5">
                  <FolderOpen className="size-3.5 text-[#580619] dark:text-blue-300" />
                  Dosyalar
                </Link>
              </Button>
            )}

            {isManaged && (
              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-[#070c1a] p-1 rounded-xl border border-slate-200/80 dark:border-[#16223f]">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isRunning || actionPending !== null}
                  onClick={() => handleServiceAction("start")}
                  className="h-7 px-2.5 rounded-lg text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                  title="Servisi Başlat"
                >
                  {actionPending === "start" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Play className="size-3 fill-emerald-600 dark:fill-emerald-400" />
                  )}
                  Başlat
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!isRunning || actionPending !== null}
                  onClick={() => handleServiceAction("stop")}
                  className="h-7 px-2.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800"
                  title="Servisi Durdur"
                >
                  {actionPending === "stop" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Square className="size-3 fill-slate-500" />
                  )}
                  Durdur
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={actionPending !== null}
                  onClick={() => handleServiceAction("restart")}
                  className="h-7 px-2.5 rounded-lg text-xs font-semibold text-[#580619] dark:text-blue-300 hover:bg-[#580619]/10 dark:hover:bg-[#162752]"
                  title="Servisi Yeniden Başlat"
                >
                  {actionPending === "restart" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RotateCw className="size-3" />
                  )}
                  Yeniden Başlat
                </Button>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="h-9 px-3 rounded-xl border-red-200 dark:border-red-900/60 bg-white dark:bg-[#090e1f] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-300 text-xs font-semibold shadow-2xs"
            >
              {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              Sil
            </Button>
          </div>
        </div>

        {actionError && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-xs text-red-700 dark:text-red-300">
            {actionError}
          </div>
        )}

        {/* SSL Hata Uyarı Bandı */}
        {sslInfo?.sslStatus === "error" && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-amber-200/80 dark:border-[#16223f] bg-amber-50/60 dark:bg-[#090e1f] p-4 text-xs text-amber-900 dark:text-slate-200 shadow-2xs">
            <div className="flex items-start gap-3">
              <div className="size-8 rounded-xl bg-amber-500/10 dark:bg-[#101c38] border border-amber-500/30 dark:border-[#1e3568]/50 flex items-center justify-center shrink-0 mt-0.5">
                <ShieldAlert className="size-4.5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="font-heading font-bold text-slate-900 dark:text-slate-100 text-xs">
                  SSL sertifikası doğrulanamadı, site HTTP üzerinden yayında.
                </p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 font-sans">
                  {sslInfo.sslLastError || "DNS A kaydının sunucunuza yönlendiğinden emin olduktan sonra tekrar deneyin."}
                </p>
                {sslRetryError && <p className="text-[11px] text-red-600 dark:text-red-400 mt-1 font-mono">{sslRetryError}</p>}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={sslRetrying}
              onClick={handleRetrySsl}
              className="shrink-0 h-8 rounded-xl border-amber-300 dark:border-[#16223f] bg-white dark:bg-[#060a17] text-amber-900 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-[#111f40] text-xs font-semibold"
            >
              {sslRetrying && <Loader2 className="size-3 animate-spin mr-1" />}
              Tekrar Dene
            </Button>
          </div>
        )}
      </div>

      {/* ═══ 2. ŞIK TABLAR (SEKMELER) ═══ */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-[#16223f] pb-px overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer",
            activeTab === "overview"
              ? "border-[#580619] dark:border-[#2a4687] text-[#580619] dark:text-blue-300"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          )}
        >
          <Settings2 className="size-4 text-[#c8a87c] dark:text-blue-300" />
          Genel Bakış &amp; Ayarlar
        </button>

        {(isManaged || isProxy) && (
          <button
            type="button"
            onClick={() => setActiveTab("git")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer",
              activeTab === "git"
                ? "border-[#580619] dark:border-[#2a4687] text-[#580619] dark:text-blue-300"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            )}
          >
            <GitBranch className="size-4 text-[#c8a87c] dark:text-blue-300" />
            Git &amp; Otomatik Dağıtım
          </button>
        )}

        <button
          type="button"
          onClick={() => setActiveTab("backups")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer",
            activeTab === "backups"
              ? "border-[#580619] dark:border-[#2a4687] text-[#580619] dark:text-blue-300"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            )}
        >
          <Database className="size-4 text-[#c8a87c] dark:text-blue-300" />
          Yedekler &amp; S3
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("access")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer",
            activeTab === "access"
              ? "border-[#580619] dark:border-[#2a4687] text-[#580619] dark:text-blue-300"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          )}
        >
          <Users className="size-4 text-[#c8a87c] dark:text-blue-300" />
          Erişim Yetkileri
        </button>

        {isManaged && (
          <button
            type="button"
            onClick={() => setActiveTab("logs")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer",
              activeTab === "logs"
                ? "border-[#580619] dark:border-[#2a4687] text-[#580619] dark:text-blue-300"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            )}
          >
            <Terminal className="size-4 text-[#c8a87c] dark:text-blue-300" />
            Servis Logları
          </button>
        )}
      </div>

      {/* ═══ 3. TAB İÇERİKLERİ ═══ */}

      {/* ── TAB 1: GENEL BAKIŞ & AYARLAR ── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {isManaged && (
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-5 shadow-xs">
                <StatMeter label="İşlemci Kullanımı (CPU)" value={site.cpu ?? 0} />
              </div>
              <div className="rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-5 shadow-xs">
                <StatMeter label="Bellek Kullanımı (RAM)" value={site.ram ?? 0} />
              </div>
            </div>
          )}

          {/* Ters Proxy Hızlı Hedef Adres Kutusu */}
          {isProxy && (
            <div className="rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-6 shadow-xs space-y-4">
              <div>
                <h3 className="font-heading font-bold text-slate-900 dark:text-slate-100 text-sm">
                  Hedef Adres (Reverse Proxy Pass)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Ters proxy trafiğinin yönlendirileceği yerel veya harici servis portunu güncelleyin.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <Input
                  id="upstreamUrl"
                  placeholder="http://127.0.0.1:3000"
                  value={upstreamUrl}
                  onChange={(e) => setUpstreamUrl(e.target.value)}
                  className="font-mono text-xs h-10 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100"
                />
                <Button
                  type="button"
                  onClick={handleUpstreamSave}
                  disabled={upstreamSaving || !upstreamUrl.trim()}
                  className="bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white h-10 px-5 rounded-xl text-xs font-semibold shrink-0 cursor-pointer border border-[#c8a87c]/40 dark:border-[#2a4687]/60"
                >
                  {upstreamSaving && <Loader2 className="size-3.5 animate-spin mr-1" />}
                  Güncelle
                </Button>
              </div>

              {upstreamSaveError && <p className="text-xs text-red-600 dark:text-red-400 font-mono">{upstreamSaveError}</p>}
              {upstreamSaveOk && !upstreamSaveError && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                  <Check className="size-3.5 stroke-[3]" />
                  Hedef adres başarıyla güncellendi.
                </p>
              )}
            </div>
          )}

          {/* Yapılandırma Bilgileri Tablosu */}
          <div className="rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-6 shadow-xs space-y-4">
            <h3 className="font-heading font-bold text-slate-900 dark:text-slate-100 text-sm">
              Sunucu &amp; Yapılandırma Detayları
            </h3>

            <div className="divide-y divide-slate-100 dark:divide-[#16223f]">
              {configRows.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between py-3 text-xs"
                >
                  <span className="font-medium text-slate-500 dark:text-slate-400">{item.label}</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-right">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: GİT & OTOMATİK DAĞITIM ── */}
      {activeTab === "git" && (isManaged || isProxy) && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-6 md:p-8 shadow-xs space-y-6">
            <div className="border-b border-slate-100 dark:border-[#16223f] pb-4">
              <h3 className="font-heading font-bold text-slate-900 dark:text-slate-100 text-base">
                Git Deposu ve Otomatik Dağıtım
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                GitHub veya özel git deponuzu bağlayarak otomatik pull ve yeniden başlatma yapılandırın.
              </p>
            </div>

            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="repoUrl" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Repo Adresi (SSH / HTTPS)
                  </Label>
                  <Input
                    id="repoUrl"
                    placeholder="git@github.com:owner/repo.git"
                    className="font-mono text-xs h-10 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100"
                    value={gitForm.repoUrl}
                    onChange={(e) => setGitForm((f) => ({ ...f, repoUrl: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gitBranch" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Branch Adı
                  </Label>
                  <Input
                    id="gitBranch"
                    placeholder="main"
                    className="font-mono text-xs h-10 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100"
                    value={gitForm.gitBranch}
                    onChange={(e) => setGitForm((f) => ({ ...f, gitBranch: e.target.value }))}
                  />
                </div>
              </div>

              {/* Otomatik Pull Switch */}
              <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-[#16223f] p-4 bg-slate-50/50 dark:bg-[#060a17]">
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Otomatik Pull &amp; Restart</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Yeni commit tespit edildiğinde kod otomatik çekilir ve servis yeniden başlatılır.
                  </p>
                </div>
                <Switch
                  id="autoPull"
                  checked={gitForm.autoPullEnabled}
                  onCheckedChange={(checked) =>
                    setGitForm((f) => ({ ...f, autoPullEnabled: checked }))
                  }
                />
              </div>

              {gitForm.autoPullEnabled && (
                <div className="space-y-2 sm:w-64">
                  <Label htmlFor="autoPullInterval" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Kontrol Aralığı (Saniye)
                  </Label>
                  <Input
                    id="autoPullInterval"
                    type="number"
                    min={5}
                    max={86400}
                    className="h-10 rounded-xl font-mono text-xs bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100"
                    value={gitForm.autoPullIntervalSeconds}
                    onChange={(e) =>
                      setGitForm((f) => ({
                        ...f,
                        autoPullIntervalSeconds: Number(e.target.value) || 15,
                      }))
                    }
                  />
                </div>
              )}

              {/* Process Manager Seçimi */}
              <div className="space-y-2">
                <Label htmlFor="processManager" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Yeniden Başlatma Yöntemi (Process Manager)
                </Label>
                <CustomSelect
                  value={gitForm.processManager || "SYSTEMD"}
                  onChange={(val) =>
                    setGitForm((f) => ({
                      ...f,
                      processManager: val as ApiSite["processManager"],
                    }))
                  }
                  options={[
                    ...(!isProxy
                      ? [{ value: "SYSTEMD", label: "systemd (panel yönetiyor — varsayılan)" }]
                      : []),
                    { value: "DOCKER_COMPOSE", label: "Docker Compose (docker compose restart)" },
                    { value: "PM2", label: "PM2 (pm2 restart)" },
                    { value: "CUSTOM_SCRIPT", label: "Özel script betiği" },
                  ]}
                  className="w-full"
                />
              </div>

              {gitForm.processManager === "CUSTOM_SCRIPT" && (
                <div className="space-y-2">
                  <Label htmlFor="customRestartCommand" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Özel Restart Betiği (Mutlak Yol)
                  </Label>
                  <Input
                    id="customRestartCommand"
                    placeholder={`/var/www/${site.domain}/deploy/restart.sh`}
                    className="font-mono text-xs h-10 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100"
                    value={gitForm.customRestartCommand}
                    onChange={(e) =>
                      setGitForm((f) => ({ ...f, customRestartCommand: e.target.value }))
                    }
                  />
                </div>
              )}

              {gitSaveError && <p className="text-xs text-red-600 dark:text-red-400">{gitSaveError}</p>}

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button
                  onClick={handleGitSave}
                  disabled={gitSaving}
                  className="bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white h-10 px-6 rounded-xl text-xs font-semibold cursor-pointer border border-[#c8a87c]/40 dark:border-[#2a4687]/60"
                >
                  {gitSaving && <Loader2 className="size-3.5 animate-spin mr-1" />}
                  Ayarları Kaydet
                </Button>
                <Button
                  variant="outline"
                  onClick={handleGitPull}
                  disabled={gitPulling || !gitForm.repoUrl.trim()}
                  className="h-10 px-5 rounded-xl border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#060a17] text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer dark:hover:bg-[#111f40]"
                >
                  {gitPulling ? (
                    <Loader2 className="size-3.5 animate-spin mr-1" />
                  ) : (
                    <RotateCw className="size-3.5 mr-1" />
                  )}
                  Şimdi Pull Et
                </Button>
                {gitSaveOk && <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">Ayarlar kaydedildi.</span>}
              </div>

              {(gitPullMessage || gitPullError) && (
                <div
                  className={cn(
                    "p-3 rounded-xl text-xs font-mono",
                    gitPullError ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900" : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900"
                  )}
                >
                  {gitPullError ?? gitPullMessage}
                </div>
              )}

              {/* Son Pull Durumu */}
              <div className="pt-4 border-t border-slate-100 dark:border-[#16223f] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Son Git Pull:</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                  {gitLastPull.at ? new Date(gitLastPull.at).toLocaleString("tr-TR") : "Henüz yapılmadı"}
                </span>
              </div>
            </div>
          </div>

          {/* GitHub Keys Bileşeni */}
          <SiteGithubKeysCard siteId={site.id} initialRepoUrl={gitForm.repoUrl} />
        </div>
      )}

      {/* ── TAB 3: YEDEKLER & S3 ── */}
      {activeTab === "backups" && (
        <div className="space-y-6">
          <SiteBackupCard siteId={site.id} />
        </div>
      )}

      {/* ── TAB 4: ERİŞİM YETKİLERİ ── */}
      {activeTab === "access" && (
        <div className="space-y-6">
          <SiteAccessCard siteId={site.id} />
        </div>
      )}

      {/* ── TAB 5: SERVİS LOGLARI ── */}
      {activeTab === "logs" && isManaged && (
        <div className="rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-6 md:p-8 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#16223f] pb-4">
            <div>
              <h3 className="font-heading font-bold text-slate-900 dark:text-slate-100 text-base">
                Canlı Servis Kayıtları (systemd Logs)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Uygulamanızın standart çıktı (stdout / stderr) akışı.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadLogs()}
              disabled={logsLoading}
              className="h-8 px-3 rounded-xl border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#060a17] text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer dark:hover:bg-[#111f40]"
            >
              {logsLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
              Yenile
            </Button>
          </div>

          {logsError ? (
            <p className="text-xs text-red-600 dark:text-red-400 font-mono">{logsError}</p>
          ) : (
            <pre className="max-h-96 overflow-auto rounded-xl bg-slate-900 dark:bg-[#030610] p-4 font-mono text-xs text-emerald-400 leading-relaxed shadow-inner border border-slate-800 dark:border-[#16223f]">
              {logsLoading && !logs
                ? "Kayıtlar yükleniyor..."
                : logs.trim()
                ? logs
                : "Henüz bir kayıt bulunmuyor."}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
