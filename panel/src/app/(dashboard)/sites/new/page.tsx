"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Box, Check, CheckCircle2, Globe, Loader2, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { BusyPortsHint } from "@/components/busy-ports-hint"
import { cn } from "@/lib/utils"
import { SITE_TYPES, type SiteType } from "@/lib/mock-data"
import { GIT_CAPABLE_UI_TYPES, uiTypeToDbType, type ApiSite } from "@/lib/site-adapter"
import { useTranslation } from "@/components/language-provider"

function fieldValue(id: string): string {
  const el = document.getElementById(id) as HTMLInputElement | null
  return el?.value.trim() ?? ""
}

function portValue(id: string): number | undefined {
  const n = Number.parseInt(fieldValue(id), 10)
  return Number.isInteger(n) ? n : undefined
}

function checkboxValue(id: string): boolean {
  const el = document.getElementById(id) as HTMLInputElement | null
  return !!el?.checked
}

function buildConfig(type: SiteType, useWww: boolean, useSsl: boolean, sslEmail: string) {
  const config: Record<string, unknown> = { www: useWww }
  if (useSsl && sslEmail) config.sslEmail = sslEmail

  switch (type) {
    case "static":
      config.siteRoot = fieldValue("site-root")
      config.linuxUser = fieldValue("linux-user")
      config.publishDir = fieldValue("publish-dir")
      config.spa = checkboxValue("spa")
      break
    case "proxy": {
      // Tam hedef adres verildiyse o, yoksa port -> http://127.0.0.1:<port>.
      const target = fieldValue("target-url")
      if (target) config.upstreamUrl = target
      else config.port = portValue("app-port")
      break
    }
  }

  return config
}

function typeChecklist(type: SiteType, hasSsl: boolean, lang: "tr" | "en", connectingRepo: boolean, compose: boolean): string[] {
  const items: string[] = []
  if (type === "proxy") {
    items.push(lang === "en" ? "Creating the app folder" : "Uygulama klasörü oluşturuluyor")
    if (compose && !connectingRepo) {
      items.push(
        lang === "en" ? "Writing example docker-compose.yml" : "Örnek docker-compose.yml yazılıyor",
        lang === "en" ? "Starting Docker Compose" : "Docker Compose başlatılıyor"
      )
    }
  }
  items.push(lang === "en" ? "Writing Nginx configuration" : "Nginx yapılandırması yazılıyor")
  if (hasSsl) {
    items.push(lang === "en" ? "Checking DNS and requesting SSL certificate (Let's Encrypt)" : "DNS kontrol ediliyor ve SSL sertifikası isteniyor (Let's Encrypt)")
  }
  if (connectingRepo && type === "static") {
    items.push(lang === "en" ? "Connecting repository, cloning, building and publishing" : "Depo bağlanıyor, klonlanıp derleniyor ve yayınlanıyor")
  } else if (connectingRepo) {
    items.push(lang === "en" ? "Connecting repository, cloning and deploying" : "Depo bağlanıyor, klonlanıp deploy ediliyor")
  }
  return items
}

type ProvisionResult =
  | { ok: true; site: ApiSite; repoConnectError?: string | null }
  | { ok: false; message: string; siteId?: string }

/** `GET /api/settings/github/repos` — GitHub App kurulumlarının izin verdiği depolar. */
interface InstalledRepoOption {
  fullName: string
  private: boolean
  defaultBranch: string
  installationId: string
}

/** Sihirbazda opsiyonel repo bağlama (bkz. src/lib/git.ts GIT_PULL_TYPES) — v1.4.0'da iki türde de. */
const GIT_CONNECTABLE_TYPES: SiteType[] = GIT_CAPABLE_UI_TYPES

function getTypeIcon(type: SiteType) {
  return type === "proxy" ? Box : Globe
}

export default function NewSitePage() {
  const { t, lang } = useTranslation()
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [selectedType, setSelectedType] = useState<SiteType | null>(null)
  const [domain, setDomain] = useState("")
  // Varsayılan KAPALI (bkz. docs/ARCHITECTURE.md 2026-09-15 güncellemesi):
  // açık gelmesi, kullanıcının "www" DNS kaydını hiç eklemediği durumlarda
  // (çoğu domain'in tek başına apex kaydı vardır) certbot'un sessizce
  // www.<domain> için de sertifika istemesine ve bu yüzden TÜM SSL isteğinin
  // "DNS problem: NXDOMAIN" ile başarısız olmasına yol açıyordu — apex için
  // DNS doğruyken bile. İsteyen kullanıcı kendi www kaydını ekleyip burada
  // açabilir.
  const [useWww, setUseWww] = useState(false)
  const [useSsl, setUseSsl] = useState(true)
  const [sslEmail, setSslEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ProvisionResult | null>(null)
  // Uygulama: süreç yöneticisi (Docker Compose varsayılan). Repo yoksa Compose
  // seçiliyken örnek bir compose ile hemen ayağa kalkar.
  const [processManager, setProcessManager] = useState<"DOCKER_COMPOSE" | "NONE">("DOCKER_COMPOSE")

  // Opsiyonel: sihirbazda GitHub App'e bağlı bir depo seçilebilir (yalnızca
  // git-pull desteklenen tipler için) — site oluşturulur oluşturulmaz
  // `github-connect` ile hem bağlanır hem de kök dizine klonlanır.
  const [installedRepos, setInstalledRepos] = useState<InstalledRepoOption[]>([])
  const [selectedRepoFullName, setSelectedRepoFullName] = useState("")
  // Boş port önerisi (Portlar API'si) — Node.js/Python/Docker port alanı ve
  // ters proxy hedef adresi bununla ön-dolu gelir; SSL e-postası panelin
  // kendi alan adı ayarındaki e-postadan ön-dolu gelir (2026-09-15).
  const [suggestedPort, setSuggestedPort] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/settings/github/repos", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { repos?: InstalledRepoOption[] } | null) => {
        if (!cancelled && data?.repos) setInstalledRepos(data.repos)
      })
      .catch(() => {})
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

  const typeInfo = SITE_TYPES.find((t) => t.type === selectedType)
  const canConnectRepo = !!selectedType && GIT_CONNECTABLE_TYPES.includes(selectedType) && installedRepos.length > 0

  async function handleCreate() {
    if (!selectedType || !domain.trim()) return

    setStep(3)
    setSubmitting(true)
    setResult(null)

    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: domain.trim(),
          type: uiTypeToDbType(selectedType),
          sslEnabled: useSsl,
          config: buildConfig(selectedType, useWww, useSsl, sslEmail),
          deployCommand: fieldValue("deploy-cmd") || undefined,
          processManager: selectedType === "proxy" ? processManager : undefined,
          // Depo seçildiyse örnek compose + otomatik `up` atlanır; gerçek
          // compose dosyası klonlanıp deploy hattı onu ayağa kaldırır.
          skipDockerBootstrap: selectedType === "proxy" && !!(canConnectRepo && selectedRepoFullName),
        }),
      })
      const data = (await res.json().catch(() => null)) as (ApiSite & { error?: string }) | null

      if (!res.ok || !data || typeof data.id !== "string") {
        setResult({ ok: false, message: data?.error ?? (lang === "en" ? "Failed to create site. Please try again." : "Site oluşturulamadı. Lütfen tekrar deneyin.") })
        return
      }

      if (data.status === "FAILED") {
        const cfg = (data.config ?? {}) as Record<string, unknown>
        const message =
          typeof cfg.provisionError === "string" ? cfg.provisionError : (lang === "en" ? "Provisioning failed." : "Kurulum başarısız oldu.")
        setResult({ ok: false, message, siteId: data.id })
        return
      }

      // Site (ve dolayısıyla kök klasörü) hazır — opsiyonel repo seçildiyse
      // hemen bağla ve klonla. Bu adımın başarısız olması site oluşturmayı
      // BAŞARISIZ SAYMAZ — site zaten ayakta, kullanıcı repoyu site detay
      // sayfasındaki Git & Dağıtım sekmesinden her zaman tekrar bağlayabilir.
      let repoConnectError: string | null = null
      if (canConnectRepo && selectedRepoFullName) {
        const repo = installedRepos.find((r) => r.fullName === selectedRepoFullName)
        if (repo) {
          try {
            const connectRes = await fetch(`/api/sites/${data.id}/github-connect`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                installationId: repo.installationId,
                repoFullName: repo.fullName,
                branch: repo.defaultBranch,
              }),
            })
            if (!connectRes.ok) {
              const connectData = await connectRes.json().catch(() => null)
              repoConnectError = connectData?.error ?? (lang === "en" ? "Repository connection failed." : "Depo bağlanamadı.")
            }
          } catch {
            repoConnectError = lang === "en" ? "Could not connect to server." : "Sunucuya bağlanılamadı."
          }
        }
      }

      setResult({ ok: true, site: data, repoConnectError })
    } catch {
      setResult({ ok: false, message: lang === "en" ? "Could not connect to server. Please try again." : "Sunucuya bağlanılamadı. Lütfen tekrar deneyin." })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-12">
      {/* ═══ 1. ÜST BAŞLIK & GERİ DÖNÜŞ ═══ */}
      <div className="space-y-3 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <Link
          href="/sites"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#580619] dark:hover:text-blue-400 transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          {t("sites.wizard.backToList")}
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl md:text-3xl font-extrabold tracking-tight text-[#580619] dark:text-slate-100">
              {t("sites.wizard.title")}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-sans">
              {t("sites.wizard.subtitle")}
            </p>
          </div>

          {/* Adım Göstergesi */}
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-[#070c1a] p-1.5 rounded-xl border border-slate-200/80 dark:border-[#16223f] text-xs font-semibold">
            <span
              className={cn(
                "px-3 py-1 rounded-lg transition-all",
                step === 1 ? "bg-[#580619] dark:bg-[#162752] text-white shadow-xs dark:border dark:border-[#2a4687]/60" : "text-slate-500 dark:text-slate-400"
              )}
            >
              {t("sites.wizard.step1")}
            </span>
            <span
              className={cn(
                "px-3 py-1 rounded-lg transition-all",
                step === 2 ? "bg-[#580619] dark:bg-[#162752] text-white shadow-xs dark:border dark:border-[#2a4687]/60" : "text-slate-500 dark:text-slate-400"
              )}
            >
              {t("sites.wizard.step2")}
            </span>
            <span
              className={cn(
                "px-3 py-1 rounded-lg transition-all",
                step === 3 ? "bg-[#580619] dark:bg-[#162752] text-white shadow-xs dark:border dark:border-[#2a4687]/60" : "text-slate-500 dark:text-slate-400"
              )}
            >
              {t("sites.wizard.step3")}
            </span>
          </div>
        </div>
      </div>

      {/* ═══ 2. ADIM 1: TÜR SEÇİMİ ═══ */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {SITE_TYPES.map((tItem) => {
              const TypeIcon = getTypeIcon(tItem.type)
              const isSelected = selectedType === tItem.type
              const typeLabel = t(`sites.types.${tItem.type}.label`) || tItem.label
              const typeDescription = t(`sites.types.${tItem.type}.description`) || tItem.description
              return (
                <button
                  key={tItem.type}
                  type="button"
                  onClick={() => setSelectedType(tItem.type)}
                  className={cn(
                    "group relative flex flex-col items-start gap-3 rounded-2xl border p-5 text-left transition-all duration-200 cursor-pointer",
                    isSelected
                      ? "border-[#c8a87c] dark:border-[#2a4687] bg-[#580619]/5 dark:bg-[#101c38] shadow-md ring-2 ring-[#c8a87c]/50 dark:ring-[#2a4687]/50"
                      : "border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] hover:border-[#c8a87c]/70 dark:hover:border-[#2a4687] hover:shadow-sm"
                  )}
                >
                  <div className="flex w-full items-center justify-between">
                    <div
                      className={cn(
                        "size-10 rounded-xl flex items-center justify-center font-mono text-xs font-black transition-colors",
                        isSelected
                          ? "bg-[#580619] dark:bg-[#162752] text-white dark:border dark:border-[#2a4687]/60"
                          : "bg-[#580619]/5 dark:bg-[#101c38] text-[#580619] dark:text-blue-300 border border-[#c8a87c]/30 dark:border-[#1e3568]/50 group-hover:bg-[#580619] dark:group-hover:bg-[#162752] group-hover:text-white dark:group-hover:text-white"
                      )}
                    >
                      <TypeIcon className="size-5" />
                    </div>
                    {isSelected && (
                      <div className="size-6 rounded-full bg-[#580619] dark:bg-[#162752] text-white flex items-center justify-center dark:border dark:border-[#2a4687]/60">
                        <Check className="size-3.5 stroke-[3]" />
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="font-heading font-bold text-slate-900 dark:text-slate-100 text-sm">{typeLabel}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                      {typeDescription}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="flex justify-end pt-4">
            <Button
              disabled={!selectedType}
              onClick={() => setStep(2)}
              className="bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white font-semibold text-xs uppercase tracking-wider px-6 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2 h-11 border border-[#c8a87c]/40 dark:border-[#2a4687]/60 hover:border-[#c8a87c] dark:hover:border-[#385db3] disabled:opacity-40 cursor-pointer"
            >
              {t("sites.wizard.next")}
              <ArrowRight className="size-4 text-inherit" />
            </Button>
          </div>
        </div>
      )}

      {/* ═══ 3. ADIM 2: AYARLAR ═══ */}
      {step === 2 && typeInfo && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-6 md:p-8 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-6">
            <div className="border-b border-slate-100 dark:border-[#16223f] pb-4">
              <h2 className="font-heading text-lg font-bold text-slate-900 dark:text-slate-100">
                {(t(`sites.types.${typeInfo.type}.label`) || typeInfo.label)} {lang === "en" ? "Site Settings" : "Sitesi Ayarları"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-sans">
                {t("sites.wizard.settingsDesc")}
              </p>
            </div>

            <div className="space-y-5">
              {/* Domain Input */}
              <div className="space-y-2">
                <Label htmlFor="domain" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {t("sites.wizard.domainLabel")}
                </Label>
                <Input
                  id="domain"
                  placeholder={lang === "en" ? "example.com" : "ornek.com"}
                  className="font-mono h-11 rounded-xl border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#060a17] dark:text-slate-100 focus-visible:ring-[#580619]/20 dark:focus-visible:ring-blue-500/20"
                  value={domain}
                  onChange={(event) => setDomain(event.target.value)}
                />
              </div>

              {/* WWW & SSL Switches */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-[#16223f] p-4 bg-slate-50/50 dark:bg-[#060a17]">
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{t("sites.wizard.wwwRedirect")}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {t("sites.wizard.wwwRedirectDesc").replace("{domain}", domain || (lang === "en" ? "example.com" : "ornek.com"))}
                    </p>
                  </div>
                  <Switch checked={useWww} onCheckedChange={setUseWww} />
                </div>

                <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-[#16223f] p-4 bg-slate-50/50 dark:bg-[#060a17]">
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{t("sites.wizard.autoSsl")}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {t("sites.wizard.autoSslDesc")}
                    </p>
                  </div>
                  <Switch checked={useSsl} onCheckedChange={setUseSsl} />
                </div>
              </div>

              {useSsl && (
                <div className="space-y-2">
                  <Label htmlFor="ssl-email" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {t("sites.wizard.sslEmail")}
                  </Label>
                  <Input
                    id="ssl-email"
                    type="email"
                    placeholder={lang === "en" ? "admin@example.com" : "admin@ornek.com"}
                    className="h-11 rounded-xl border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#060a17] dark:text-slate-100 focus-visible:ring-[#580619]/20 dark:focus-visible:ring-blue-500/20"
                    value={sslEmail}
                    onChange={(event) => setSslEmail(event.target.value)}
                  />
                </div>
              )}

              <TypeSpecificFields
                type={typeInfo.type}
                domain={domain}
                t={t}
                lang={lang}
                suggestedPort={suggestedPort}
                processManager={processManager}
                onProcessManagerChange={setProcessManager}
              />

              {canConnectRepo && (
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-[#16223f]">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {lang === "en" ? "Connect a GitHub repository (optional)" : "Bir GitHub deposu bağla (opsiyonel)"}
                  </Label>
                  <select
                    value={selectedRepoFullName}
                    onChange={(e) => setSelectedRepoFullName(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl text-xs bg-white dark:bg-[#060a17] border border-slate-200 dark:border-[#16223f] text-slate-900 dark:text-slate-100 font-mono outline-none focus:ring-1 focus:ring-[#c8a87c] dark:focus:ring-[#2a4687]"
                  >
                    <option value="">
                      {lang === "en" ? "— Don't connect a repository —" : "— Depo bağlama —"}
                    </option>
                    {installedRepos.map((r) => (
                      <option key={r.fullName} value={r.fullName}>
                        {r.private ? "🔒 " : "🌐 "} {r.fullName} ({r.defaultBranch})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {selectedType === "static"
                      ? lang === "en"
                        ? "The repo is cloned into the site's repo/ folder; after the optional build, the publish folder is copied to public/."
                        : "Depo sitenin repo/ klasörüne klonlanır; isteğe bağlı derlemeden sonra yayın klasörü public/'e kopyalanır."
                      : lang === "en"
                        ? "As soon as the site's folder exists, this repo is cloned into it; with Docker Compose the repo's own compose file is started."
                        : "Sitenin klasörü oluşur oluşmaz bu depo içine klonlanır; Docker Compose seçiliyse deponun kendi compose dosyası ayağa kaldırılır."}
                  </p>
                  {selectedType === "static" && selectedRepoFullName && <StaticBuildFields lang={lang} />}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center pt-2">
            <Button
              variant="outline"
              onClick={() => setStep(1)}
              disabled={submitting}
              className="h-11 px-5 rounded-xl border-slate-200 dark:border-[#16223f] text-xs font-semibold dark:text-slate-300 dark:hover:bg-[#111f40]"
            >
              <ArrowLeft className="size-4" />
              {t("common.back")}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!domain.trim() || submitting}
              className="bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white font-semibold text-xs uppercase tracking-wider px-7 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2 h-11 border border-[#c8a87c]/40 dark:border-[#2a4687]/60 hover:border-[#c8a87c] dark:hover:border-[#385db3] disabled:opacity-40 cursor-pointer"
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin text-inherit" />
              ) : (
                <Check className="size-4 text-inherit" />
              )}
              {t("sites.wizard.createSiteBtn")}
            </Button>
          </div>
        </div>
      )}

      {/* ═══ 4. ADIM 3: KURULUM DURUMU ═══ */}
      {step === 3 && typeInfo && (
        <div className="rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-8 shadow-sm space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-[#16223f] pb-5">
            {result === null ? (
              <Loader2 className="size-6 animate-spin text-[#580619] dark:text-blue-300" />
            ) : result.ok ? (
              <CheckCircle2 className="size-6 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <XCircle className="size-6 text-red-600 dark:text-red-400" />
            )}
            <div>
              <h2 className="font-heading text-xl font-bold text-slate-900 dark:text-slate-100">
                {result === null
                  ? t("sites.wizard.creatingSite")
                  : result.ok
                  ? t("sites.wizard.createSuccess")
                  : t("sites.wizard.createFailed")}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {result === null
                  ? t("sites.wizard.applyingConfig")
                  : result.ok
                  ? t("sites.wizard.nowActive").replace("{domain}", domain)
                  : result.message}
              </p>
            </div>
          </div>

          {result === null ? (
            <div className="space-y-3 py-4">
              {typeChecklist(typeInfo.type, useSsl, lang, canConnectRepo && !!selectedRepoFullName, processManager === "DOCKER_COMPOSE").map((item, index) => (
                <div key={index} className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300 font-medium">
                  <span className="size-2 rounded-full bg-[#580619] dark:bg-blue-300 animate-pulse" />
                  {item}
                </div>
              ))}
            </div>
          ) : result.ok ? (
            <div className="space-y-5 pt-2">
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 p-4 text-xs text-emerald-800 dark:text-emerald-300">
                {lang === "en" ? (
                  <>Congratulations! <strong>{result.site.domain}</strong> has been successfully configured and is running on your server.</>
                ) : (
                  <>Tebrikler! <strong>{result.site.domain}</strong> başarıyla yapılandırıldı ve sunucunuzda çalışıyor.</>
                )}
              </div>
              {result.repoConnectError && (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60 p-4 text-xs text-amber-800 dark:text-amber-300">
                  {lang === "en"
                    ? `Site created, but the repository could not be connected: ${result.repoConnectError} You can retry from the site's Git & Deployment tab.`
                    : `Site oluşturuldu ama depo bağlanamadı: ${result.repoConnectError} Sitenin Git & Dağıtım sekmesinden tekrar deneyebilirsiniz.`}
                </div>
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
          ) : (
            <div className="space-y-4 pt-2">
              <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200/80 dark:border-red-900 p-4 text-xs text-red-800 dark:text-red-300 font-mono">
                {result.message}
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setStep(2)} className="h-10 rounded-xl text-xs font-semibold dark:border-[#16223f] dark:text-slate-300">
                  {t("sites.wizard.backToSettings")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DeployCommandField({ lang }: { lang: "tr" | "en" }) {
  return (
    <div className="space-y-2 sm:col-span-2">
      <Label htmlFor="deploy-cmd" className="text-xs font-bold text-slate-700 dark:text-slate-300">
        {lang === "en" ? "Deploy command (optional, after each pull)" : "Deploy komutu (isteğe bağlı, her pull sonrası)"}
      </Label>
      <Input id="deploy-cmd" placeholder={lang === "en" ? "usually empty with Docker Compose" : "Docker Compose'da genelde boş"} className="font-mono h-10 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100" />
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        {lang === "en"
          ? "Runs in the app folder before the restart. With Docker Compose the image is built by compose itself."
          : "Yeniden başlatmadan önce uygulama klasöründe çalışır. Docker Compose'da image'ı compose kendisi derler."}
      </p>
    </div>
  )
}

function StaticBuildFields({ lang }: { lang: "tr" | "en" }) {
  const inputCls = "font-mono h-10 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100"
  return (
    <div className="grid gap-4 sm:grid-cols-2 pt-2">
      <div className="space-y-2">
        <Label htmlFor="deploy-cmd" className="text-xs font-bold text-slate-700 dark:text-slate-300">
          {lang === "en" ? "Build command (optional)" : "Derleme komutu (isteğe bağlı)"}
        </Label>
        <Input id="deploy-cmd" placeholder={lang === "en" ? "empty for plain HTML — e.g. npm ci && npm run build" : "düz HTML için boş — örn. npm ci && npm run build"} className={inputCls} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="publish-dir" className="text-xs font-bold text-slate-700 dark:text-slate-300">
          {lang === "en" ? "Publish folder" : "Yayın klasörü"}
        </Label>
        <Input id="publish-dir" placeholder={lang === "en" ? ". (repository root)" : ". (depo kökü)"} className={inputCls} />
      </div>
      <p className="sm:col-span-2 text-[11px] text-slate-500 dark:text-slate-400">
        {lang === "en"
          ? "Publish folder is relative to the repository root: empty for plain HTML, dist for Vite/Astro, build for Create React App. Both can be changed later on the Git & Deployment tab."
          : "Yayın klasörü depo köküne göre: düz HTML için boş, Vite/Astro için dist, Create React App için build. İkisi de sonra Git & Dağıtım sekmesinden değiştirilebilir."}
      </p>
    </div>
  )
}

function LinuxUserField({ domain, lang }: { domain: string; lang: "tr" | "en" }) {
  const auto = `site_${(domain || "ornek.com").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`.slice(0, 32)
  return (
    <div className="space-y-2">
      <Label htmlFor="linux-user" className="text-xs font-bold text-slate-700 dark:text-slate-300">
        {lang === "en" ? "Linux user (optional)" : "Linux kullanıcısı (isteğe bağlı)"}
      </Label>
      <Input id="linux-user" placeholder={auto} className="font-mono h-10 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100" />
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        {lang === "en" ? "Site files belong to this dedicated user (auto-generated when empty)." : "Site dosyaları bu dedicated kullanıcıya ait olur (boşsa otomatik üretilir)."}
      </p>
    </div>
  )
}

function TypeSpecificFields({
  type,
  domain,
  t,
  lang,
  suggestedPort,
  processManager,
  onProcessManagerChange,
}: {
  type: SiteType
  domain: string
  t: (key: string) => string
  lang: "tr" | "en"
  suggestedPort: number | null
  processManager: "DOCKER_COMPOSE" | "NONE"
  onProcessManagerChange: (value: "DOCKER_COMPOSE" | "NONE") => void
}) {
  const rootPlaceholder = `/var/www/${domain || (lang === "en" ? "example.com" : "ornek.com")}`
  const portDefault = suggestedPort !== null ? String(suggestedPort) : undefined
  const inputCls = "font-mono h-10 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100"

  if (type === "static") {
    return (
      <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-slate-100 dark:border-[#16223f]">
        <div className="space-y-2">
          <Label htmlFor="site-root" className="text-xs font-bold text-slate-700 dark:text-slate-300">{t("sites.wizard.siteRoot")}</Label>
          <Input id="site-root" placeholder={rootPlaceholder} className={inputCls} />
        </div>
        <LinuxUserField domain={domain} lang={lang} />
        <label className="sm:col-span-2 flex items-start gap-2.5 rounded-xl border border-slate-200 dark:border-[#16223f] p-3 text-xs cursor-pointer">
          <input id="spa" type="checkbox" className="size-4 mt-0.5" />
          <span>
            <span className="font-bold text-slate-800 dark:text-slate-200">{lang === "en" ? "Single-page app (SPA) mode" : "Tek sayfa uygulama (SPA) modu"}</span>
            <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {lang === "en"
                ? "Unknown paths serve index.html (React/Vue router). Can be changed later."
                : "Bulunamayan yollar index.html'e düşer (React/Vue yönlendirmesi). Sonra değiştirilebilir."}
            </span>
          </span>
        </label>
      </div>
    )
  }

  return (
    <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-[#16223f]">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="app-port" className="text-xs font-bold text-slate-700 dark:text-slate-300">{t("sites.wizard.appPort")}</Label>
          <Input key={portDefault ?? "p"} id="app-port" type="number" defaultValue={portDefault ?? "3000"} className={inputCls} />
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {lang === "en"
              ? "Nginx proxies to 127.0.0.1:<port> — your compose file must publish the app on this port."
              : "Nginx 127.0.0.1:<port>'a yönlendirir — compose dosyanız uygulamayı bu portta yayınlamalı."}
          </p>
          <BusyPortsHint />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">{lang === "en" ? "Process manager" : "Süreç yöneticisi"}</Label>
          <select
            value={processManager}
            onChange={(e) => onProcessManagerChange(e.target.value as "DOCKER_COMPOSE" | "NONE")}
            className="w-full h-10 px-3 rounded-xl text-xs bg-white dark:bg-[#060a17] border border-slate-200 dark:border-[#16223f] text-slate-900 dark:text-slate-100 outline-none"
          >
            <option value="DOCKER_COMPOSE">Docker Compose</option>
            <option value="NONE">{lang === "en" ? "None — I run the app myself" : "Yok — uygulamayı kendim çalıştırıyorum"}</option>
          </select>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {processManager === "DOCKER_COMPOSE"
              ? lang === "en"
                ? "Without a repository an example compose (nginx:alpine) is started so the site answers right away."
                : "Repo seçilmezse site hemen yanıt versin diye örnek bir compose (nginx:alpine) başlatılır."
              : lang === "en"
                ? "PM2 and custom scripts can be chosen later on the Git & Deployment tab."
                : "PM2 ve özel betik sonra Git & Dağıtım sekmesinden seçilebilir."}
          </p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="target-url" className="text-xs font-bold text-slate-700 dark:text-slate-300">
            {lang === "en" ? "Full target address (optional, instead of the port)" : "Tam hedef adres (isteğe bağlı, port yerine)"}
          </Label>
          <Input id="target-url" placeholder="http://10.0.0.5:8080" className={inputCls} />
        </div>
        <DeployCommandField lang={lang} />
      </div>
    </div>
  )
}
