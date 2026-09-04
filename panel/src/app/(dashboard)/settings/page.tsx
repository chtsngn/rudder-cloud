"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Loader2,
  Pencil,
  Plus,
  Trash2,
  AlertCircle,
  Settings as SettingsIcon,
  Globe,
  Lock,
  Database,
  Cloud,
  ShieldCheck,
  ShieldAlert,
  ArrowUpRight,
  Server,
  Sparkles,
  CheckCircle2,
  HardDrive,
  Sun,
  Moon,
  Palette,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  KeyRound,
  GitBranch,
  RefreshCw,
  Languages,
  Zap,
  Type,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTheme } from "@/components/theme-provider"
import { useTranslation } from "@/components/language-provider"
import { cn } from "@/lib/utils"
import { S3ConfigDialog, type S3ConfigView } from "@/components/s3-config-dialog"
import { ThemePalettePicker } from "@/components/theme-palette-picker"
import { FontPicker } from "@/components/font-picker"
import { useFontTheme } from "@/lib/font-theme"

interface PanelDomainSettings {
  domain: string | null
  domainEmail: string | null
  sslEnabled: boolean
  sslStatus: "none" | "pending" | "active" | "error" | string
  lastError: string | null
  updatedAt: string
}

interface DomainFormState {
  domain: string
  email: string
}

const EMPTY_DOMAIN_FORM: DomainFormState = { domain: "", email: "" }

interface GitHubAccountView {
  id: string
  username: string
  name: string | null
  avatarUrl: string
  htmlUrl: string
  scopes: string[]
  publicRepos: number
  totalPrivateRepos: number
  createdAt: string
  updatedAt: string
}

interface GitHubRepoOption {
  id: number
  name: string
  fullName: string
  owner: string
  private: boolean
  htmlUrl: string
  sshUrl: string
  defaultBranch: string
  description: string | null
}

interface SiteOption {
  id: string
  domain: string
  repoUrl: string | null
}

interface CreatedDeployKeyInfo {
  keyName: string
  hostAlias: string
  publicKey: string
  fingerprint: string
  createdAt: string
  suggestedSshUrl: string
  githubKey?: {
    id: number
    title: string
    verified: boolean
    readOnly: boolean
  }
}

const SSL_STATUS_CONFIG: Record<
  string,
  { label: string; badge: string; dot: string }
> = {
  none: {
    label: "Bağlanmadı (HTTP)",
    badge: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
  },
  pending: {
    label: "Sertifika Alınıyor...",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500 animate-pulse",
  },
  active: {
    label: "Aktif (Let's Encrypt HTTPS)",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
    dot: "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]",
  },
  error: {
    label: "Doğrulama Hatası",
    badge: "bg-red-50 text-red-700 border-red-200",
    dot: "bg-red-500 animate-pulse",
  },
}

async function parseError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  return data?.error ?? `İstek başarısız oldu (${res.status}).`
}

export default function SettingsPage() {
  const { theme, setTheme, toggleTheme } = useTheme()
  const { t, lang, setLang } = useTranslation()
  const { activeOption: activeFont } = useFontTheme()
  const [configs, setConfigs] = useState<S3ConfigView[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const [s3DialogOpen, setS3DialogOpen] = useState(false)
  const [dialogConfig, setDialogConfig] = useState<S3ConfigView | null>(null)
  const [testingS3Id, setTestingS3Id] = useState<string | null>(null)
  const [s3TestResults, setS3TestResults] = useState<Record<string, { ok: boolean; message?: string; error?: string }>>({})
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [domainSettings, setDomainSettings] = useState<PanelDomainSettings | null>(null)
  const [domainLoading, setDomainLoading] = useState(true)
  const [domainForm, setDomainForm] = useState<DomainFormState>(EMPTY_DOMAIN_FORM)
  const [domainSaving, setDomainSaving] = useState(false)
  const [domainError, setDomainError] = useState<string | null>(null)
  const [domainRemoving, setDomainRemoving] = useState(false)

  const loadDomain = useCallback(async () => {
    setDomainLoading(true)
    try {
      const res = await fetch("/api/settings/domain", { cache: "no-store" })
      if (!res.ok) return
      const data = (await res.json()) as PanelDomainSettings
      setDomainSettings(data)
      setDomainForm({ domain: data.domain ?? "", email: data.domainEmail ?? "" })
    } catch {
      // sessizce yoksay
    } finally {
      setDomainLoading(false)
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      const res = await fetch("/api/settings/s3", { cache: "no-store" })
      if (!res.ok) {
        setListError(await parseError(res))
        return
      }
      setConfigs((await res.json()) as S3ConfigView[])
    } catch {
      setListError("Sunucuya bağlanılamadı.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      load()
      loadDomain()
    }, 0)
    return () => clearTimeout(timer)
  }, [load, loadDomain])

  function openCreateForm() {
    setDialogConfig(null)
    setS3DialogOpen(true)
  }

  function openEditForm(config: S3ConfigView) {
    setDialogConfig(config)
    setS3DialogOpen(true)
  }

  async function handleTestS3(id: string) {
    setTestingS3Id(id)
    setS3TestResults((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    try {
      const res = await fetch("/api/settings/s3/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setS3TestResults((prev) => ({
          ...prev,
          [id]: {
            ok: true,
            message: lang === "tr" ? "Bağlantı başarılı! Bucket erişilebilir." : "Connection verified! Bucket accessible.",
          },
        }))
      } else {
        setS3TestResults((prev) => ({
          ...prev,
          [id]: {
            ok: false,
            error: data.error || (lang === "tr" ? "Bağlantı testi başarısız." : "Connection test failed."),
          },
        }))
      }
    } catch {
      setS3TestResults((prev) => ({
        ...prev,
        [id]: {
          ok: false,
          error: lang === "tr" ? "Sunucuya bağlanılamadı." : "Failed to connect to server.",
        },
      }))
    } finally {
      setTestingS3Id(null)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Bu S3 yapılandırması silinsin mi? Buna bağlı sitelerin yedekleme S3 ayarı sıfırlanır.")) {
      return
    }
    setDeletingId(id)
    try {
      const res = await fetch(`/api/settings/s3/${id}`, { method: "DELETE" })
      if (!res.ok) {
        setListError(await parseError(res))
        return
      }
      await load()
    } finally {
      setDeletingId(null)
    }
  }

  async function handleBindDomain() {
    setDomainSaving(true)
    setDomainError(null)
    try {
      const res = await fetch("/api/settings/domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domainForm.domain.trim(), email: domainForm.email.trim() }),
      })
      const data = (await res.json().catch(() => null)) as (PanelDomainSettings & { error?: string }) | null
      if (!res.ok) {
        setDomainError(data?.error ?? `İstek başarısız oldu (${res.status}).`)
        if (data) setDomainSettings(data)
        return
      }
      if (data) setDomainSettings(data)
    } catch {
      setDomainError("Sunucuya bağlanılamadı.")
    } finally {
      setDomainSaving(false)
    }
  }

  async function handleRemoveDomain() {
    if (!window.confirm("Panelin alan adı bağlantısı kaldırılsın mı? Panel IP:24428 üzerinden erişilebilir olmaya devam eder.")) {
      return
    }
    setDomainRemoving(true)
    setDomainError(null)
    try {
      const res = await fetch("/api/settings/domain", { method: "DELETE" })
      if (!res.ok) {
        setDomainError(await parseError(res))
        return
      }
      const data = (await res.json()) as PanelDomainSettings
      setDomainSettings(data)
      setDomainForm(EMPTY_DOMAIN_FORM)
    } catch {
      setDomainError("Sunucuya bağlanılamadı.")
    } finally {
      setDomainRemoving(false)
    }
  }

  // ═══ GITHUB ENTEGRASYONU STATE'LERİ ═══
  const [githubAccount, setGithubAccount] = useState<GitHubAccountView | null>(null)
  const [githubLoading, setGithubLoading] = useState(true)
  const [githubTokenInput, setGithubTokenInput] = useState("")
  const [githubConnecting, setGithubConnecting] = useState(false)
  const [githubDisconnecting, setGithubDisconnecting] = useState(false)
  const [githubError, setGithubError] = useState<string | null>(null)
  const [githubSuccess, setGithubSuccess] = useState<string | null>(null)

  // Deploy key oluşturma state'leri
  const loadGitHubAccount = useCallback(async () => {
    setGithubLoading(true)
    try {
      const res = await fetch("/api/settings/github", { cache: "no-store" })
      if (res.ok) {
        const data = (await res.json()) as { connected: boolean; account: GitHubAccountView | null }
        setGithubAccount(data.account)
      }
    } catch {
      // sessizce geç
    } finally {
      setGithubLoading(false)
    }
  }, [])

  useEffect(() => {
    loadGitHubAccount()
  }, [loadGitHubAccount])

  const handleConnectGitHub = async () => {
    if (!githubTokenInput.trim()) return
    setGithubConnecting(true)
    setGithubError(null)
    setGithubSuccess(null)
    try {
      const res = await fetch("/api/settings/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: githubTokenInput.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setGithubError(data?.error ?? (lang === "en" ? "GitHub account could not be verified." : "GitHub hesabı doğrulanamadı."))
        return
      }
      setGithubAccount(data.account)
      setGithubTokenInput("")
      setGithubSuccess(lang === "en" ? `GitHub account @${data.account.username} connected successfully!` : `GitHub hesabı @${data.account.username} başarıyla bağlandı!`)
    } catch {
      setGithubError(lang === "en" ? "Failed to connect to server." : "Sunucuya bağlanılamadı.")
    } finally {
      setGithubConnecting(false)
    }
  }

  const handleDisconnectGitHub = async () => {
    const confirmMsg = lang === "en"
      ? "Disconnect GitHub account? The saved token will be permanently deleted."
      : "GitHub bağlantısı kaldırılsın mı? Kayıtlı token silinecektir."
    if (!window.confirm(confirmMsg)) return
    setGithubDisconnecting(true)
    setGithubError(null)
    setGithubSuccess(null)
    try {
      const res = await fetch("/api/settings/github", { method: "DELETE" })
      if (!res.ok) {
        setGithubError(lang === "en" ? "Failed to disconnect." : "Bağlantı kaldırılamadı.")
        return
      }
      setGithubAccount(null)
      setGithubSuccess(lang === "en" ? "GitHub account disconnected successfully." : "GitHub bağlantısı başarıyla kaldırıldı.")
    } catch {
      setGithubError(lang === "en" ? "Failed to connect to server." : "Sunucuya bağlanılamadı.")
    } finally {
      setGithubDisconnecting(false)
    }
  }


  const [openSections, setOpenSections] = useState<{
    language: boolean
    theme: boolean
    typography: boolean
    domain: boolean
    s3: boolean
    github: boolean
  }>({
    language: false,
    theme: false,
    typography: false,
    domain: false,
    s3: false,
    github: false,
  })

  const toggleSection = (section: "language" | "theme" | "typography" | "domain" | "s3" | "github") => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const canBindDomain = domainForm.domain.trim() && domainForm.email.trim() && !domainSaving

  const domainStatus = domainSettings?.sslStatus
    ? SSL_STATUS_CONFIG[domainSettings.sslStatus] ?? SSL_STATUS_CONFIG.none
    : SSL_STATUS_CONFIG.none

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* ═══ 1. ÜST BAŞLIK ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-3.5">
          <div className="size-12 rounded-2xl bg-[#580619]/5 dark:bg-[#101c38] border border-[#c8a87c]/30 dark:border-[#1e3568]/50 flex items-center justify-center text-[#580619] dark:text-blue-300 shadow-2xs">
            <SettingsIcon className="size-6 text-[#580619] dark:text-blue-300" />
          </div>
          <div>
            <h1 className="font-heading text-2xl md:text-3xl font-extrabold tracking-tight text-[#580619] dark:text-slate-100">
              {t("settings.title")}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-0.5">
              {t("settings.subtitle")}
            </p>
          </div>
        </div>
      </div>

      {/* ═══ 1.5 DİL SEÇİMİ KARTI (AÇILIR SEKME) ═══ */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden transition-all">
        <div
          onClick={() => toggleSection("language")}
          className="flex items-center justify-between p-5 md:p-6 select-none cursor-pointer hover:bg-slate-50/50 dark:hover:bg-[#0c1630]/50 transition-colors"
        >
          <div className="flex items-center gap-3.5">
            <div className="size-10 rounded-2xl bg-[#580619]/10 dark:bg-[#101c38] text-[#580619] dark:text-blue-300 flex items-center justify-center border border-transparent dark:border-[#1e3568]/50 shadow-2xs shrink-0">
              <Languages className="size-5" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-base md:text-lg text-slate-900 dark:text-slate-100">
                {t("settings.sections.language")}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-sans">
                {t("settings.language.subtitle")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-[#101c38] text-slate-700 dark:text-blue-300 border border-slate-200/80 dark:border-[#1e3568]/50">
              {lang === "tr" ? "🇹🇷 Türkçe" : "🇬🇧 English"}
            </span>
            <div
              className={cn(
                "size-8 rounded-xl flex items-center justify-center border border-slate-200 dark:border-[#16223f] bg-slate-50 dark:bg-[#060a17] text-slate-500 dark:text-slate-300 transition-transform duration-200",
                openSections.language && "rotate-180 bg-slate-100 dark:bg-[#101c38] text-slate-900 dark:text-blue-300 border-slate-300 dark:border-[#2a4687]"
              )}
            >
              <ChevronDown className="size-4" />
            </div>
          </div>
        </div>

        {openSections.language && (
          <div className="p-5 md:p-6 pt-0 border-t border-slate-100 dark:border-[#16223f] space-y-6 animate-in fade-in-0 duration-200">
            <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Türkçe Kartı */}
              <button
                type="button"
                onClick={() => setLang("tr")}
                className={cn(
                  "relative flex flex-col p-5 rounded-2xl text-left border transition-all cursor-pointer",
                  lang === "tr"
                    ? "border-primary bg-primary/10 shadow-md ring-2 ring-primary/20"
                    : "border-border bg-card hover:border-primary/50"
                )}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <span className="text-2xl">🇹🇷</span>
                  {lang === "tr" && (
                    <span className="size-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xs">
                      <Check className="size-3.5 stroke-[3] text-primary-foreground" />
                    </span>
                  )}
                </div>
                <h3 className="font-heading font-bold text-sm text-slate-900 dark:text-slate-100">
                  Türkçe
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Panel arayüzünü Türkçe olarak kullanın.
                </p>
              </button>

              {/* English Kartı */}
              <button
                type="button"
                onClick={() => setLang("en")}
                className={cn(
                  "relative flex flex-col p-5 rounded-2xl text-left border transition-all cursor-pointer",
                  lang === "en"
                    ? "border-primary bg-primary/10 shadow-md ring-2 ring-primary/20"
                    : "border-border bg-card hover:border-primary/50"
                )}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <span className="text-2xl">🇬🇧</span>
                  {lang === "en" && (
                    <span className="size-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xs">
                      <Check className="size-3.5 stroke-[3] text-primary-foreground" />
                    </span>
                  )}
                </div>
                <h3 className="font-heading font-bold text-sm text-slate-900 dark:text-slate-100">
                  English
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Use the control panel interface in English.
                </p>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══ 2. TEMA VE RENK PALETİ SEÇİM KARTI ═══ */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-5 md:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-6 transition-all">
        {/* Üst Kısım: Tema Seçimi (Koyu / Açık Mod) */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-heading font-bold text-base md:text-lg text-slate-900 dark:text-slate-100">
              Tema Seçimi
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-sans">
              Uygulamanın açık veya koyu modda görünmesini ayarlayın.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Değiştir:</span>
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === "dark" ? "Açık Moda Geç" : "Koyu Moda Geç"}
              className="size-9 rounded-xl border border-slate-200 dark:border-[#1e3568] bg-slate-50 dark:bg-[#101c38] hover:bg-slate-100 dark:hover:bg-[#162752] text-slate-700 dark:text-blue-300 flex items-center justify-center transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-2xs"
            >
              {theme === "dark" ? (
                <Sun className="size-4.5 text-amber-400" />
              ) : (
                <Moon className="size-4.5 text-blue-500" />
              )}
            </button>
          </div>
        </div>

        {/* İnce Ayırıcı Çizgi */}
        <div className="border-t border-slate-100 dark:border-[#16223f]" />

        {/* Alt Kısım: Renk Teması */}
        <div className="space-y-3.5">
          <div>
            <h3 className="font-heading font-bold text-sm md:text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Palette className="size-4 text-emerald-500 dark:text-emerald-400" />
              <span>Renk Teması</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-sans leading-relaxed">
              Uygulamanın renk ailesini seç — zeminler, kartlar, kenarlıklar ve vurgular birlikte o renge uyarlanır. Koyu/açık moddan bağımsızdır: ikisini istediğin gibi birleştirebilirsin.
            </p>
          </div>

          {/* 9 Renk Ailesi Önizleme Kartları */}
          <ThemePalettePicker />
        </div>
      </div>

      {/* ═══ 2.5 YAZI FONTU & TİPOGRAFİ KARTI (AÇILIR SEKME - BAŞTAN KAPALI) ═══ */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden transition-all">
        {/* Tıklanabilir Başlık Çubuğu */}
        <div
          onClick={() => toggleSection("typography")}
          className="flex items-center justify-between p-5 md:p-6 select-none cursor-pointer hover:bg-slate-50/50 dark:hover:bg-[#0c1630]/50 transition-colors"
        >
          <div className="flex items-center gap-3.5">
            <div className="size-10 rounded-2xl bg-sky-500/10 text-sky-700 dark:text-sky-400 flex items-center justify-center border border-transparent dark:border-sky-500/20 shadow-2xs shrink-0">
              <Type className="size-5" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-base md:text-lg text-slate-900 dark:text-slate-100">
                Yazı Fontu & Tipografi
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-sans">
                Panel başlıkları ve arayüz için Google Fonts seçimi.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-[#101c38] text-slate-700 dark:text-sky-300 border border-slate-200/80 dark:border-[#1e3568]/50">
              <span style={{ fontFamily: activeFont.family }} className="text-sm font-bold">
                {activeFont.name}
              </span>
              {activeFont.isDefault && (
                <span className="text-[10px] text-slate-400 font-mono">(Varsayılan)</span>
              )}
            </span>
            <div
              className={cn(
                "size-8 rounded-xl flex items-center justify-center border border-slate-200 dark:border-[#16223f] bg-slate-50 dark:bg-[#060a17] text-slate-500 dark:text-slate-300 transition-transform duration-200",
                openSections.typography && "rotate-180 bg-slate-100 dark:bg-[#101c38] text-slate-900 dark:text-blue-300 border-slate-300 dark:border-[#2a4687]"
              )}
            >
              <ChevronDown className="size-4" />
            </div>
          </div>
        </div>

        {/* Aşağı Doğru Açılan İçerik (Baştan kapalıdır, tıklanınca açılır) */}
        {openSections.typography && (
          <div className="p-5 md:p-6 pt-0 border-t border-slate-100 dark:border-[#16223f] animate-in fade-in-0 duration-200">
            <FontPicker />
          </div>
        )}
      </div>

      {/* ═══ 3. PANEL ALAN ADI & SSL KARTI (AÇILIR SEKME) ═══ */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden transition-all">
        {/* Tıklanabilir Başlık Çubuğu */}
        <div
          onClick={() => toggleSection("domain")}
          className="flex items-center justify-between p-5 md:p-6 select-none cursor-pointer hover:bg-slate-50/50 dark:hover:bg-[#0c1630]/50 transition-colors"
        >
          <div className="flex items-center gap-3.5">
            <div className="size-10 rounded-2xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 flex items-center justify-center border border-transparent dark:border-emerald-500/20 shadow-2xs shrink-0">
              <Globe className="size-5" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-base md:text-lg text-slate-900 dark:text-slate-100">
                {t("settings.sections.domain")}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-sans">
                {t("settings.domain.subtitle", { domain: "panel.example.com" })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {domainSettings?.domain ? (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50 font-mono">
                <Lock className="size-3" /> {domainSettings.domain}
              </span>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-[#101c38] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-[#16223f]">
                {t("settings.domain.notConfigured")}
              </span>
            )}
            <div
              className={cn(
                "size-8 rounded-xl flex items-center justify-center border border-slate-200 dark:border-[#16223f] bg-slate-50 dark:bg-[#060a17] text-slate-500 dark:text-slate-300 transition-transform duration-200",
                openSections.domain && "rotate-180 bg-slate-100 dark:bg-[#101c38] text-slate-900 dark:text-blue-300 border-slate-300 dark:border-[#2a4687]"
              )}
            >
              <ChevronDown className="size-4" />
            </div>
          </div>
        </div>

        {/* Aşağı Doğru Açılan İçerik */}
        {openSections.domain && (
          <div className="p-5 md:p-6 pt-0 border-t border-slate-100 dark:border-[#16223f] space-y-6 animate-in fade-in-0 duration-200">
            {domainLoading ? (
              <div className="flex items-center justify-center py-8 text-slate-400">
                <Loader2 className="size-6 animate-spin text-[#580619] dark:text-blue-400" />
              </div>
            ) : (
              <div className="space-y-6 pt-4">
                {/* Bağlı Alan Adı Kartı */}
                {domainSettings?.domain && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-emerald-200/80 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/30 p-5">
                    <div className="flex items-start gap-3.5">
                      <div className="size-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                        <ShieldCheck className="size-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2.5">
                          <a
                            href={`https://${domainSettings.domain}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono font-bold text-sm text-emerald-950 dark:text-emerald-300 hover:underline flex items-center gap-1"
                          >
                            {domainSettings.sslEnabled ? `https://${domainSettings.domain}` : domainSettings.domain}
                            <ArrowUpRight className="size-3.5 text-emerald-700 dark:text-emerald-400" />
                          </a>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border shadow-2xs",
                              domainStatus.badge
                            )}
                          >
                            <span className={cn("size-1.5 rounded-full", domainStatus.dot)} />
                            {domainStatus.label}
                          </span>
                        </div>
                        <p className="text-xs text-emerald-800 dark:text-emerald-300/90 mt-1">
                          {t("settings.domain.sslActiveDesc")}
                        </p>
                        {domainSettings.lastError && (
                          <p className="mt-2 text-xs text-red-600 dark:text-red-400 font-mono bg-red-50 dark:bg-red-950/40 p-2 rounded-lg border border-red-200 dark:border-red-900">
                            {domainSettings.lastError}
                          </p>
                        )}
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={domainRemoving}
                      onClick={handleRemoveDomain}
                      className="h-9 rounded-xl border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs font-semibold shrink-0"
                    >
                      {domainRemoving ? (
                        <Loader2 className="size-3.5 animate-spin mr-1" />
                      ) : (
                        <Trash2 className="size-3.5 mr-1" />
                      )}
                      {t("settings.domain.removeBtn")}
                    </Button>
                  </div>
                )}

                {/* Form Alanları */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {t("settings.domain.fqdnLabel")}
                    </Label>
                    <Input
                      value={domainForm.domain}
                      onChange={(e) => setDomainForm((f) => ({ ...f, domain: e.target.value }))}
                      placeholder={t("settings.domain.fqdnPlaceholder")}
                      className="font-mono text-xs h-11 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {t("settings.domain.emailLabel")}
                    </Label>
                    <Input
                      type="email"
                      value={domainForm.email}
                      onChange={(e) => setDomainForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder={t("settings.domain.emailPlaceholder")}
                      className="text-xs h-11 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200/80 dark:border-[#16223f] bg-amber-50/50 dark:bg-[#060a17] p-3.5 text-xs text-amber-900 dark:text-slate-300 flex items-start gap-2.5">
                  <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    {t("settings.domain.dnsWarning")}
                  </span>
                </div>

                {domainError && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-mono bg-red-50 dark:bg-red-950/40 p-3 rounded-xl border border-red-200 dark:border-red-900">
                    {domainError}
                  </p>
                )}

                <div className="flex justify-end pt-1">
                  <Button
                    size="sm"
                    disabled={!canBindDomain || domainSaving}
                    onClick={handleBindDomain}
                    className="bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white font-semibold text-xs uppercase tracking-wider px-6 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2 h-11 border border-[#c8a87c]/40 dark:border-[#2a4687]/60 hover:border-[#c8a87c] dark:hover:border-[#385db3] disabled:opacity-40 cursor-pointer"
                  >
                    {domainSaving ? (
                      <Loader2 className="size-4 animate-spin text-inherit" />
                    ) : (
                      <CheckCircle2 className="size-4 text-inherit" />
                    )}
                    {domainSaving ? t("settings.domain.bindingBtn") : (domainSettings?.domain ? t("common.save") : t("settings.domain.bindBtn"))}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ 4. S3 BULUT DEPOLAMA KARTI (AÇILIR SEKME) ═══ */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden transition-all">
        {/* Tıklanabilir Başlık Çubuğu */}
        <div
          onClick={() => toggleSection("s3")}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 md:p-6 select-none cursor-pointer hover:bg-slate-50/50 dark:hover:bg-[#0c1630]/50 transition-colors"
        >
          <div className="flex items-center gap-3.5">
            <div className="size-10 rounded-2xl bg-[#580619]/10 dark:bg-[#101c38] text-[#580619] dark:text-blue-300 flex items-center justify-center border border-transparent dark:border-[#1e3568]/50 shadow-2xs shrink-0">
              <Cloud className="size-5" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-base md:text-lg text-slate-900 dark:text-slate-100">
                {t("settings.s3.title")}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-sans">
                {t("settings.s3.subtitle")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-[#101c38] text-slate-700 dark:text-blue-300 border border-slate-200/80 dark:border-[#1e3568]/50">
              <Database className="size-3" /> {t("settings.s3.profilesCount", { count: configs.length })}
            </span>

            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                setOpenSections((prev) => ({ ...prev, s3: true }))
                openCreateForm()
              }}
              className="bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white font-semibold text-xs uppercase tracking-wider px-3.5 py-1.5 rounded-xl shadow-sm transition-all flex items-center gap-1.5 h-8.5 border border-[#c8a87c]/40 dark:border-[#2a4687]/60 hover:border-[#c8a87c] dark:hover:border-[#385db3] shrink-0 cursor-pointer"
            >
              <Plus className="size-3.5 text-inherit" />
              <span className="hidden xs:inline">{t("settings.s3.newConfigBtn")}</span>
            </Button>

            <div
              className={cn(
                "size-8 rounded-xl flex items-center justify-center border border-slate-200 dark:border-[#16223f] bg-slate-50 dark:bg-[#060a17] text-slate-500 dark:text-slate-300 transition-transform duration-200",
                openSections.s3 && "rotate-180 bg-slate-100 dark:bg-[#101c38] text-slate-900 dark:text-blue-300 border-slate-300 dark:border-[#2a4687]"
              )}
            >
              <ChevronDown className="size-4" />
            </div>
          </div>
        </div>

        {/* Aşağı Doğru Açılan İçerik */}
        {openSections.s3 && (
          <div className="p-5 md:p-6 pt-0 border-t border-slate-100 dark:border-[#16223f] space-y-6 animate-in fade-in-0 duration-200">
            {listError && (
              <p className="text-xs text-red-600 dark:text-red-400 font-mono bg-red-50 dark:bg-red-950/40 p-3 rounded-xl border border-red-200 dark:border-red-900">
                {listError}
              </p>
            )}

            {/* Profil Listesi */}
            {loading ? (
              <div className="flex items-center justify-center py-8 text-slate-400">
                <Loader2 className="size-6 animate-spin text-[#580619] dark:text-blue-300" />
              </div>
            ) : configs.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-slate-200/80 dark:border-[#16223f] bg-slate-50/40 dark:bg-[#060a17] p-8 text-center flex flex-col items-center justify-center">
                <div className="size-12 rounded-2xl bg-slate-100 dark:bg-[#090e1f] flex items-center justify-center text-slate-400 mb-3 border border-slate-200 dark:border-[#16223f]">
                  <Database className="size-6" />
                </div>
                <h3 className="font-heading font-bold text-sm text-slate-800 dark:text-slate-200">
                  {t("settings.s3.emptyTitle")}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1 mb-4">
                  {t("settings.s3.emptyDesc")}
                </p>
                <Button
                  size="sm"
                  onClick={openCreateForm}
                  className="bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white text-xs font-semibold px-4 h-9 rounded-xl border border-[#c8a87c]/40 dark:border-[#2a4687]/60 cursor-pointer"
                >
                  <Plus className="size-3.5 mr-1 text-inherit" />
                  {t("settings.s3.createFirstBtn")}
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 pt-4">
                {configs.map((config) => {
                  const ep = (config.endpoint || "").toLowerCase()
                  const providerBadge = !ep
                    ? "AWS S3"
                    : ep.includes("r2.cloudflarestorage")
                    ? "Cloudflare R2"
                    : ep.includes("wasabisys")
                    ? "Wasabi"
                    : ep.includes("digitaloceanspaces")
                    ? "DO Spaces"
                    : ep.includes("minio") || ep.includes(":9000")
                    ? "MinIO"
                    : "S3"

                  const testRes = s3TestResults[config.id]
                  const isTesting = testingS3Id === config.id

                  return (
                    <div
                      key={config.id}
                      className="flex flex-col justify-between p-5 rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#060a17] hover:border-[#c8a87c]/60 dark:hover:border-[#2a4687] shadow-xs hover:shadow-sm transition-all"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-heading font-bold text-sm text-slate-900 dark:text-slate-100">
                            {config.label || "S3 Profile"}
                          </span>
                          <span className="text-[10px] font-mono font-bold bg-[#580619]/10 dark:bg-[#101c38] text-[#580619] dark:text-blue-300 px-2 py-0.5 rounded-full border border-[#c8a87c]/30 dark:border-[#1e3568]/50">
                            {providerBadge}
                          </span>
                        </div>

                        <div className="mt-3 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 dark:text-slate-500">{t("settings.s3.bucket")}:</span>
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{config.bucket}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 dark:text-slate-500">{t("settings.s3.region")}:</span>
                            <span className="font-mono text-slate-800 dark:text-slate-200">{config.region}</span>
                          </div>
                          {config.endpoint && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400 dark:text-slate-500">{t("settings.s3.endpoint")}:</span>
                              <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate max-w-[200px]" title={config.endpoint}>
                                {config.endpoint}
                              </span>
                            </div>
                          )}
                          {config.pathPrefix && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400 dark:text-slate-500">{t("settings.s3.prefix")}:</span>
                              <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">{config.pathPrefix}</span>
                            </div>
                          )}

                          {/* Bağlı Siteler */}
                          <div className="pt-2 border-t border-slate-100 dark:border-[#16223f]/60">
                            {config.sites && config.sites.length > 0 ? (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                  {lang === "tr" ? "Kullanan siteler:" : "Used by:"}
                                </span>
                                {config.sites.map((s) => (
                                  <span
                                    key={s.id}
                                    className="font-mono text-[10px] font-semibold bg-slate-100 dark:bg-[#101c38] text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded border border-slate-200 dark:border-[#1e3568]"
                                  >
                                    {s.domain}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                {lang === "tr" ? "Henüz hiçbir siteye atanmadı" : "Not assigned to any site yet"}
                              </span>
                            )}
                          </div>
                        </div>

                        {testRes && (
                          <div
                            className={`mt-2.5 p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
                              testRes.ok
                                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900"
                                : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900"
                            }`}
                          >
                            {testRes.ok ? (
                              <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            ) : (
                              <AlertCircle className="size-3.5 text-red-600 dark:text-red-400 shrink-0" />
                            )}
                            <span>{testRes.ok ? testRes.message : testRes.error}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-[#16223f]">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isTesting}
                          onClick={() => handleTestS3(config.id)}
                          className="h-8 rounded-xl text-xs font-semibold px-2.5 dark:border-[#16223f] dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 cursor-pointer"
                        >
                          {isTesting ? (
                            <Loader2 className="size-3 animate-spin mr-1 text-[#c8a87c] dark:text-blue-300" />
                          ) : (
                            <Zap className="size-3 mr-1 text-amber-500" />
                          )}
                          {lang === "tr" ? "Test Et" : "Test"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditForm(config)}
                          className="h-8 rounded-xl text-xs font-semibold px-3 dark:border-[#16223f] dark:text-slate-300 dark:hover:border-[#2a4687] dark:hover:bg-[#111f40] cursor-pointer"
                        >
                          <Pencil className="size-3 mr-1 text-[#c8a87c] dark:text-blue-300" />
                          {t("settings.s3.editBtn")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={deletingId === config.id}
                          onClick={() => handleDelete(config.id)}
                          className="h-8 rounded-xl text-xs font-semibold px-3 border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                        >
                          {deletingId === config.id ? (
                            <Loader2 className="size-3 animate-spin mr-1" />
                          ) : (
                            <Trash2 className="size-3 mr-1" />
                          )}
                          {t("settings.s3.deleteBtn")}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <S3ConfigDialog
              open={s3DialogOpen}
              onOpenChange={setS3DialogOpen}
              initialConfig={dialogConfig}
              onSuccess={() => load()}
            />
          </div>
        )}
      </div>

      {/* ═══ 5. GITHUB ENTEGRASYONU VE DEPLOY KEY KARTI (AÇILIR SEKME) ═══ */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden transition-all">
        {/* Tıklanabilir Başlık Çubuğu */}
        <div
          onClick={() => toggleSection("github")}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 md:p-6 select-none cursor-pointer hover:bg-slate-50/50 dark:hover:bg-[#0c1630]/50 transition-colors"
        >
          <div className="flex items-center gap-3.5">
            <div className="size-10 rounded-2xl bg-[#580619]/10 dark:bg-[#101c38] text-[#580619] dark:text-blue-300 flex items-center justify-center border border-transparent dark:border-[#1e3568]/50 shadow-2xs shrink-0">
              <svg className="size-5 fill-current" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
            </div>
            <div>
              <h2 className="font-heading font-bold text-base md:text-lg text-slate-900 dark:text-slate-100 flex items-center gap-2">
                {t("settings.sections.github")}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-sans">
                {t("settings.github.subtitle")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto">
            {githubAccount ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-[#101c38] text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-[#1e3568]/50">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                @{githubAccount.username}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-[#101c38] text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-[#1e3568]/50">
                <span className="size-2 rounded-full bg-slate-400" />
                {t("settings.github.notConnected")}
              </span>
            )}

            <div
              className={cn(
                "size-8 rounded-xl flex items-center justify-center border border-slate-200 dark:border-[#16223f] bg-slate-50 dark:bg-[#060a17] text-slate-500 dark:text-slate-300 transition-transform duration-200",
                openSections.github && "rotate-180 bg-slate-100 dark:bg-[#101c38] text-slate-900 dark:text-blue-300 border-slate-300 dark:border-[#2a4687]"
              )}
            >
              <ChevronDown className="size-4" />
            </div>
          </div>
        </div>

        {/* Aşağı Doğru Açılan İçerik */}
        {openSections.github && (
          <div className="p-5 md:p-6 pt-0 border-t border-slate-100 dark:border-[#16223f] space-y-6 animate-in fade-in-0 duration-200">
            {githubSuccess && (
              <div className="mt-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/30 p-3.5 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>{githubSuccess}</span>
                </div>
                <button
                  onClick={() => setGithubSuccess(null)}
                  className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  {t("common.close")}
                </button>
              </div>
            )}

            {githubError && (
              <div className="mt-4 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/60 dark:bg-red-950/30 p-3.5 text-xs text-red-700 dark:text-red-400 flex items-center justify-between">
                <span>{githubError}</span>
                <button
                  onClick={() => setGithubError(null)}
                  className="text-xs text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                >
                  {t("common.close")}
                </button>
              </div>
            )}

            {githubLoading ? (
              <div className="flex items-center justify-center py-8 text-slate-400">
                <Loader2 className="size-6 animate-spin text-[#580619] dark:text-blue-300" />
              </div>
            ) : !githubAccount ? (
              /* --- DURUM 1: HENÜZ BAĞLI DEĞİL --- */
              <div className="space-y-5 pt-4">
                <div className="rounded-2xl border border-slate-200/80 dark:border-[#16223f] bg-slate-50/40 dark:bg-[#060a17] p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h3 className="font-heading font-bold text-sm text-slate-900 dark:text-slate-100">
                        {t("settings.github.notConnectedTitle")}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {t("settings.github.notConnectedDesc")}
                      </p>
                    </div>

                    <a
                      href="https://github.com/settings/tokens/new?scopes=repo,admin:public_key&description=Rudder+Cloud+Server+Panel"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-[#101c38] text-slate-700 dark:text-blue-200 border border-slate-200 dark:border-[#1e3568]/50 hover:border-[#c8a87c] dark:hover:border-[#2a4687] shadow-2xs hover:shadow-xs transition-all shrink-0 cursor-pointer"
                    >
                      <ExternalLink className="size-3.5 text-[#c8a87c] dark:text-blue-300" />
                      {t("settings.github.createTokenBtn")}
                    </a>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {t("settings.github.tokenLabel")}
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        value={githubTokenInput}
                        onChange={(e) => setGithubTokenInput(e.target.value)}
                        placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        className="font-mono text-xs h-11 rounded-xl bg-white dark:bg-[#090e1f] dark:border-[#16223f] dark:text-slate-100 flex-1"
                      />
                      <Button
                        disabled={!githubTokenInput.trim() || githubConnecting}
                        onClick={handleConnectGitHub}
                        className="bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white font-semibold text-xs uppercase tracking-wider px-6 h-11 rounded-xl border border-[#c8a87c]/40 dark:border-[#2a4687]/60 cursor-pointer shrink-0"
                      >
                        {githubConnecting ? (
                          <Loader2 className="size-4 animate-spin text-inherit" />
                        ) : (
                          <CheckCircle2 className="size-4 text-inherit" />
                        )}
                        {t("settings.github.connectBtn")}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200/60 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-3 text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
                    <p className="font-semibold text-slate-700 dark:text-slate-300">
                      {t("settings.github.requiredScopes")}
                    </p>
                    <p className="text-slate-600 dark:text-slate-400">
                      {t("settings.github.requiredScopesDesc")}
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 pt-1">
                      {t("settings.github.securityNote")}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              /* --- DURUM 2: GITHUB BAĞLI --- */
              <div className="space-y-6 pt-4">
                {/* 1. Profil Bilgi Kartı */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-slate-50/50 dark:bg-[#060a17]">
                  <div className="flex items-center gap-4">
                    {githubAccount.avatarUrl ? (
                      <img
                        src={githubAccount.avatarUrl}
                        alt={githubAccount.username}
                        className="size-14 rounded-2xl border-2 border-slate-200 dark:border-[#2a4687] shadow-sm object-cover"
                      />
                    ) : (
                      <div className="size-14 rounded-2xl bg-slate-200 dark:bg-[#101c38] flex items-center justify-center text-slate-500 font-bold text-lg">
                        {githubAccount.username.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                          {githubAccount.name || githubAccount.username}
                        </h3>
                        <a
                          href={githubAccount.htmlUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-blue-300 transition-colors"
                          title="GitHub Profilini Aç"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        @{githubAccount.username}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="text-[11px] font-mono bg-white dark:bg-[#101c38] px-2.5 py-0.5 rounded-lg border border-slate-200 dark:border-[#1e3568]/50 text-slate-700 dark:text-blue-300">
                          {t("settings.github.reposCount", { count: githubAccount.publicRepos + githubAccount.totalPrivateRepos, privateCount: githubAccount.totalPrivateRepos })}
                        </span>
                        <span className="text-[11px] font-mono bg-emerald-50 dark:bg-[#101c38] px-2.5 py-0.5 rounded-lg border border-emerald-200/80 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-400">
                          {t("settings.github.connectedAs")}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadGitHubAccount()}
                      disabled={githubLoading}
                      className="h-9 px-3 rounded-xl text-xs font-semibold dark:border-[#16223f] dark:text-slate-300 dark:hover:bg-[#111f40]"
                    >
                      <RefreshCw className={cn("size-3.5 mr-1 text-[#c8a87c] dark:text-blue-300", githubLoading && "animate-spin")} />
                      {t("settings.github.refreshBtn")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={githubDisconnecting}
                      onClick={handleDisconnectGitHub}
                      className="h-9 px-3 rounded-xl text-xs font-semibold border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      {githubDisconnecting ? (
                        <Loader2 className="size-3.5 animate-spin mr-1" />
                      ) : (
                        <Trash2 className="size-3.5 mr-1" />
                      )}
                      {t("settings.github.disconnectBtn")}
                    </Button>
                  </div>
                </div>

                {/* 2. Bilgilendirme ve Site Yönetimine Yönlendirme Kartı */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-slate-50/50 dark:bg-[#060a17]">
                  <div className="flex items-start gap-3">
                    <div className="size-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                      <CheckCircle2 className="size-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        {lang === "en" ? "GitHub Integration Active" : "GitHub Entegrasyonu Aktif"}
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 max-w-xl leading-relaxed">
                        {lang === "en"
                          ? "You can now assign GitHub repositories and manage Deploy Keys directly from each site's 'Git & Deployment' tab. Deploy keys are generated on the server and automatically pushed to your repository."
                          : "Artık doğrudan sitelerinizin 'Git & Dağıtım' sekmesinden GitHub depolarınızı seçebilir, deploy key oluşturabilir ve depoya tek tıkla gönderebilirsiniz."}
                      </p>
                    </div>
                  </div>
                  <a
                    href="/sites"
                    className="inline-flex items-center justify-center gap-1.5 px-4 h-9 rounded-xl text-xs font-semibold bg-[#580619] dark:bg-[#162752] text-white hover:bg-[#720a22] dark:hover:bg-[#1e346b] transition-all shrink-0 border border-[#c8a87c]/40 dark:border-[#2a4687]/60 cursor-pointer shadow-xs"
                  >
                    <span>{lang === "en" ? "Manage Sites" : "Siteleri Yönet"}</span>
                    <ChevronRight className="size-3.5" />
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

