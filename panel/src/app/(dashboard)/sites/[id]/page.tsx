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
import { useTranslation } from "@/components/language-provider"
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

/** `GET /api/settings/github/repos` — GitHub App kurulumlarının izin verdiği depolar. */
interface InstalledRepoOption {
  fullName: string
  private: boolean
  defaultBranch: string
  accountLogin: string
  installationId: string
}

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
  const { t, lang } = useTranslation()
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

  // GitHub App'e bağlı depo seçimi (bkz. /api/sites/[id]/github-connect) —
  // seçilince yalnızca `repoUrl`/`gitBranch`'i doldurmakla kalmaz, sitenin
  // kök dizinine İLK KURULUMU (git clone) da tetikler.
  const [githubRepoFullName, setGithubRepoFullName] = useState<string | null>(null)
  const [installedRepos, setInstalledRepos] = useState<InstalledRepoOption[]>([])
  const [installedReposLoaded, setInstalledReposLoaded] = useState(false)
  const [selectedRepoFullName, setSelectedRepoFullName] = useState("")
  const [connectingRepo, setConnectingRepo] = useState(false)
  const [disconnectingRepo, setDisconnectingRepo] = useState(false)
  const [connectRepoError, setConnectRepoError] = useState<string | null>(null)

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
          setGithubRepoFullName(data.githubRepoFullName ?? null)
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

  // GitHub'a bağlı depoları yalnızca Git sekmesi ilk açıldığında, tek sefer
  // getir (her sekme geçişinde değil) — `installedReposLoaded` bunu sağlıyor.
  // setTimeout ile bir sonraki makrotaşka erteleniyor: aynı `loadLogs`
  // effect'indeki disiplin (yukarıda) — efekt gövdesinin senkron kısmından
  // setState'i çıkarmak react-hooks/set-state-in-effect'i tetiklememek için.
  useEffect(() => {
    if (activeTab !== "git" || installedReposLoaded) return
    const timer = setTimeout(() => {
      setInstalledReposLoaded(true)
      fetch("/api/settings/github/repos", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { repos?: InstalledRepoOption[] } | null) => {
          if (data?.repos) setInstalledRepos(data.repos)
        })
        .catch(() => {})
    }, 0)
    return () => clearTimeout(timer)
  }, [activeTab, installedReposLoaded])

  async function handleConnectRepo() {
    if (!site || !selectedRepoFullName) return
    const repo = installedRepos.find((r) => r.fullName === selectedRepoFullName)
    if (!repo) return

    setConnectingRepo(true)
    setConnectRepoError(null)
    setGitPullMessage(null)
    setGitPullError(null)
    try {
      const res = await fetch(`/api/sites/${site.id}/github-connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installationId: repo.installationId,
          repoFullName: repo.fullName,
          branch: repo.defaultBranch,
        }),
      })
      const data = (await res.json().catch(() => null)) as
        | (Partial<ApiSite> & { pullChanged?: boolean; restartError?: string | null; error?: string; site?: Partial<ApiSite> })
        | null
      if (!data) {
        setConnectRepoError("Sunucuya bağlanılamadı.")
        return
      }
      const statusSource = res.ok ? data : (data.site ?? data)
      setGitLastPull({
        at: statusSource.lastPullAt ?? null,
        ok: statusSource.lastPullOk ?? false,
        error: statusSource.lastPullError ?? (res.ok ? null : (data.error ?? null)),
      })
      if (!res.ok) {
        setConnectRepoError(data.error ?? "Depo bağlanamadı.")
        return
      }
      setGithubRepoFullName(repo.fullName)
      setGitForm((f) => ({ ...f, repoUrl: `https://github.com/${repo.fullName}.git`, gitBranch: repo.defaultBranch }))
      setGitPullMessage(
        data.restartError
          ? `Depo bağlandı ama yeniden başlatma başarısız: ${data.restartError}`
          : (data.pullChanged ? "Depo bağlandı ve kök dizine kuruldu." : "Depo bağlandı (zaten güncel).")
      )
    } catch {
      setConnectRepoError("Sunucuya bağlanılamadı.")
    } finally {
      setConnectingRepo(false)
    }
  }

  async function handleDisconnectRepo() {
    if (!site) return
    if (!window.confirm(lang === "en" ? "Disconnect this repository? The already-cloned files stay in place." : "Bu depo bağlantısı kaldırılsın mı? Zaten klonlanmış dosyalar yerinde kalır.")) return
    setDisconnectingRepo(true)
    setConnectRepoError(null)
    try {
      const res = await fetch(`/api/sites/${site.id}/github-connect`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setConnectRepoError(data?.error ?? "Bağlantı kaldırılamadı.")
        return
      }
      setGithubRepoFullName(null)
      setSelectedRepoFullName("")
    } catch {
      setConnectRepoError("Sunucuya bağlanılamadı.")
    } finally {
      setDisconnectingRepo(false)
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
          {t("sites.detail.backToList")}
        </Link>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          {lang === "en" ? "Site not found or may have been deleted." : "Site bulunamadı veya silinmiş olabilir."}
        </div>
      </div>
    )
  }

  const typeInfo = SITE_TYPES.find((t) => t.type === site.type)!
  const isRunning = site.status === "running"
  const isProxy = site.type === "proxy"
  const status = STATUS_CONFIG[site.status] ?? STATUS_CONFIG.stopped
  const TypeIcon = getTypeIcon(site.type)

  const statusLabels: Record<string, string> = {
    active: t("sites.statusActive"),
    running: t("sites.statusRunning"),
    provisioning: t("sites.statusProvisioning"),
    stopped: t("sites.statusStopped"),
    error: t("sites.statusFailed"),
  }

  const localizedTypeLabel = t(`sites.types.${site.type}.label`) || typeInfo.label

  const configRows = [
    { label: t("sites.detail.domainLabel"), value: site.domain },
    ...(isManaged
      ? [{ label: t("sites.detail.appPortLabel"), value: String(config.port ?? "-") }]
      : []),
    ...(isManaged
      ? [{ label: t("sites.detail.startCmdLabel"), value: String(config.startCommand ?? "-") }]
      : []),
    ...(isProxy
      ? [{ label: t("sites.detail.upstreamLabel"), value: String(config.upstreamUrl ?? "-") }]
      : [
          {
            label: t("sites.detail.siteRootLabel"),
            value: String(config.siteRoot ?? `/var/www/${site.domain}`),
          },
          {
            label: t("sites.detail.linuxUserLabel"),
            value: String(config.linuxUser ?? site.domain.split(".")[0]),
          },
        ]),
    {
      label: t("sites.detail.sslStatusLabel"),
      value: !sslInfo || !sslInfo.sslEnabled
        ? t("sites.detail.sslInactive")
        : sslInfo.sslStatus === "active"
          ? t("sites.detail.sslActiveLetsEncrypt")
          : sslInfo.sslStatus === "error"
            ? t("sites.detail.sslErrorPending")
            : t("sites.detail.sslPending"),
    },
    ...(isManaged
      ? [
          {
            label: t("sites.detail.systemdUnitLabel"),
            value: `site-${site.domain.replace(/\./g, "-")}.service`,
          },
        ]
      : []),
  ]

  return (
    <div className="max-w-7xl mx-auto space-y-7 pb-12">
      {/* ═══ 1. ÜST GERİ DÖNÜŞ & BAŞLIK KONTROLLERİ ═══ */}
      <div className="space-y-4 pb-5 border-b border-border">
        <Link
          href="/sites"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-card text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-[#580619] dark:hover:text-[#38bdf8] hover:border-[#c8a87c] dark:hover:border-[#38bdf8]/50 shadow-xs transition-all"
        >
          <ArrowLeft className="size-3.5 text-[#580619] dark:text-[#38bdf8]" />
          {t("sites.detail.backToList")}
        </Link>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Site Başlığı & Rozetler */}
          <div className="flex items-center gap-3.5">
            <div className="size-12 rounded-2xl bg-[#580619]/10 dark:bg-sky-500/15 border border-[#580619]/20 dark:border-sky-500/30 flex items-center justify-center text-[#580619] dark:text-[#38bdf8] font-mono text-xs font-black shadow-sm shrink-0">
              <TypeIcon className="size-6" />
            </div>

            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="font-heading text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">
                  {site.domain}
                </h1>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border shadow-2xs",
                    status.badge
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", status.dot)} />
                  {statusLabels[site.status] ?? status.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 font-sans flex items-center gap-2">
                <span>{localizedTypeLabel} {t("sites.siteSuffix")}</span>
                <span>•</span>
                <span>{sslInfo?.sslEnabled ? t("sites.sslActiveLabel") : t("sites.httpOnlyLabel")}</span>
              </p>
            </div>
          </div>

          {/* Aksiyon Butonları */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-9 px-3 rounded-xl border border-border bg-card text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-[#580619] dark:hover:text-[#38bdf8] hover:border-[#c8a87c] dark:hover:border-[#38bdf8]/50 shadow-2xs"
            >
              <a
                href={`http://${site.domain}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5"
              >
                <Globe className="size-3.5" />
                {t("sites.openSiteBtn")}
                <ArrowUpRight className="size-3 text-muted-foreground" />
              </a>
            </Button>

            {site.type !== "proxy" && (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-9 px-3 rounded-xl border border-border bg-card text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-[#580619] dark:hover:text-[#38bdf8] hover:border-[#c8a87c] dark:hover:border-[#38bdf8]/50 shadow-2xs"
              >
                <Link href={`/sites/${site.id}/files`} className="flex items-center gap-1.5">
                  <FolderOpen className="size-3.5 text-[#580619] dark:text-[#38bdf8]" />
                  {t("sites.filesBtn")}
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
                  title={t("sites.startBtn")}
                >
                  {actionPending === "start" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Play className="size-3 fill-emerald-600 dark:fill-emerald-400" />
                  )}
                  {t("sites.startBtn")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!isRunning || actionPending !== null}
                  onClick={() => handleServiceAction("stop")}
                  className="h-7 px-2.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800"
                  title={t("sites.stopBtn")}
                >
                  {actionPending === "stop" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Square className="size-3 fill-slate-500" />
                  )}
                  {t("sites.stopBtn")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={actionPending !== null}
                  onClick={() => handleServiceAction("restart")}
                  className="h-7 px-2.5 rounded-lg text-xs font-semibold text-[#580619] dark:text-blue-300 hover:bg-[#580619]/10 dark:hover:bg-[#162752]"
                  title={t("sites.restartBtn")}
                >
                  {actionPending === "restart" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RotateCw className="size-3" />
                  )}
                  {t("sites.restartBtn")}
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
              {t("sites.deleteSiteBtn")}
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
                  {lang === "en"
                    ? "SSL certificate could not be verified, site is serving over HTTP."
                    : "SSL sertifikası doğrulanamadı, site HTTP üzerinden yayında."}
                </p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 font-sans">
                  {sslInfo.sslLastError || (lang === "en" ? "Make sure your DNS A record points to your server, then try again." : "DNS A kaydının sunucunuza yönlendiğinden emin olduktan sonra tekrar deneyin.")}
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
              {t("common.refresh")}
            </Button>
          </div>
        )}
      </div>

      {/* ═══ 2. ŞIK TABLAR (SEKMELER) ═══ */}
      <div className="flex items-center gap-1.5 border-b border-border pb-px overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer shrink-0 whitespace-nowrap",
            activeTab === "overview"
              ? "border-[#580619] text-[#580619] dark:border-[#38bdf8] dark:text-[#38bdf8]"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          )}
        >
          <Settings2 className={cn("size-4", activeTab === "overview" ? "text-[#580619] dark:text-[#38bdf8]" : "text-slate-400 dark:text-slate-500")} />
          {t("sites.tabs.overview")}
        </button>

        {(isManaged || isProxy) && (
          <button
            type="button"
            onClick={() => setActiveTab("git")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer shrink-0 whitespace-nowrap",
              activeTab === "git"
                ? "border-[#580619] text-[#580619] dark:border-[#38bdf8] dark:text-[#38bdf8]"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            )}
          >
            <GitBranch className={cn("size-4", activeTab === "git" ? "text-[#580619] dark:text-[#38bdf8]" : "text-slate-400 dark:text-slate-500")} />
            {t("sites.tabs.git")}
          </button>
        )}

        <button
          type="button"
          onClick={() => setActiveTab("backups")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer shrink-0 whitespace-nowrap",
            activeTab === "backups"
              ? "border-[#580619] text-[#580619] dark:border-[#38bdf8] dark:text-[#38bdf8]"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          )}
        >
          <Database className={cn("size-4", activeTab === "backups" ? "text-[#580619] dark:text-[#38bdf8]" : "text-slate-400 dark:text-slate-500")} />
          {t("sites.tabs.backups")}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("access")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer shrink-0 whitespace-nowrap",
            activeTab === "access"
              ? "border-[#580619] text-[#580619] dark:border-[#38bdf8] dark:text-[#38bdf8]"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          )}
        >
          <Users className={cn("size-4", activeTab === "access" ? "text-[#580619] dark:text-[#38bdf8]" : "text-slate-400 dark:text-slate-500")} />
          {t("sites.tabs.access")}
        </button>

        {isManaged && (
          <button
            type="button"
            onClick={() => setActiveTab("logs")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer shrink-0 whitespace-nowrap",
              activeTab === "logs"
                ? "border-[#580619] text-[#580619] dark:border-[#38bdf8] dark:text-[#38bdf8]"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            )}
          >
            <Terminal className={cn("size-4", activeTab === "logs" ? "text-[#580619] dark:text-[#38bdf8]" : "text-slate-400 dark:text-slate-500")} />
            {t("sites.tabs.logs")}
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
                <StatMeter label={lang === "en" ? "CPU Usage" : "İşlemci Kullanımı (CPU)"} value={site.cpu ?? 0} />
              </div>
              <div className="rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-5 shadow-xs">
                <StatMeter label={lang === "en" ? "RAM Usage" : "Bellek Kullanımı (RAM)"} value={site.ram ?? 0} />
              </div>
            </div>
          )}

          {/* Ters Proxy Hızlı Hedef Adres Kutusu */}
          {isProxy && (
            <div className="rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-6 shadow-xs space-y-4">
              <div>
                <h3 className="font-heading font-bold text-slate-900 dark:text-slate-100 text-sm">
                  {t("sites.detail.proxyPassTitle")}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t("sites.detail.proxyPassDesc")}
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
                  {upstreamSaving ? t("sites.detail.updatingBtn") : t("sites.detail.updateBtn")}
                </Button>
              </div>

              {upstreamSaveError && <p className="text-xs text-red-600 dark:text-red-400 font-mono">{upstreamSaveError}</p>}
              {upstreamSaveOk && !upstreamSaveError && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                  <Check className="size-3.5 stroke-[3]" />
                  {t("sites.detail.targetUpdated")}
                </p>
              )}
            </div>
          )}

          {/* Yapılandırma Bilgileri Tablosu */}
          <div className="rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-6 shadow-xs space-y-4">
            <h3 className="font-heading font-bold text-slate-900 dark:text-slate-100 text-sm">
              {t("sites.detail.serverConfigDetails")}
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
          <div className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-xs space-y-6">
            <div className="border-b border-border pb-4">
              <h3 className="font-heading font-bold text-foreground text-base">
                {t("sites.detail.gitRepoTitle")}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("sites.detail.gitRepoDesc")}
              </p>
            </div>

            <div className="space-y-5">
              {/* GitHub App'e bağlı depo seçimi — seçilince repoUrl/branch
                  otomatik doldurulur VE kök dizine ilk kurulum tetiklenir
                  (bkz. handleConnectRepo, /api/sites/[id]/github-connect). */}
              {githubRepoFullName ? (
                <div className="flex items-center justify-between gap-3 p-4 rounded-xl border border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <GitBranch className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-emerald-900 dark:text-emerald-300 truncate">
                        {lang === "en" ? "Connected via GitHub App" : "GitHub App ile bağlı"}: @{githubRepoFullName}
                      </p>
                      <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
                        {lang === "en" ? "Pulls authenticate with a short-lived installation token — no SSH key needed." : "Pull'lar kısa ömürlü installation token ile doğrulanır — SSH anahtarı gerekmez."}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={disconnectingRepo}
                    onClick={handleDisconnectRepo}
                    className="h-8 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0"
                  >
                    {disconnectingRepo ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Trash2 className="size-3.5 mr-1" />}
                    {lang === "en" ? "Disconnect" : "Bağlantıyı Kaldır"}
                  </Button>
                </div>
              ) : installedRepos.length > 0 ? (
                <div className="space-y-2 p-4 rounded-xl border border-border bg-muted/30">
                  <Label className="text-xs font-bold text-foreground/90">
                    {lang === "en" ? "Connect a GitHub App repository" : "Bir GitHub App deposu bağla"}
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    {lang === "en"
                      ? "Only repositories your GitHub App installation is authorized for are listed. Connecting clones it straight into this site's root folder."
                      : "Yalnızca GitHub App kurulumunuzun izin verdiği depolar listelenir. Bağlayınca bu sitenin kök klasörüne doğrudan klonlanır."}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <CustomSelect
                      value={selectedRepoFullName}
                      onChange={(val) => setSelectedRepoFullName(val)}
                      options={installedRepos.map((r) => ({
                        value: r.fullName,
                        label: `${r.private ? "🔒" : "🌐"} ${r.fullName} (${r.defaultBranch})`,
                      }))}
                      className="w-full sm:flex-1"
                    />
                    <Button
                      onClick={handleConnectRepo}
                      disabled={!selectedRepoFullName || connectingRepo}
                      className="h-10 px-5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold cursor-pointer shrink-0"
                    >
                      {connectingRepo && <Loader2 className="size-3.5 animate-spin mr-1" />}
                      {lang === "en" ? "Connect & Install" : "Bağla ve Kur"}
                    </Button>
                  </div>
                  {connectRepoError && <p className="text-xs text-destructive">{connectRepoError}</p>}
                </div>
              ) : installedReposLoaded ? (
                <div className="p-3.5 rounded-xl border border-border bg-muted/30 text-[11px] text-muted-foreground">
                  {lang === "en" ? "No GitHub App installed yet — " : "Henüz kurulu bir GitHub App yok — "}
                  <Link href="/settings" className="text-primary font-semibold hover:underline">
                    {lang === "en" ? "connect one in Settings" : "Ayarlar'dan bağlayın"}
                  </Link>
                  {lang === "en" ? " to pick a repository here, or enter a repo URL manually below." : ", ya da aşağıya elle bir repo adresi girin."}
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="repoUrl" className="text-xs font-bold text-foreground/90">
                    {t("sites.detail.repoAddressLabel")}
                  </Label>
                  <Input
                    id="repoUrl"
                    placeholder="git@github.com:owner/repo.git"
                    disabled={!!githubRepoFullName}
                    className="font-mono text-xs h-10 rounded-xl bg-card border border-border text-foreground disabled:opacity-60"
                    value={gitForm.repoUrl}
                    onChange={(e) => setGitForm((f) => ({ ...f, repoUrl: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gitBranch" className="text-xs font-bold text-foreground/90">
                    {t("sites.detail.branchNameLabel")}
                  </Label>
                  <Input
                    id="gitBranch"
                    placeholder="main"
                    disabled={!!githubRepoFullName}
                    className="font-mono text-xs h-10 rounded-xl bg-card border border-border text-foreground disabled:opacity-60"
                    value={gitForm.gitBranch}
                    onChange={(e) => setGitForm((f) => ({ ...f, gitBranch: e.target.value }))}
                  />
                </div>
              </div>

              {/* Otomatik Pull Switch */}
              <div className="flex items-center justify-between rounded-xl border border-border p-4 bg-muted/30">
                <div>
                  <p className="text-xs font-bold text-foreground">{t("sites.detail.autoPullRestartLabel")}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {t("sites.detail.autoPullDesc")}
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
                  <Label htmlFor="autoPullInterval" className="text-xs font-bold text-foreground/90">
                    {t("sites.detail.checkIntervalSecLabel")}
                  </Label>
                  <Input
                    id="autoPullInterval"
                    type="number"
                    min={5}
                    max={86400}
                    className="h-10 rounded-xl font-mono text-xs bg-card border border-border text-foreground"
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
                <Label htmlFor="processManager" className="text-xs font-bold text-foreground/90">
                  {t("sites.detail.processManagerLabel")}
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
                      ? [{ value: "SYSTEMD", label: lang === "en" ? "systemd (managed by panel — default)" : "systemd (panel yönetiyor — varsayılan)" }]
                      : []),
                    { value: "DOCKER_COMPOSE", label: "Docker Compose (docker compose restart)" },
                    { value: "PM2", label: "PM2 (pm2 restart)" },
                    { value: "CUSTOM_SCRIPT", label: lang === "en" ? "Custom script" : "Özel script betiği" },
                  ]}
                  className="w-full"
                />
              </div>

              {gitForm.processManager === "CUSTOM_SCRIPT" && (
                <div className="space-y-2">
                  <Label htmlFor="customRestartCommand" className="text-xs font-bold text-foreground/90">
                    {t("sites.detail.customRestartScriptLabel")}
                  </Label>
                  <Input
                    id="customRestartCommand"
                    placeholder={`/var/www/${site.domain}/deploy/restart.sh`}
                    className="font-mono text-xs h-10 rounded-xl bg-card border border-border text-foreground"
                    value={gitForm.customRestartCommand}
                    onChange={(e) =>
                      setGitForm((f) => ({ ...f, customRestartCommand: e.target.value }))
                    }
                  />
                </div>
              )}

              {gitSaveError && <p className="text-xs text-destructive">{gitSaveError}</p>}

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button
                  onClick={handleGitSave}
                  disabled={gitSaving}
                  className="bg-primary hover:bg-primary-hover text-primary-foreground h-10 px-6 rounded-xl text-xs font-semibold cursor-pointer shadow-sm"
                >
                  {gitSaving && <Loader2 className="size-3.5 animate-spin mr-1" />}
                  {t("sites.detail.saveGitSettings")}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleGitPull}
                  disabled={gitPulling || !gitForm.repoUrl.trim()}
                  className="h-10 px-5 rounded-xl border border-border bg-card text-foreground/90 hover:text-[#580619] dark:hover:text-[#38bdf8] hover:border-[#c8a87c] dark:hover:border-[#38bdf8]/50 text-xs font-semibold cursor-pointer"
                >
                  {gitPulling ? (
                    <Loader2 className="size-3.5 animate-spin mr-1" />
                  ) : (
                    <RotateCw className="size-3.5 mr-1" />
                  )}
                  {t("sites.detail.pullNow")}
                </Button>
                {gitSaveOk && <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">{t("sites.detail.gitSettingsSaved")}</span>}
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
              <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                <span>{t("sites.detail.lastGitPull")}</span>
                <span className="font-mono font-bold text-foreground">
                  {gitLastPull.at ? new Date(gitLastPull.at).toLocaleString(lang === "en" ? "en-US" : "tr-TR") : t("sites.detail.gitPullNever")}
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
                {t("sites.detail.liveLogsTitle")}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t("sites.detail.liveLogsDesc")}
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
              {t("common.refresh")}
            </Button>
          </div>

          {logsError ? (
            <p className="text-xs text-red-600 dark:text-red-400 font-mono">{logsError}</p>
          ) : (
            <pre className="max-h-96 overflow-auto rounded-xl bg-slate-900 dark:bg-[#030610] p-4 font-mono text-xs text-emerald-400 leading-relaxed shadow-inner border border-slate-800 dark:border-[#16223f]">
              {logsLoading && !logs
                ? t("sites.detail.logsLoading")
                : logs.trim()
                ? logs
                : t("sites.detail.logsEmpty")}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
