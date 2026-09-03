"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Loader2,
  Pencil,
  Plus,
  Trash2,
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
  Copy,
  ExternalLink,
  KeyRound,
  GitBranch,
  RefreshCw,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

interface S3ConfigView {
  id: string
  label: string
  bucket: string
  region: string
  endpoint: string | null
  accessKeyId: string
  pathPrefix: string
  hasSecret: boolean
}

interface S3FormState {
  label: string
  bucket: string
  region: string
  endpoint: string
  accessKeyId: string
  secretAccessKey: string
  pathPrefix: string
}

const EMPTY_FORM: S3FormState = {
  label: "",
  bucket: "",
  region: "",
  endpoint: "",
  accessKeyId: "",
  secretAccessKey: "",
  pathPrefix: "",
}

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
  const { theme, setTheme } = useTheme()
  const [configs, setConfigs] = useState<S3ConfigView[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<S3FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

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
    setEditingId(null)
    setForm(EMPTY_FORM)
    setSaveError(null)
    setFormOpen(true)
  }

  function openEditForm(config: S3ConfigView) {
    setEditingId(config.id)
    setForm({
      label: config.label,
      bucket: config.bucket,
      region: config.region,
      endpoint: config.endpoint ?? "",
      accessKeyId: config.accessKeyId,
      secretAccessKey: "",
      pathPrefix: config.pathPrefix,
    })
    setSaveError(null)
    setFormOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const body = {
        label: form.label,
        bucket: form.bucket,
        region: form.region,
        endpoint: form.endpoint || null,
        accessKeyId: form.accessKeyId,
        pathPrefix: form.pathPrefix,
        ...(form.secretAccessKey ? { secretAccessKey: form.secretAccessKey } : {}),
      }
      const res = editingId
        ? await fetch(`/api/settings/s3/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/settings/s3", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
      if (!res.ok) {
        setSaveError(await parseError(res))
        return
      }
      setFormOpen(false)
      setForm(EMPTY_FORM)
      setEditingId(null)
      await load()
    } catch {
      setSaveError("Sunucuya bağlanılamadı.")
    } finally {
      setSaving(false)
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
  const [githubRepos, setGithubRepos] = useState<GitHubRepoOption[]>([])
  const [reposLoading, setReposLoading] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState("")
  const [customRepo, setCustomRepo] = useState("")
  const [selectedSiteId, setSelectedSiteId] = useState("")
  const [deployKeyTitle, setDeployKeyTitle] = useState("")
  const [deployKeyReadOnly, setDeployKeyReadOnly] = useState(true)
  const [creatingDeployKey, setCreatingDeployKey] = useState(false)
  const [createdKey, setCreatedKey] = useState<CreatedDeployKeyInfo | null>(null)
  const [deployKeyError, setDeployKeyError] = useState<string | null>(null)
  const [sites, setSites] = useState<SiteOption[]>([])
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const copyToClipboard = (field: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    })
  }

  const loadGitHubAccount = useCallback(async () => {
    setGithubLoading(true)
    try {
      const res = await fetch("/api/settings/github", { cache: "no-store" })
      if (res.ok) {
        const data = (await res.json()) as { connected: boolean; account: GitHubAccountView | null }
        setGithubAccount(data.account)
        if (data.connected && data.account) {
          loadGitHubRepos()
        }
      }
    } catch {
      // sessizce geç
    } finally {
      setGithubLoading(false)
    }
  }, [])

  const loadGitHubRepos = async () => {
    setReposLoading(true)
    try {
      const res = await fetch("/api/settings/github/repos", { cache: "no-store" })
      if (res.ok) {
        const data = (await res.json()) as { repos: GitHubRepoOption[] }
        setGithubRepos(data.repos || [])
      }
    } catch {
      // sessizce geç
    } finally {
      setReposLoading(false)
    }
  }

  const loadSitesList = useCallback(async () => {
    try {
      const res = await fetch("/api/sites", { cache: "no-store" })
      if (res.ok) {
        const data = (await res.json()) as SiteOption[]
        setSites(data || [])
      }
    } catch {
      // sessizce geç
    }
  }, [])

  useEffect(() => {
    loadGitHubAccount()
    loadSitesList()
  }, [loadGitHubAccount, loadSitesList])

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
        setGithubError(data?.error ?? "GitHub hesabı doğrulanamadı.")
        return
      }
      setGithubAccount(data.account)
      setGithubTokenInput("")
      setGithubSuccess(`GitHub hesabı @${data.account.username} başarıyla bağlandı!`)
      loadGitHubRepos()
    } catch {
      setGithubError("Sunucuya bağlanılamadı.")
    } finally {
      setGithubConnecting(false)
    }
  }

  const handleDisconnectGitHub = async () => {
    if (!window.confirm("GitHub bağlantısı kaldırılsın mı? Kayıtlı token silinecektir.")) return
    setGithubDisconnecting(true)
    setGithubError(null)
    setGithubSuccess(null)
    try {
      const res = await fetch("/api/settings/github", { method: "DELETE" })
      if (!res.ok) {
        setGithubError("Bağlantı kaldırılamadı.")
        return
      }
      setGithubAccount(null)
      setGithubRepos([])
      setCreatedKey(null)
      setGithubSuccess("GitHub bağlantısı başarıyla kaldırıldı.")
    } catch {
      setGithubError("Sunucuya bağlanılamadı.")
    } finally {
      setGithubDisconnecting(false)
    }
  }

  const handleCreateGitHubDeployKey = async () => {
    const repoTarget = selectedRepo || customRepo.trim()
    if (!repoTarget) {
      setDeployKeyError("Lütfen bir GitHub deposu seçin veya girin.")
      return
    }

    const parts = repoTarget.split("/")
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      setDeployKeyError("Depo formatı 'kullanıcı/depo' (owner/repo) şeklinde olmalıdır.")
      return
    }

    const [owner, repo] = parts
    setCreatingDeployKey(true)
    setDeployKeyError(null)
    setCreatedKey(null)

    try {
      const res = await fetch("/api/settings/github/deploy-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner,
          repo,
          siteId: selectedSiteId || undefined,
          title: deployKeyTitle.trim() || undefined,
          readOnly: deployKeyReadOnly,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setDeployKeyError(data?.error ?? "Deploy key oluşturulamadı.")
        return
      }

      setCreatedKey(data.deployKey)
    } catch {
      setDeployKeyError("Sunucuya bağlanılamadı.")
    } finally {
      setCreatingDeployKey(false)
    }
  }

  const [openSections, setOpenSections] = useState<{
    theme: boolean
    domain: boolean
    s3: boolean
    github: boolean
  }>({
    theme: true,
    domain: true,
    s3: true,
    github: true,
  })

  const toggleSection = (section: "theme" | "domain" | "s3" | "github") => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const canBindDomain = domainForm.domain.trim() && domainForm.email.trim() && !domainSaving

  const canSubmit =
    form.bucket.trim() && form.region.trim() && form.accessKeyId.trim() && (editingId ? true : form.secretAccessKey.trim())

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
              Sistem Ayarları
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-0.5">
              Tema görünümü, panel erişim alan adı, SSL sertifikaları ve S3 bulut depolama yapılandırmaları.
            </p>
          </div>
        </div>
      </div>

      {/* ═══ 2. GÖRÜNÜM VE TEMA SEÇİM KARTI (AÇILIR SEKME) ═══ */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden transition-all">
        {/* Tıklanabilir Başlık Çubuğu */}
        <div
          onClick={() => toggleSection("theme")}
          className="flex items-center justify-between p-5 md:p-6 select-none cursor-pointer hover:bg-slate-50/50 dark:hover:bg-[#0c1630]/50 transition-colors"
        >
          <div className="flex items-center gap-3.5">
            <div className="size-10 rounded-2xl bg-[#580619]/10 dark:bg-[#101c38] text-[#580619] dark:text-blue-300 flex items-center justify-center border border-transparent dark:border-[#1e3568]/50 shadow-2xs shrink-0">
              <Palette className="size-5" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-base md:text-lg text-slate-900 dark:text-slate-100">
                Arayüz Teması ve Görünüm
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-sans">
                Panel için tercih ettiğiniz renk paletini ve tema modunu seçin.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-[#101c38] text-slate-700 dark:text-blue-300 border border-slate-200/80 dark:border-[#1e3568]/50">
              {theme === "dark" ? (
                <>
                  <Moon className="size-3 text-blue-300" /> Koyu Tema
                </>
              ) : (
                <>
                  <Sun className="size-3 text-amber-600" /> Açık Tema
                </>
              )}
            </span>
            <div
              className={cn(
                "size-8 rounded-xl flex items-center justify-center border border-slate-200 dark:border-[#16223f] bg-slate-50 dark:bg-[#060a17] text-slate-500 dark:text-slate-300 transition-transform duration-200",
                openSections.theme && "rotate-180 bg-slate-100 dark:bg-[#101c38] text-slate-900 dark:text-blue-300 border-slate-300 dark:border-[#2a4687]"
              )}
            >
              <ChevronDown className="size-4" />
            </div>
          </div>
        </div>

        {/* Aşağı Doğru Açılan İçerik */}
        {openSections.theme && (
          <div className="p-5 md:p-6 pt-0 border-t border-slate-100 dark:border-[#16223f] space-y-6 animate-in fade-in-0 duration-200">
            <div className="grid sm:grid-cols-2 gap-4 pt-4">
              {/* Açık Tema Seçenek Kartı */}
              <div
                onClick={() => setTheme("light")}
                className={cn(
                  "group relative flex flex-col justify-between p-5 rounded-2xl border-2 transition-all cursor-pointer",
                  theme === "light"
                    ? "border-[#580619] bg-[#580619]/5 shadow-sm"
                    : "border-slate-200 dark:border-[#16223f] bg-slate-50/50 dark:bg-[#060a17] hover:border-slate-300 dark:hover:border-[#2a4687]"
                )}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="size-8 rounded-xl bg-amber-100/80 text-amber-800 flex items-center justify-center">
                        <Sun className="size-4" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Açık Tema</h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">Kraliyet Bordosu & Altın Vurgular</p>
                      </div>
                    </div>
                    {theme === "light" && (
                      <div className="size-6 rounded-full bg-[#580619] text-white flex items-center justify-center shadow-xs">
                        <Check className="size-3.5" />
                      </div>
                    )}
                  </div>

                  {/* Tema Minyatür Önizleme */}
                  <div className="rounded-xl border border-slate-200 bg-[#f8fafc] p-2.5 flex gap-2">
                    <div className="w-12 h-14 rounded-lg bg-[#580619] flex flex-col items-center justify-center p-1">
                      <div className="w-6 h-1 rounded bg-[#dfc9a0] mb-1" />
                      <div className="w-4 h-1 rounded bg-white/40" />
                    </div>
                    <div className="flex-1 space-y-1.5 pt-1">
                      <div className="w-16 h-2 rounded bg-slate-300" />
                      <div className="w-full h-8 rounded-lg bg-white border border-slate-200" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Koyu Tema Seçenek Kartı */}
              <div
                onClick={() => setTheme("dark")}
                className={cn(
                  "group relative flex flex-col justify-between p-5 rounded-2xl border-2 transition-all cursor-pointer",
                  theme === "dark"
                    ? "border-[#2a4687] bg-[#101c38] shadow-sm ring-2 ring-[#2a4687]/40"
                    : "border-slate-200 dark:border-[#16223f] bg-slate-50/50 dark:bg-[#060a17] hover:border-slate-300 dark:hover:border-[#2a4687]"
                )}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="size-8 rounded-xl bg-[#101c38] text-blue-300 border border-[#1e3568]/50 flex items-center justify-center">
                        <Moon className="size-4" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Koyu Tema</h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">Gece Okyanus Laciverti & Sisli Gri</p>
                      </div>
                    </div>
                    {theme === "dark" && (
                      <div className="size-6 rounded-full bg-[#162752] text-white flex items-center justify-center shadow-xs border border-[#2a4687]/60">
                        <Check className="size-3.5 font-bold" />
                      </div>
                    )}
                  </div>

                  {/* Tema Minyatür Önizleme */}
                  <div className="rounded-xl border border-slate-800 bg-[#040711] p-2.5 flex gap-2">
                    <div className="w-12 h-14 rounded-lg bg-[#0b1739] border border-[#16223f] flex flex-col items-center justify-center p-1">
                      <div className="w-6 h-1 rounded bg-[#cbd5e1] mb-1" />
                      <div className="w-4 h-1 rounded bg-slate-700" />
                    </div>
                    <div className="flex-1 space-y-1.5 pt-1">
                      <div className="w-16 h-2 rounded bg-slate-700" />
                      <div className="w-full h-8 rounded-lg bg-[#090e1f] border border-[#16223f]" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
                Panel Alan Adı ve Otomatik SSL
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-sans">
                Rudder paneline kendi özel alan adınızla (<span className="font-mono text-slate-700 dark:text-slate-300">panel.siteniz.com</span>) güvenli HTTPS üzerinden erişin.
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
                Yapılandırılmadı
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
                          Let&apos;s Encrypt SSL sertifikası aktif ve otomatik olarak yenilenir.
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
                      Bağlantıyı Kaldır
                    </Button>
                  </div>
                )}

                {/* Form Alanları */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Panel Alan Adı (FQDN)</Label>
                    <Input
                      value={domainForm.domain}
                      onChange={(e) => setDomainForm((f) => ({ ...f, domain: e.target.value }))}
                      placeholder="panel.ornek.com"
                      className="font-mono text-xs h-11 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      SSL Bildirim E-postası (Let&apos;s Encrypt)
                    </Label>
                    <Input
                      type="email"
                      value={domainForm.email}
                      onChange={(e) => setDomainForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="admin@ornek.com"
                      className="text-xs h-11 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200/80 dark:border-[#16223f] bg-amber-50/50 dark:bg-[#060a17] p-3.5 text-xs text-amber-900 dark:text-slate-300 flex items-start gap-2.5">
                  <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    Alan adınızın <strong>DNS A kaydının</strong> bu sunucunun genel IP adresini gösterdiğinden emin olun. SSL doğrulaması için port 80/443 erişimi gereklidir.
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
                      <Loader2 className="size-4 animate-spin text-[#dfc9a0] dark:text-white" />
                    ) : (
                      <CheckCircle2 className="size-4 text-[#dfc9a0] dark:text-white" />
                    )}
                    {domainSettings?.domain ? "GÜNCELLE VE SSL YENİLE" : "BAĞLA VE SSL SERTİFİKASI AL"}
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
                S3 Bulut Depolama Yapılandırmaları
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-sans">
                AWS S3, Cloudflare R2, MinIO, Wasabi veya DigitalOcean Spaces otomatik yedekleme hedefleri.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-[#101c38] text-slate-700 dark:text-blue-300 border border-slate-200/80 dark:border-[#1e3568]/50">
              <Database className="size-3" /> {configs.length} Profil
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
              <Plus className="size-3.5 text-[#dfc9a0] dark:text-white" />
              <span className="hidden xs:inline">Yeni Yapılandırma</span>
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
            {/* Yeni / Düzenleme Formu */}
            {formOpen && (
              <div className="mt-4 rounded-2xl border border-[#c8a87c]/70 dark:border-[#2a4687] bg-slate-50/60 dark:bg-[#060a17] p-6 shadow-sm space-y-5 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-[#16223f] pb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-[#c8a87c] dark:text-blue-300" />
                    <h3 className="font-heading font-bold text-sm text-slate-900 dark:text-slate-100">
                      {editingId ? "S3 Yapılandırmasını Düzenle" : "Yeni S3 Sağlayıcı Profili Ekle"}
                    </h3>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-sans">AWS S3 / R2 / MinIO Uyumlu</span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Profil Etiketi</Label>
                    <Input
                      value={form.label}
                      onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                      placeholder="Örn: AWS Frankfurt, Cloudflare R2 Yedekler"
                      className="h-10 rounded-xl text-xs bg-white dark:bg-[#090e1f] dark:border-[#16223f] dark:text-slate-100"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Bucket Adı</Label>
                    <Input
                      value={form.bucket}
                      onChange={(e) => setForm((f) => ({ ...f, bucket: e.target.value }))}
                      placeholder="panel-backups-bucket"
                      className="h-10 rounded-xl font-mono text-xs bg-white dark:bg-[#090e1f] dark:border-[#16223f] dark:text-slate-100"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Bölge (Region)</Label>
                    <Input
                      value={form.region}
                      onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                      placeholder="eu-central-1 veya auto"
                      className="h-10 rounded-xl font-mono text-xs bg-white dark:bg-[#090e1f] dark:border-[#16223f] dark:text-slate-100"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Özel Endpoint URL (Opsiyonel — R2 / MinIO / Spaces)
                    </Label>
                    <Input
                      value={form.endpoint}
                      onChange={(e) => setForm((f) => ({ ...f, endpoint: e.target.value }))}
                      placeholder="https://<accountid>.r2.cloudflarestorage.com"
                      className="h-10 rounded-xl font-mono text-xs bg-white dark:bg-[#090e1f] dark:border-[#16223f] dark:text-slate-100"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Access Key ID</Label>
                    <Input
                      value={form.accessKeyId}
                      onChange={(e) => setForm((f) => ({ ...f, accessKeyId: e.target.value }))}
                      className="h-10 rounded-xl font-mono text-xs bg-white dark:bg-[#090e1f] dark:border-[#16223f] dark:text-slate-100"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Secret Access Key {editingId ? "(Değiştirmek istemiyorsanız boş bırakın)" : ""}
                    </Label>
                    <Input
                      type="password"
                      value={form.secretAccessKey}
                      onChange={(e) => setForm((f) => ({ ...f, secretAccessKey: e.target.value }))}
                      placeholder={editingId ? "••••••••••••••••••••••••" : ""}
                      className="h-10 rounded-xl font-mono text-xs bg-white dark:bg-[#090e1f] dark:border-[#16223f] dark:text-slate-100"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Yol Öneki / Klasör (Path Prefix — Opsiyonel)
                    </Label>
                    <Input
                      value={form.pathPrefix}
                      onChange={(e) => setForm((f) => ({ ...f, pathPrefix: e.target.value }))}
                      placeholder="rudder-backups/"
                      className="h-10 rounded-xl font-mono text-xs bg-white dark:bg-[#090e1f] dark:border-[#16223f] dark:text-slate-100"
                    />
                  </div>
                </div>

                {saveError && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-mono bg-red-50 dark:bg-red-950/40 p-2.5 rounded-lg border border-red-200 dark:border-red-900">
                    {saveError}
                  </p>
                )}

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setFormOpen(false)}
                    className="h-10 px-4 rounded-xl text-xs font-semibold dark:border-[#16223f] dark:text-slate-300 dark:hover:bg-[#111f40]"
                  >
                    Vazgeç
                  </Button>
                  <Button
                    size="sm"
                    disabled={!canSubmit || saving}
                    onClick={handleSave}
                    className="bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white h-10 px-6 rounded-xl text-xs font-semibold border border-[#c8a87c]/40 dark:border-[#2a4687]/60"
                  >
                    {saving && <Loader2 className="size-3.5 animate-spin mr-1 text-[#dfc9a0] dark:text-white" />}
                    {editingId ? "Değişiklikleri Kaydet" : "Profili Oluştur"}
                  </Button>
                </div>
              </div>
            )}

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
                  Henüz bir S3 yapılandırması eklenmedi.
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1 mb-4">
                  Sitelerinizin veritabanı ve dosya yedeklerini güvenli bulut depolama alanına aktarmak için ilk profilinizi oluşturun.
                </p>
                <Button
                  size="sm"
                  onClick={openCreateForm}
                  className="bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white text-xs font-semibold px-4 h-9 rounded-xl border border-[#c8a87c]/40 dark:border-[#2a4687]/60 cursor-pointer"
                >
                  <Plus className="size-3.5 mr-1 text-[#dfc9a0] dark:text-white" />
                  İlk S3 Profilini Ekle
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 pt-4">
                {configs.map((config) => (
                  <div
                    key={config.id}
                    className="flex flex-col justify-between p-5 rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#060a17] hover:border-[#c8a87c]/60 dark:hover:border-[#2a4687] shadow-xs hover:shadow-sm transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-heading font-bold text-sm text-slate-900 dark:text-slate-100">
                          {config.label || "İsimsiz S3 Profili"}
                        </span>
                        <span className="text-[10px] font-mono font-bold bg-[#580619]/10 dark:bg-[#101c38] text-[#580619] dark:text-blue-300 px-2 py-0.5 rounded-full border border-[#c8a87c]/30 dark:border-[#1e3568]/50">
                          S3 Uyumlu
                        </span>
                      </div>

                      <div className="mt-3 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 dark:text-slate-500">Bucket:</span>
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{config.bucket}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 dark:text-slate-500">Bölge (Region):</span>
                          <span className="font-mono text-slate-800 dark:text-slate-200">{config.region}</span>
                        </div>
                        {config.endpoint && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 dark:text-slate-500">Özel Endpoint:</span>
                            <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate max-w-[200px]" title={config.endpoint}>
                              {config.endpoint}
                            </span>
                          </div>
                        )}
                        {config.pathPrefix && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 dark:text-slate-500">Yol Öneki:</span>
                            <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">{config.pathPrefix}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-[#16223f]">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditForm(config)}
                        className="h-8 rounded-xl text-xs font-semibold px-3 dark:border-[#16223f] dark:text-slate-300 dark:hover:border-[#2a4687] dark:hover:bg-[#111f40]"
                      >
                        <Pencil className="size-3 mr-1 text-[#c8a87c] dark:text-blue-300" />
                        Düzenle
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={deletingId === config.id}
                        onClick={() => handleDelete(config.id)}
                        className="h-8 rounded-xl text-xs font-semibold px-3 border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        {deletingId === config.id ? (
                          <Loader2 className="size-3 animate-spin mr-1" />
                        ) : (
                          <Trash2 className="size-3 mr-1" />
                        )}
                        Sil
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                GitHub Entegrasyonu ve Deploy Key Yönetimi
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-sans">
                GitHub hesabınızı bağlayarak depolarınız için sunucudan doğrudan Deploy Key oluşturun ve GitHub&apos;a aktarın.
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
                Bağlantı Yok
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
                  Kapat
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
                  Kapat
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
                        GitHub Personal Access Token (PAT) ile Bağlanın
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Depolarınızı otomatik listelemek ve sunucudan tek tıkla Deploy Key eklemek için GitHub erişim token&apos;ınızı girin.
                      </p>
                    </div>

                    <a
                      href="https://github.com/settings/tokens/new?scopes=repo,admin:public_key&description=Rudder+Cloud+Server+Panel"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-[#101c38] text-slate-700 dark:text-blue-200 border border-slate-200 dark:border-[#1e3568]/50 hover:border-[#c8a87c] dark:hover:border-[#2a4687] shadow-2xs hover:shadow-xs transition-all shrink-0 cursor-pointer"
                    >
                      <ExternalLink className="size-3.5 text-[#c8a87c] dark:text-blue-300" />
                      Gerekli İzinlerle Token Oluştur
                    </a>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      GitHub Personal Access Token (Classic veya Fine-Grained)
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
                          <Loader2 className="size-4 animate-spin text-[#dfc9a0] dark:text-white" />
                        ) : (
                          <CheckCircle2 className="size-4 text-[#dfc9a0] dark:text-white" />
                        )}
                        BAĞLA VE DOĞRULA
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200/60 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-3 text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
                    <p className="font-semibold text-slate-700 dark:text-slate-300">
                      Gerekli GitHub İzinleri:
                    </p>
                    <ul className="list-disc list-inside space-y-0.5 text-slate-600 dark:text-slate-400">
                      <li><strong>repo</strong> — Özel ve genel depoların listelenmesi ve deploy key eklenmesi için.</li>
                      <li><strong>admin:public_key</strong> — Depoların Deploy Keys bölümüne SSH anahtarının otomatik kaydedilmesi için.</li>
                    </ul>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 pt-1">
                      🔒 Token&apos;ınız sunucu tarafında AES-256-GCM ile güvenle şifrelenir ve hiçbir istemciye açık olarak iletilmez.
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
                          {githubAccount.publicRepos + githubAccount.totalPrivateRepos} Depo ({githubAccount.totalPrivateRepos} Gizli)
                        </span>
                        <span className="text-[11px] font-mono bg-emerald-50 dark:bg-[#101c38] px-2.5 py-0.5 rounded-lg border border-emerald-200/80 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-400">
                          Aktif PAT Bağlantısı
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        loadGitHubRepos()
                        loadGitHubAccount()
                      }}
                      disabled={reposLoading}
                      className="h-9 px-3 rounded-xl text-xs font-semibold dark:border-[#16223f] dark:text-slate-300 dark:hover:bg-[#111f40]"
                    >
                      <RefreshCw className={cn("size-3.5 mr-1 text-[#c8a87c] dark:text-blue-300", reposLoading && "animate-spin")} />
                      Yenile
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
                      Bağlantıyı Kaldır
                    </Button>
                  </div>
                </div>

                {/* 2. Deploy Key Oluşturma ve GitHub'a Aktarma Bölümü */}
                <div className="rounded-2xl border border-[#c8a87c]/70 dark:border-[#2a4687] bg-slate-50/40 dark:bg-[#060a17] p-6 space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-[#16223f] pb-3">
                    <div className="flex items-center gap-2">
                      <KeyRound className="size-4 text-[#c8a87c] dark:text-blue-300" />
                      <h3 className="font-heading font-bold text-sm text-slate-900 dark:text-slate-100">
                        GitHub Deposuna Deploy Key Ekle
                      </h3>
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-sans">
                      Sunucuda ed25519 üretilir ve seçilen depoya otomatik yazılır
                    </span>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* Depo Seçimi */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        GitHub Deposu (Repository)
                      </Label>
                      {githubRepos.length > 0 ? (
                        <select
                          value={selectedRepo}
                          onChange={(e) => {
                            setSelectedRepo(e.target.value)
                            if (e.target.value) setCustomRepo("")
                          }}
                          className="w-full h-10 px-3 rounded-xl text-xs bg-white dark:bg-[#090e1f] border border-slate-200 dark:border-[#16223f] text-slate-900 dark:text-slate-100 font-mono outline-none focus:ring-1 focus:ring-[#c8a87c] dark:focus:ring-[#2a4687]"
                        >
                          <option value="">Depolarınızdan seçin ({githubRepos.length} depo)...</option>
                          {githubRepos.map((r) => (
                            <option key={r.id} value={r.fullName}>
                              {r.private ? "🔒 " : "🌐 "} {r.fullName} ({r.defaultBranch})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          value={customRepo}
                          onChange={(e) => setCustomRepo(e.target.value)}
                          placeholder="kullanici/depo-adi (örn: alisolmazz/projem)"
                          className="h-10 rounded-xl font-mono text-xs bg-white dark:bg-[#090e1f] dark:border-[#16223f] dark:text-slate-100"
                        />
                      )}
                      {githubRepos.length > 0 && (
                        <div className="pt-1">
                          <input
                            type="text"
                            value={customRepo}
                            onChange={(e) => {
                              setCustomRepo(e.target.value)
                              if (e.target.value) setSelectedRepo("")
                            }}
                            placeholder="Veya elle yazın: owner/repo"
                            className="w-full h-8 px-3 rounded-lg text-[11px] bg-white/70 dark:bg-[#090e1f]/70 border border-slate-200 dark:border-[#16223f] text-slate-800 dark:text-slate-200 font-mono"
                          />
                        </div>
                      )}
                    </div>

                    {/* Site ile İlişkilendirme */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Rudder Sitesi ile Eşleştir (Opsiyonel)
                      </Label>
                      <select
                        value={selectedSiteId}
                        onChange={(e) => setSelectedSiteId(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl text-xs bg-white dark:bg-[#090e1f] border border-slate-200 dark:border-[#16223f] text-slate-900 dark:text-slate-100 font-mono outline-none focus:ring-1 focus:ring-[#c8a87c] dark:focus:ring-[#2a4687]"
                      >
                        <option value="">Bağımsız Anahtar (Hiçbir siteye bağlama)</option>
                        {sites.map((s) => (
                          <option key={s.id} value={s.id}>
                            🌐 {s.domain}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Seçilen sitenin &quot;Git &amp; Dağıtım&quot; ayarlarındaki deploy key otomatik güncellenir.
                      </p>
                    </div>

                    {/* Anahtar Başlığı */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        GitHub Anahtar Başlığı (Title)
                      </Label>
                      <Input
                        value={deployKeyTitle}
                        onChange={(e) => setDeployKeyTitle(e.target.value)}
                        placeholder="Rudder Cloud Deploy Key"
                        className="h-10 rounded-xl text-xs bg-white dark:bg-[#090e1f] dark:border-[#16223f] dark:text-slate-100"
                      />
                    </div>

                    {/* Salt Okunur Seçeneği */}
                    <div className="space-y-1.5 flex flex-col justify-center pt-2">
                      <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={deployKeyReadOnly}
                          onChange={(e) => setDeployKeyReadOnly(e.target.checked)}
                          className="size-4 rounded accent-[#580619] dark:accent-[#162752]"
                        />
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Salt-Okunur (Read-Only) — Önerilen
                        </span>
                      </label>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Yalnızca git clone ve pull işlemlerine izin verir, depoya yazma yetkisi vermez.
                      </p>
                    </div>
                  </div>

                  {deployKeyError && (
                    <p className="text-xs text-red-600 dark:text-red-400 font-mono bg-red-50 dark:bg-red-950/40 p-2.5 rounded-lg border border-red-200 dark:border-red-900">
                      {deployKeyError}
                    </p>
                  )}

                  <div className="flex justify-end pt-1">
                    <Button
                      disabled={(!selectedRepo && !customRepo.trim()) || creatingDeployKey}
                      onClick={handleCreateGitHubDeployKey}
                      className="bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white font-semibold text-xs uppercase tracking-wider px-6 h-10 rounded-xl shadow-md transition-all flex items-center gap-2 border border-[#c8a87c]/40 dark:border-[#2a4687]/60 cursor-pointer"
                    >
                      {creatingDeployKey ? (
                        <Loader2 className="size-4 animate-spin text-[#dfc9a0] dark:text-white" />
                      ) : (
                        <KeyRound className="size-4 text-[#dfc9a0] dark:text-white" />
                      )}
                      DEPLOY KEY OLUŞTUR VE GITHUB&apos;A GÖNDER
                    </Button>
                  </div>

                  {/* Üretilen Anahtar Sonuç Kutusu */}
                  {createdKey && (
                    <div className="mt-4 rounded-xl border border-emerald-300/80 dark:border-emerald-800/80 bg-emerald-50/50 dark:bg-emerald-950/30 p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200">
                      <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-xs">
                        <CheckCircle2 className="size-4.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Deploy Key başarıyla üretildi ve GitHub deposuna kaydedildi!</span>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            Önerilen Git SSH Klonlama Adresi:
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard("sshUrl", createdKey.suggestedSshUrl)}
                            className="h-7 text-xs font-semibold"
                          >
                            <Copy className="size-3 mr-1" />
                            {copiedField === "sshUrl" ? "Kopyalandı!" : "Kopyala"}
                          </Button>
                        </div>
                        <pre className="p-2.5 rounded-lg bg-white dark:bg-[#060a17] border border-slate-200 dark:border-[#16223f] font-mono text-xs text-slate-800 dark:text-slate-200 overflow-x-auto">
                          {createdKey.suggestedSshUrl}
                        </pre>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-slate-500 dark:text-slate-400">SSH Alias:</span>
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-200 ml-2">
                            {createdKey.hostAlias}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 dark:text-slate-400">Parmak İzi:</span>
                          <span className="font-mono text-[11px] text-slate-800 dark:text-slate-200 ml-2">
                            {createdKey.fingerprint}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            Public Key (GitHub&apos;a eklendi):
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard("pubKey", createdKey.publicKey)}
                            className="h-7 text-xs font-semibold"
                          >
                            <Copy className="size-3 mr-1" />
                            {copiedField === "pubKey" ? "Kopyalandı!" : "Kopyala"}
                          </Button>
                        </div>
                        <pre className="p-2.5 rounded-lg bg-white dark:bg-[#060a17] border border-slate-200 dark:border-[#16223f] font-mono text-[11px] text-slate-700 dark:text-slate-300 overflow-x-auto">
                          {createdKey.publicKey}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

