"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  CheckCircle2,
  Container,
  FileCode2,
  FolderUp,
  GitBranch,
  GitFork,
  Globe,
  Loader2,
  Network,
  ScanSearch,
  Sparkles,
  XCircle,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { BusyPortsHint } from "@/components/busy-ports-hint"
import { useTranslation } from "@/components/language-provider"
import type { ApiSite } from "@/lib/site-adapter"
import type { RepoScan, ScanCardId, ScanHint } from "@/lib/repo-scan"
import { cn } from "@/lib/utils"

/** `GET /api/settings/github/repos` — GitHub App kurulumlarının izin verdiği depolar. */
interface InstalledRepoOption {
  fullName: string
  private: boolean
  defaultBranch: string
  installationId: string
}

type SourceKind = "github" | "git" | "none"
type Step = 1 | 2 | 3 | 4

interface Settings {
  port: string
  containerPort: string
  targetUrl: string
  publishDir: string
  buildCommand: string
  spa: boolean
  envEnabled: boolean
  envText: string
}

type CreateResult =
  | { ok: true; site: ApiSite; warnings: string[]; deployOutput: string | null; note: string | null }
  | { ok: false; message: string; siteId?: string }

const primaryBtn =
  "bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white font-semibold text-xs uppercase tracking-wider px-6 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2 h-11 border border-[#c8a87c]/40 dark:border-[#2a4687]/60 hover:border-[#c8a87c] dark:hover:border-[#385db3] disabled:opacity-40 cursor-pointer"
const outlineBtn = "h-11 px-5 rounded-xl border-slate-200 dark:border-[#16223f] text-xs font-semibold dark:text-slate-300 dark:hover:bg-[#111f40]"
const panelCls = "rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-6 md:p-8 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-6"
const inputCls = "font-mono h-10 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100"
const labelCls = "text-xs font-bold text-slate-700 dark:text-slate-300"
const helpCls = "text-[11px] text-slate-500 dark:text-slate-400"

const EMPTY_SETTINGS: Settings = {
  port: "",
  containerPort: "3000",
  targetUrl: "",
  publishDir: "",
  buildCommand: "",
  spa: false,
  envEnabled: false,
  envText: "",
}

function isSshUrl(url: string): boolean {
  return /^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+:/.test(url) || url.startsWith("ssh://")
}

function cardText(id: ScanCardId, hasRepo: boolean, en: boolean): { title: string; desc: string } {
  switch (id) {
    case "compose":
      return hasRepo
        ? {
            title: "Docker Compose",
            desc: en
              ? "The repository's compose file is started; Nginx proxies to the published port. Every deploy runs `up -d --build`."
              : "Deponun compose dosyası ayağa kaldırılır; Nginx yayınlanan porta yönlendirir. Her deploy'da `up -d --build`.",
          }
        : {
            title: en ? "Docker Compose (example)" : "Docker Compose (örnek)",
            desc: en
              ? "Starts an example compose (nginx:alpine) so the site answers right away; edit the compose file later."
              : "Site hemen yanıt versin diye örnek bir compose (nginx:alpine) başlatılır; compose dosyasını sonra düzenlersin.",
          }
    case "dockerfile":
      return {
        title: "Dockerfile",
        desc: en
          ? "Rudder writes a small compose file: the image is built from the repository's Dockerfile and published on 127.0.0.1 only."
          : "Rudder küçük bir compose yazar: image depodaki Dockerfile'dan derlenir, yalnız 127.0.0.1'de yayınlanır.",
      }
    case "static":
      return hasRepo
        ? {
            title: en ? "Static site" : "Statik site",
            desc: en
              ? "After the optional build the publish folder is served; source code never goes live."
              : "İsteğe bağlı derlemeden sonra yayın klasörü sunulur; kaynak kod yayına çıkmaz.",
          }
        : {
            title: en ? "Static site (upload)" : "Statik site (dosya yükle)",
            desc: en
              ? "Upload files from the Files tab or by dragging them onto the site page."
              : "Dosyaları Dosyalar sekmesinden ya da site sayfasına sürükleyip bırakarak yüklersin.",
          }
    case "proxy":
      return {
        title: en ? "Proxy only" : "Yalnız yönlendirme",
        desc: hasRepo
          ? en
            ? "The repository is cloned into the site folder; Nginx proxies to a port or address and you run the app."
            : "Depo site klasörüne klonlanır; Nginx bir porta/adrese yönlendirir, uygulamayı sen çalıştırırsın."
          : en
            ? "Nginx proxies to a port or address; you run the app (e.g. a service already on the server)."
            : "Nginx bir porta/adrese yönlendirir; uygulamayı sen çalıştırırsın (ör. sunucuda zaten çalışan bir servis).",
      }
  }
}

function cardIcon(id: ScanCardId) {
  switch (id) {
    case "compose":
      return Container
    case "dockerfile":
      return Box
    case "static":
      return Globe
    case "proxy":
      return Network
  }
}

function hintText(h: ScanHint, en: boolean): string {
  switch (h.code) {
    case "compose-port-public":
      return en
        ? `Compose publishes port ${h.detail} on every network interface. Nginx already sits in front, so publish it as "127.0.0.1:${h.detail}:…" — otherwise the app is also reachable directly from outside.`
        : `Compose ${h.detail} portunu tüm ağ arayüzlerinde yayınlıyor. Önünde zaten Nginx var; "127.0.0.1:${h.detail}:…" olarak yayınlayın, yoksa uygulamaya dışarıdan doğrudan da erişilir.`
    case "compose-no-port":
      return en
        ? "No published port found in the compose file: enter the app's port below and publish it in compose as 127.0.0.1:<port>:<container>."
        : "Compose dosyasında yayınlanan port bulunamadı: uygulamanın portunu aşağıya girin ve compose'da 127.0.0.1:<port>:<konteyner> olarak yayınlayın."
    case "node-server":
      return en
        ? "A Node.js server app: Rudder runs apps with Docker for now — add a Dockerfile to the repository (PM2 support comes later)."
        : "Node.js sunucu uygulaması: Rudder şimdilik uygulamaları Docker ile çalıştırır — depoya bir Dockerfile ekleyin (PM2 desteği sonra)."
    case "next-server":
      return en
        ? "Next.js in server mode: run it with Docker (Dockerfile), or set `output: 'export'` to publish it as a static site."
        : "Next.js sunucu modunda: Docker ile çalıştırın (Dockerfile) ya da `output: 'export'` ile statik site olarak yayınlayın."
    case "python-app":
      return en ? "A Python app: run it with Docker (add a Dockerfile)." : "Python uygulaması: Docker ile çalıştırın (depoya bir Dockerfile ekleyin)."
    case "env-example":
      return en
        ? `${h.detail} found: the first .env is pre-filled from it — review the values.`
        : `${h.detail} bulundu: ilk .env bundan doldurulur — değerleri gözden geçirin.`
    case "monorepo":
      return en
        ? "Looks like a monorepo: only the repository root was scanned. Check the build command and publish folder."
        : "Monorepo görünüyor: yalnız depo kökü tarandı. Derleme komutunu ve yayın klasörünü kontrol edin."
    case "nothing-found":
      return en ? "Nothing familiar at the repository root — pick the type yourself." : "Depo kökünde tanıdık bir dosya bulunamadı — türü kendin seç."
  }
}

/**
 * Yeni site sihirbazı (v1.5.0): Kaynak (GitHub deposu / git adresi / repo yok)
 * → Tür (depo geçici klonla taranır, kartlar önerilir — bkz. POST
 * /api/sites/scan) → Ayarlar (taramanın önerileriyle dolu) → Kurulum (site +
 * isteğe bağlı .env / compose + depo bağlama ve ilk deploy).
 */
export default function NewSitePage() {
  const { t, lang } = useTranslation()
  const en = lang === "en"

  const [step, setStep] = useState<Step>(1)
  const [domain, setDomain] = useState("")
  // www varsayılan KAPALI (bkz. docs/ARCHITECTURE.md 2026-09-15): www kaydı
  // yokken certbot tüm SSL isteğini NXDOMAIN ile düşürüyordu.
  const [useWww, setUseWww] = useState(false)
  const [useSsl, setUseSsl] = useState(true)
  const [sslEmail, setSslEmail] = useState("")

  const [installedRepos, setInstalledRepos] = useState<InstalledRepoOption[]>([])
  const [reposLoaded, setReposLoaded] = useState(false)
  const [sourceKind, setSourceKind] = useState<SourceKind>("github")
  const [repoFullName, setRepoFullName] = useState("")
  const [gitUrl, setGitUrl] = useState("")
  const [branch, setBranch] = useState("main")
  const [suggestedPort, setSuggestedPort] = useState<number | null>(null)

  const [scanning, setScanning] = useState(false)
  const [scan, setScan] = useState<RepoScan | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [cardId, setCardId] = useState<ScanCardId | null>(null)
  const [settings, setSettings] = useState<Settings>(EMPTY_SETTINGS)

  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState<string[]>([])
  const [result, setResult] = useState<CreateResult | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/settings/github/repos", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { repos?: InstalledRepoOption[] } | null) => {
        if (cancelled) return
        const repos = data?.repos ?? []
        setInstalledRepos(repos)
        setReposLoaded(true)
        if (repos.length === 0) setSourceKind((k) => (k === "github" ? "git" : k))
      })
      .catch(() => {
        if (!cancelled) {
          setReposLoaded(true)
          setSourceKind((k) => (k === "github" ? "git" : k))
        }
      })
    fetch("/api/system/ports", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { suggestions?: number[] } | null) => {
        if (!cancelled && data?.suggestions?.length) setSuggestedPort(data.suggestions[0])
      })
      .catch(() => {})
    fetch("/api/settings/domain", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { domainEmail?: string | null } | null) => {
        if (!cancelled && data?.domainEmail) setSslEmail((current) => current || data.domainEmail || "")
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const selectedRepo = installedRepos.find((r) => r.fullName === repoFullName) ?? null
  const hasRepo = sourceKind !== "none"
  const repoLabel = sourceKind === "github" ? (selectedRepo ? `@${selectedRepo.fullName}` : "") : sourceKind === "git" ? gitUrl.trim() : ""
  const sourceReady = sourceKind === "none" || ((sourceKind === "github" ? !!selectedRepo : gitUrl.trim().length > 0) && branch.trim().length > 0)
  // Sunucu SSL için geçerli bir e-posta istiyor (Let's Encrypt kaydı) — burada yakala.
  const emailOk = !useSsl || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sslEmail.trim())
  const set = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }))
  const defaultPort = suggestedPort !== null ? String(suggestedPort) : "3000"

  /** Kart seçilince ayarları taramanın önerileriyle doldurur. */
  function chooseCard(id: ScanCardId, fromScan: RepoScan | null = scan) {
    const s = fromScan?.suggestions
    setCardId(id)
    const env = s?.envExample ?? ""
    switch (id) {
      case "compose":
        setSettings({ ...EMPTY_SETTINGS, port: s?.port ? String(s.port) : defaultPort, envEnabled: !!env, envText: env })
        break
      case "dockerfile":
        setSettings({ ...EMPTY_SETTINGS, port: defaultPort, containerPort: String(s?.containerPort ?? 3000), envEnabled: !!env, envText: env })
        break
      case "static":
        setSettings({ ...EMPTY_SETTINGS, publishDir: s?.publishDir ?? "", buildCommand: s?.buildCommand ?? "", spa: s?.spa ?? false })
        break
      case "proxy":
        setSettings({ ...EMPTY_SETTINGS, port: defaultPort })
        break
    }
  }

  async function goToTypeStep() {
    setStep(2)
    setScan(null)
    setScanError(null)
    setCardId(null)
    if (!hasRepo) return
    if (sourceKind === "git" && isSshUrl(gitUrl.trim())) {
      setScanError(
        en
          ? "SSH addresses can't be scanned before the site exists (the deploy key is created with the site). Pick the type yourself."
          : "SSH adresleri site oluşmadan taranamaz (deploy key siteyle birlikte üretilir). Türü kendin seç."
      )
      return
    }
    setScanning(true)
    try {
      const body =
        sourceKind === "github" && selectedRepo
          ? { installationId: selectedRepo.installationId, repoFullName: selectedRepo.fullName, branch: branch.trim() }
          : { repoUrl: gitUrl.trim(), branch: branch.trim() }
      const res = await fetch("/api/sites/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => null)) as { scan?: RepoScan; error?: string } | null
      if (!res.ok || !data?.scan) {
        setScanError(data?.error ?? (en ? "The repository could not be scanned." : "Depo taranamadı."))
        return
      }
      setScan(data.scan)
      const rec = data.scan.cards.find((c) => c.recommended)
      if (rec) chooseCard(rec.id, data.scan)
    } catch {
      setScanError(en ? "Could not reach the server." : "Sunucuya bağlanılamadı.")
    } finally {
      setScanning(false)
    }
  }

  const cards: { id: ScanCardId; available: boolean; recommended: boolean }[] = hasRepo
    ? (scan?.cards ?? (["compose", "dockerfile", "static", "proxy"] as ScanCardId[]).map((id) => ({ id, available: true, recommended: false })))
    : (["static", "compose", "proxy"] as ScanCardId[]).map((id) => ({ id, available: true, recommended: false }))

  const siteType = cardId === "static" ? "STATIC" : "REVERSE_PROXY"
  const portOk = /^\d{1,5}$/.test(settings.port) && Number(settings.port) >= 1 && Number(settings.port) <= 65535
  const settingsValid =
    !!cardId &&
    (cardId === "static" ||
      (cardId === "proxy" && (portOk || /^https?:\/\//.test(settings.targetUrl.trim()))) ||
      (cardId === "dockerfile" && portOk && /^\d{1,5}$/.test(settings.containerPort)) ||
      (cardId === "compose" && portOk))

  async function handleCreate() {
    if (!cardId) return
    setStep(4)
    setSubmitting(true)
    setResult(null)
    setProgress([])
    const log = (line: string) => setProgress((p) => [...p, line])

    const isApp = siteType === "REVERSE_PROXY"
    const config: Record<string, unknown> = { www: useWww }
    if (useSsl && sslEmail) config.sslEmail = sslEmail
    if (cardId === "static") {
      config.publishDir = settings.publishDir.trim()
      config.spa = settings.spa
    } else if (cardId === "proxy" && settings.targetUrl.trim()) {
      config.upstreamUrl = settings.targetUrl.trim()
    } else {
      config.port = Number(settings.port)
    }
    const body: Record<string, unknown> = {
      domain: domain.trim(),
      type: siteType,
      sslEnabled: useSsl,
      config,
      processManager: isApp ? (cardId === "proxy" ? "NONE" : "DOCKER_COMPOSE") : undefined,
      // Depo varsa (ya da Dockerfile kartında compose'u Rudder yazıyorsa) örnek compose başlatılmaz.
      skipDockerBootstrap: isApp && (hasRepo || cardId === "dockerfile"),
      deployCommand: cardId === "static" && settings.buildCommand.trim() ? settings.buildCommand.trim() : undefined,
      envFile: isApp && hasRepo && settings.envEnabled && settings.envText.trim() ? settings.envText : undefined,
      dockerfileCompose: cardId === "dockerfile" ? { containerPort: Number(settings.containerPort) } : undefined,
    }

    try {
      log(en ? "Creating the site (Nginx, folder, user)…" : "Site oluşturuluyor (Nginx, klasör, kullanıcı)…")
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => null)) as (ApiSite & { error?: string; setupWarnings?: string[] }) | null
      if (!res.ok || !data || typeof data.id !== "string") {
        setResult({ ok: false, message: data?.error ?? (en ? "Failed to create site." : "Site oluşturulamadı.") })
        return
      }
      if (data.status === "FAILED") {
        const cfg = (data.config ?? {}) as Record<string, unknown>
        setResult({
          ok: false,
          message: typeof cfg.provisionError === "string" ? cfg.provisionError : en ? "Provisioning failed." : "Kurulum başarısız oldu.",
          siteId: data.id,
        })
        return
      }
      const warnings = [...(data.setupWarnings ?? [])]
      if (data.sslStatus === "error" && data.sslLastError) warnings.push(`SSL: ${data.sslLastError}`)

      if (!hasRepo) {
        setResult({ ok: true, site: data, warnings, deployOutput: null, note: null })
        return
      }

      log(
        cardId === "static"
          ? en
            ? "Cloning the repository, building and publishing…"
            : "Depo klonlanıyor, derleniyor ve yayınlanıyor…"
          : cardId === "proxy"
            ? en
              ? "Cloning the repository…"
              : "Depo klonlanıyor…"
            : en
              ? "Cloning the repository and starting Docker Compose (the first build can take minutes)…"
              : "Depo klonlanıyor ve Docker Compose başlatılıyor (ilk derleme dakikalar sürebilir)…"
      )
      let deployRes: Response
      if (sourceKind === "github" && selectedRepo) {
        deployRes = await fetch(`/api/sites/${data.id}/github-connect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ installationId: selectedRepo.installationId, repoFullName: selectedRepo.fullName, branch: branch.trim() }),
        })
      } else {
        const patch = await fetch(`/api/sites/${data.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoUrl: gitUrl.trim(), gitBranch: branch.trim() }),
        })
        if (!patch.ok) {
          const patchData = (await patch.json().catch(() => null)) as { error?: string } | null
          warnings.push(`${en ? "Repository not connected" : "Depo bağlanamadı"}: ${patchData?.error ?? patch.status}`)
          setResult({ ok: true, site: data, warnings, deployOutput: null, note: null })
          return
        }
        if (isSshUrl(gitUrl.trim())) {
          const note = en
            ? "SSH repository: copy the site's deploy key from the Git & Deployment tab, add it to the repository, then press Deploy Now."
            : "SSH depo: Git & Dağıtım sekmesinden sitenin deploy key'ini kopyalayıp depoya ekleyin, sonra Şimdi Deploy Et'e basın."
          setResult({ ok: true, site: data, warnings, deployOutput: null, note })
          return
        }
        deployRes = await fetch(`/api/sites/${data.id}/deploy`, { method: "POST" })
      }
      const deployData = (await deployRes.json().catch(() => null)) as { error?: string; deployOutput?: string; restartError?: string | null } | null
      if (!deployRes.ok) {
        warnings.push(`${en ? "Site created, but the first deploy failed" : "Site oluşturuldu ama ilk deploy başarısız"}: ${deployData?.error ?? deployRes.status}`)
      } else if (deployData?.restartError) {
        warnings.push(`${en ? "Restart failed" : "Yeniden başlatma başarısız"}: ${deployData.restartError}`)
      }
      setResult({ ok: true, site: data, warnings, deployOutput: deployData?.deployOutput || null, note: null })
    } catch {
      setResult({ ok: false, message: en ? "Could not reach the server." : "Sunucuya bağlanılamadı." })
    } finally {
      setSubmitting(false)
    }
  }

  const stepLabels = en ? ["Source", "Type", "Settings", "Setup"] : ["Kaynak", "Tür", "Ayarlar", "Kurulum"]
  const recommendedCard = cards.find((c) => c.recommended)

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-12">
      {/* ═══ BAŞLIK ═══ */}
      <div className="space-y-3 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <Link href="/sites" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#580619] dark:hover:text-blue-400 transition-colors">
          <ArrowLeft className="size-3.5" />
          {t("sites.wizard.backToList")}
        </Link>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl md:text-3xl font-extrabold tracking-tight text-[#580619] dark:text-slate-100">{t("sites.wizard.title")}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-sans">
              {en ? "Pick a source; Rudder scans the repository and suggests how to run it." : "Bir kaynak seç; Rudder depoyu tarayıp nasıl çalıştırılacağını önersin."}
            </p>
          </div>
          <div className="flex w-fit items-center gap-1 bg-slate-100 dark:bg-[#070c1a] p-1.5 rounded-xl border border-slate-200/80 dark:border-[#16223f] text-xs font-semibold">
            {stepLabels.map((label, i) => (
              <span
                key={label}
                className={cn(
                  "px-2.5 py-1 rounded-lg whitespace-nowrap transition-all",
                  step === i + 1 ? "bg-[#580619] dark:bg-[#162752] text-white shadow-xs dark:border dark:border-[#2a4687]/60" : "text-slate-500 dark:text-slate-400"
                )}
              >
                {i + 1}. {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ 1. KAYNAK ═══ */}
      {step === 1 && (
        <div className="space-y-6">
          <div className={panelCls}>
            <div className="space-y-2">
              <Label htmlFor="domain" className={labelCls}>{t("sites.wizard.domainLabel")}</Label>
              <Input
                id="domain"
                placeholder={en ? "example.com" : "ornek.com"}
                className="font-mono h-11 rounded-xl border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#060a17] dark:text-slate-100"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ToggleRow title={t("sites.wizard.wwwRedirect")} desc={t("sites.wizard.wwwRedirectDesc").replace("{domain}", domain || (en ? "example.com" : "ornek.com"))} checked={useWww} onChange={setUseWww} />
              <ToggleRow title={t("sites.wizard.autoSsl")} desc={t("sites.wizard.autoSslDesc")} checked={useSsl} onChange={setUseSsl} />
            </div>
            {useSsl && (
              <div className="space-y-2">
                <Label htmlFor="ssl-email" className={labelCls}>{t("sites.wizard.sslEmail")}</Label>
                <Input id="ssl-email" type="email" placeholder={en ? "admin@example.com" : "admin@ornek.com"} className="h-11 rounded-xl border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#060a17] dark:text-slate-100" value={sslEmail} onChange={(e) => setSslEmail(e.target.value)} />
                {!emailOk && <p className={helpCls}>{en ? "Required for the Let's Encrypt certificate." : "Let's Encrypt sertifikası için gerekli."}</p>}
              </div>
            )}

            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-[#16223f]">
              <Label className={labelCls}>{en ? "Source" : "Kaynak"}</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                <SourceButton active={sourceKind === "github"} disabled={reposLoaded && installedRepos.length === 0} onClick={() => setSourceKind("github")} icon={<GitFork className="size-4" />} label={en ? "GitHub repository" : "GitHub deposu"} />
                <SourceButton active={sourceKind === "git"} onClick={() => setSourceKind("git")} icon={<GitBranch className="size-4" />} label={en ? "Git address" : "Git adresi"} />
                <SourceButton active={sourceKind === "none"} onClick={() => setSourceKind("none")} icon={<FolderUp className="size-4" />} label={en ? "No repository" : "Repo yok"} />
              </div>

              {sourceKind === "github" && (
                <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                  <div className="space-y-1.5">
                    <select
                      value={repoFullName}
                      onChange={(e) => {
                        setRepoFullName(e.target.value)
                        const repo = installedRepos.find((r) => r.fullName === e.target.value)
                        if (repo) setBranch(repo.defaultBranch)
                      }}
                      className="w-full h-10 px-3 rounded-xl text-xs bg-white dark:bg-[#060a17] border border-slate-200 dark:border-[#16223f] text-slate-900 dark:text-slate-100 font-mono outline-none focus:ring-1 focus:ring-[#c8a87c] dark:focus:ring-[#2a4687]"
                    >
                      <option value="">{reposLoaded ? (en ? "— Pick a repository —" : "— Depo seç —") : en ? "Loading…" : "Yükleniyor…"}</option>
                      {installedRepos.map((r) => (
                        <option key={r.fullName} value={r.fullName}>
                          {r.private ? "🔒 " : "🌐 "} {r.fullName}
                        </option>
                      ))}
                    </select>
                    <p className={helpCls}>{en ? "Repositories your GitHub App installation can access." : "GitHub App kurulumunun erişebildiği depolar."}</p>
                  </div>
                  <BranchInput value={branch} onChange={setBranch} />
                </div>
              )}
              {sourceKind === "git" && (
                <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                  <div className="space-y-1.5">
                    <Input placeholder="https://gitlab.com/owner/repo.git  |  git@host:owner/repo.git" value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} className={inputCls} />
                    <p className={helpCls}>
                      {en
                        ? "Public HTTPS addresses are scanned. SSH addresses use a per-site deploy key and can't be scanned beforehand."
                        : "Herkese açık HTTPS adresleri taranır. SSH adresleri site başına deploy key kullanır, önceden taranamaz."}
                    </p>
                  </div>
                  <BranchInput value={branch} onChange={setBranch} />
                </div>
              )}
              {reposLoaded && installedRepos.length === 0 && sourceKind !== "none" && (
                <p className={helpCls}>
                  {en ? "No GitHub App installed — " : "Kurulu GitHub App yok — "}
                  <Link href="/settings" className="text-[#580619] dark:text-blue-300 font-semibold hover:underline">
                    {en ? "connect one in Settings" : "Ayarlar'dan bağla"}
                  </Link>
                  {en ? " to pick repositories from a list." : ", depoları listeden seçebilmek için."}
                </p>
              )}
              {sourceKind === "none" && (
                <p className={helpCls}>
                  {en
                    ? "Without a repository: a static site you upload files to, an example Docker Compose app, or a plain proxy."
                    : "Repo olmadan: dosya yüklediğin bir statik site, örnek bir Docker Compose uygulaması ya da düz bir yönlendirme."}
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <Button disabled={!domain.trim() || !sourceReady || !emailOk} onClick={goToTypeStep} className={primaryBtn}>
              {hasRepo && <ScanSearch className="size-4" />}
              {hasRepo ? (en ? "Scan repository" : "Depoyu tara") : t("sites.wizard.next")}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ═══ 2. TÜR (tarama + kartlar) ═══ */}
      {step === 2 && (
        <div className="space-y-6">
          {hasRepo && (
            <div className={cn(panelCls, "space-y-3 py-5")}>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 min-w-0">
                {scanning ? <Loader2 className="size-4 shrink-0 animate-spin text-[#580619] dark:text-blue-300" /> : <ScanSearch className="size-4 shrink-0 text-[#580619] dark:text-blue-300" />}
                <span className="font-mono truncate">{repoLabel}</span>
                <span className="text-slate-400 shrink-0">({branch})</span>
              </div>
              {scanning && <p className={helpCls}>{en ? "Scanning the repository (shallow clone, file list only)…" : "Depo taranıyor (sığ klon, yalnız dosya listesi)…"}</p>}
              {scanError && (
                <p className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 p-3 text-xs text-amber-800 dark:text-amber-300 break-words">{scanError}</p>
              )}
              {scan && scan.signals.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {scan.signals.map((s) => (
                    <span key={s} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-[#16223f] bg-slate-50 dark:bg-[#060a17] px-2 py-1 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                      <FileCode2 className="size-3 text-slate-400" />
                      {s}
                    </span>
                  ))}
                </div>
              )}
              {scan && scan.hints.length > 0 && (
                <ul className="space-y-1.5">
                  {scan.hints.map((h) => (
                    <li key={h.code} className={cn("text-[11px] leading-relaxed", h.code === "compose-port-public" ? "text-amber-700 dark:text-amber-300" : "text-slate-600 dark:text-slate-400")}>
                      • {hintText(h, en)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!scanning && (
            <div className="grid gap-4 sm:grid-cols-2">
              {cards.map((c) => {
                const Icon = cardIcon(c.id)
                const text = cardText(c.id, hasRepo, en)
                const selected = cardId === c.id
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={!c.available}
                    onClick={() => chooseCard(c.id)}
                    className={cn(
                      "group relative flex flex-col items-start gap-3 rounded-2xl border p-5 text-left transition-all duration-200",
                      !c.available
                        ? "opacity-45 cursor-not-allowed border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f]"
                        : selected
                          ? "cursor-pointer border-[#c8a87c] dark:border-[#2a4687] bg-[#580619]/5 dark:bg-[#101c38] shadow-md ring-2 ring-[#c8a87c]/50 dark:ring-[#2a4687]/50"
                          : "cursor-pointer border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] hover:border-[#c8a87c]/70 dark:hover:border-[#2a4687] hover:shadow-sm"
                    )}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <div
                        className={cn(
                          "size-10 rounded-xl flex items-center justify-center",
                          selected ? "bg-[#580619] dark:bg-[#162752] text-white" : "bg-[#580619]/5 dark:bg-[#101c38] text-[#580619] dark:text-blue-300 border border-[#c8a87c]/30 dark:border-[#1e3568]/50"
                        )}
                      >
                        <Icon className="size-5" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        {c.recommended && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700 dark:text-emerald-300">
                            <Sparkles className="size-3" />
                            {en ? "Recommended" : "Önerilen"}
                          </span>
                        )}
                        {selected && (
                          <span className="size-6 rounded-full bg-[#580619] dark:bg-[#162752] text-white flex items-center justify-center">
                            <Check className="size-3.5 stroke-[3]" />
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="font-heading font-bold text-slate-900 dark:text-slate-100 text-sm">{text.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{text.desc}</p>
                      {!c.available && (
                        <p className="text-[11px] text-slate-400 mt-1.5">
                          {c.id === "compose" ? (en ? "No compose file in the repository." : "Depoda compose dosyası yok.") : en ? "No Dockerfile in the repository." : "Depoda Dockerfile yok."}
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
          {scan && !recommendedCard && !scanning && <p className={helpCls}>{en ? "No clear match — pick the card that fits." : "Net bir eşleşme yok — uyan kartı seç."}</p>}

          <div className="flex justify-between items-center">
            <Button variant="outline" onClick={() => setStep(1)} className={outlineBtn}>
              <ArrowLeft className="size-4" />
              {t("common.back")}
            </Button>
            <Button disabled={!cardId || scanning} onClick={() => setStep(3)} className={primaryBtn}>
              {t("sites.wizard.next")}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ═══ 3. AYARLAR ═══ */}
      {step === 3 && cardId && (
        <div className="space-y-6">
          <div className={panelCls}>
            <div className="border-b border-slate-100 dark:border-[#16223f] pb-4">
              <h2 className="font-heading text-lg font-bold text-slate-900 dark:text-slate-100">{cardText(cardId, hasRepo, en).title}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono break-all">
                {domain.trim()}
                {repoLabel ? ` · ${repoLabel} (${branch})` : ""}
              </p>
            </div>

            {cardId !== "static" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="app-port" className={labelCls}>
                    {cardId === "compose"
                      ? en
                        ? "App port (published by compose)"
                        : "Uygulama portu (compose'un yayınladığı)"
                      : cardId === "dockerfile"
                        ? en
                          ? "Host port (127.0.0.1)"
                          : "Sunucu portu (127.0.0.1)"
                        : en
                          ? "Target port"
                          : "Hedef port"}
                  </Label>
                  <Input id="app-port" type="number" value={settings.port} onChange={(e) => set({ port: e.target.value })} className={inputCls} />
                  <p className={helpCls}>{en ? "Nginx proxies to 127.0.0.1:<port>." : "Nginx 127.0.0.1:<port>'a yönlendirir."}</p>
                  <BusyPortsHint />
                </div>
                {cardId === "dockerfile" && (
                  <div className="space-y-2">
                    <Label htmlFor="container-port" className={labelCls}>{en ? "Container port" : "Konteyner portu"}</Label>
                    <Input id="container-port" type="number" value={settings.containerPort} onChange={(e) => set({ containerPort: e.target.value })} className={inputCls} />
                    <p className={helpCls}>{en ? "The port the app listens on inside the container (Dockerfile EXPOSE)." : "Uygulamanın konteyner içinde dinlediği port (Dockerfile EXPOSE)."}</p>
                  </div>
                )}
                {cardId === "proxy" && (
                  <div className="space-y-2">
                    <Label htmlFor="target-url" className={labelCls}>{en ? "Or a full target address" : "Ya da tam hedef adres"}</Label>
                    <Input id="target-url" placeholder="http://10.0.0.5:8080" value={settings.targetUrl} onChange={(e) => set({ targetUrl: e.target.value })} className={inputCls} />
                    <p className={helpCls}>{en ? "Overrides the port when filled." : "Doluysa portun yerine geçer."}</p>
                  </div>
                )}
              </div>
            )}

            {(cardId === "compose" || cardId === "dockerfile") && hasRepo && (
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-[#16223f]">
                <label className="flex items-center gap-2.5 text-xs cursor-pointer">
                  <input type="checkbox" checked={settings.envEnabled} onChange={(e) => set({ envEnabled: e.target.checked })} className="size-4" />
                  <span className="font-bold text-slate-800 dark:text-slate-200">{en ? "Create the first .env file" : "İlk .env dosyasını oluştur"}</span>
                </label>
                {settings.envEnabled && (
                  <>
                    <textarea
                      value={settings.envText}
                      onChange={(e) => set({ envText: e.target.value })}
                      rows={Math.min(16, Math.max(5, settings.envText.split("\n").length + 1))}
                      spellCheck={false}
                      className="w-full rounded-xl border border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#060a17] p-3 font-mono text-xs text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-[#c8a87c] dark:focus:ring-[#2a4687]"
                      placeholder="KEY=value"
                    />
                    <p className={helpCls}>
                      {scan?.suggestions.envExampleFile
                        ? en
                          ? `Pre-filled from ${scan.suggestions.envExampleFile}. Written to the site folder before the first start; never committed.`
                          : `${scan.suggestions.envExampleFile} dosyasından dolduruldu. İlk başlatmadan önce site klasörüne yazılır; depoya girmez.`
                        : en
                          ? "Written to the site folder before the first start; never committed."
                          : "İlk başlatmadan önce site klasörüne yazılır; depoya girmez."}
                    </p>
                  </>
                )}
              </div>
            )}

            {cardId === "static" && (
              <div className="grid gap-4 sm:grid-cols-2">
                {hasRepo && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="build-cmd" className={labelCls}>{en ? "Build command (optional)" : "Derleme komutu (isteğe bağlı)"}</Label>
                      <Input id="build-cmd" placeholder={en ? "empty for plain HTML" : "düz HTML için boş"} value={settings.buildCommand} onChange={(e) => set({ buildCommand: e.target.value })} className={inputCls} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="publish-dir" className={labelCls}>{en ? "Publish folder" : "Yayın klasörü"}</Label>
                      <Input id="publish-dir" placeholder={en ? ". (repository root)" : ". (depo kökü)"} value={settings.publishDir} onChange={(e) => set({ publishDir: e.target.value })} className={inputCls} />
                    </div>
                    <p className={cn(helpCls, "sm:col-span-2")}>
                      {en
                        ? "The build runs in the repository folder; the publish folder (relative to the repo root) is mirrored into the web root. Dotfiles never go live; when the repo root is published, sources and tool files are left out too."
                        : "Derleme depo klasöründe çalışır; yayın klasörü (depo köküne göre) web köküne aynalanır. Nokta dosyaları hiç yayına çıkmaz; depo kökü yayınlanırken kaynak ve araç dosyaları da dışarıda kalır."}
                    </p>
                  </>
                )}
                <div className="sm:col-span-2">
                  <ToggleRow
                    title={en ? "Single-page app (SPA) mode" : "Tek sayfa uygulama (SPA) modu"}
                    desc={en ? "Unknown paths serve index.html (React/Vue router). Can be changed later." : "Bulunamayan yollar index.html'e düşer (React/Vue yönlendirmesi). Sonra değiştirilebilir."}
                    checked={settings.spa}
                    onChange={(v) => set({ spa: v })}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between items-center">
            <Button variant="outline" onClick={() => setStep(2)} className={outlineBtn}>
              <ArrowLeft className="size-4" />
              {t("common.back")}
            </Button>
            <Button disabled={!settingsValid || submitting} onClick={handleCreate} className={primaryBtn}>
              <Check className="size-4" />
              {t("sites.wizard.createSiteBtn")}
            </Button>
          </div>
        </div>
      )}

      {/* ═══ 4. KURULUM ═══ */}
      {step === 4 && (
        <div className="rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-8 shadow-sm space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-[#16223f] pb-5">
            {result === null ? (
              <Loader2 className="size-6 animate-spin text-[#580619] dark:text-blue-300" />
            ) : result.ok ? (
              <CheckCircle2 className="size-6 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <XCircle className="size-6 text-red-600 dark:text-red-400" />
            )}
            <div className="min-w-0">
              <h2 className="font-heading text-xl font-bold text-slate-900 dark:text-slate-100">
                {result === null ? t("sites.wizard.creatingSite") : result.ok ? t("sites.wizard.createSuccess") : t("sites.wizard.createFailed")}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 break-words">
                {result === null ? t("sites.wizard.applyingConfig") : result.ok ? t("sites.wizard.nowActive").replace("{domain}", domain.trim()) : result.message}
              </p>
            </div>
          </div>

          {progress.length > 0 && (
            <div className="space-y-2">
              {progress.map((line, i) => (
                <div key={line} className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300 font-medium">
                  {submitting && i === progress.length - 1 ? (
                    <Loader2 className="size-3.5 shrink-0 animate-spin text-[#580619] dark:text-blue-300" />
                  ) : result && !result.ok && i === progress.length - 1 ? (
                    <XCircle className="size-3.5 shrink-0 text-red-600 dark:text-red-400" />
                  ) : (
                    <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  )}
                  {line}
                </div>
              ))}
            </div>
          )}

          {result?.ok && (
            <div className="space-y-4">
              {result.warnings.map((w) => (
                <div key={w} className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60 p-3 text-xs text-amber-800 dark:text-amber-300 break-words">
                  {w}
                </div>
              ))}
              {result.note && <div className="rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200/80 dark:border-sky-900/60 p-3 text-xs text-sky-800 dark:text-sky-300">{result.note}</div>}
              {result.deployOutput && (
                <details>
                  <summary className="cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">{en ? "Deploy output" : "Deploy çıktısı"}</summary>
                  <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-900 dark:bg-[#030610] p-3 font-mono text-[11px] text-slate-100 whitespace-pre-wrap">{result.deployOutput}</pre>
                </details>
              )}
              <div className="flex justify-end gap-3">
                <Button asChild variant="outline" className="h-10 rounded-xl text-xs font-semibold dark:border-[#16223f] dark:text-slate-300 dark:hover:bg-[#111f40]">
                  <Link href="/sites">{t("sites.wizard.listBtn")}</Link>
                </Button>
                <Button asChild className="bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white h-10 rounded-xl text-xs font-semibold px-5 border border-[#c8a87c]/40 dark:border-[#2a4687]/60">
                  <Link href={`/sites/${result.site.id}`}>{t("sites.wizard.goToManage")}</Link>
                </Button>
              </div>
            </div>
          )}
          {result && !result.ok && (
            <div className="flex justify-end gap-3">
              {result.siteId && (
                <Button asChild variant="outline" className="h-10 rounded-xl text-xs font-semibold dark:border-[#16223f] dark:text-slate-300">
                  <Link href={`/sites/${result.siteId}`}>{t("sites.wizard.goToManage")}</Link>
                </Button>
              )}
              <Button variant="outline" onClick={() => setStep(3)} className="h-10 rounded-xl text-xs font-semibold dark:border-[#16223f] dark:text-slate-300">
                {t("sites.wizard.backToSettings")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ToggleRow({ title, desc, checked, onChange }: { title: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 dark:border-[#16223f] p-4 bg-slate-50/50 dark:bg-[#060a17]">
      <div>
        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{title}</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function SourceButton({ active, disabled, onClick, icon, label }: { active: boolean; disabled?: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-2 h-10 rounded-xl border text-xs font-semibold transition-all",
        disabled
          ? "opacity-40 cursor-not-allowed border-slate-200 dark:border-[#16223f]"
          : active
            ? "cursor-pointer border-[#c8a87c] dark:border-[#2a4687] bg-[#580619]/5 dark:bg-[#101c38] text-[#580619] dark:text-blue-200 ring-2 ring-[#c8a87c]/40 dark:ring-[#2a4687]/40"
            : "cursor-pointer border-slate-200 dark:border-[#16223f] text-slate-600 dark:text-slate-300 hover:border-[#c8a87c]/70"
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function BranchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="main" className={inputCls} aria-label="Branch" />
      <p className={helpCls}>Branch</p>
    </div>
  )
}
