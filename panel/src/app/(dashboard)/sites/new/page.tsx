"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Loader2,
  XCircle,
  Globe,
  Code2,
  Layers,
  Server,
  Sparkles,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { SITE_TYPES, type SiteType } from "@/lib/mock-data"
import { uiTypeToDbType, type ApiSite } from "@/lib/site-adapter"
import { useTranslation } from "@/components/language-provider"

function fieldValue(id: string): string {
  const el = document.getElementById(id) as HTMLInputElement | null
  return el?.value.trim() ?? ""
}

function buildConfig(type: SiteType, useWww: boolean, useSsl: boolean, sslEmail: string) {
  const config: Record<string, unknown> = { www: useWww }
  if (useSsl && sslEmail) config.sslEmail = sslEmail

  switch (type) {
    case "nodejs":
      config.nodeVersion = fieldValue("node-version")
      config.startCommand = fieldValue("start-cmd")
      config.port = fieldValue("port")
      break
    case "python":
      config.pythonVersion = fieldValue("python-version")
      config.startCommand = fieldValue("start-cmd")
      config.port = fieldValue("port")
      break
    case "wordpress":
      config.phpVersion = fieldValue("php-version")
      config.siteRoot = fieldValue("site-root")
      config.linuxUser = fieldValue("linux-user")
      config.dbName = fieldValue("db-name")
      config.dbUser = fieldValue("db-user")
      config.dbPassword = fieldValue("db-password")
      break
    case "php":
      config.phpVersion = fieldValue("php-version")
      config.siteRoot = fieldValue("site-root")
      config.linuxUser = fieldValue("linux-user")
      break
    case "static":
      config.siteRoot = fieldValue("site-root")
      config.linuxUser = fieldValue("linux-user")
      break
    case "proxy":
      config.upstreamUrl = fieldValue("target-url")
      break
  }

  return config
}

function typeChecklist(type: SiteType, managed: boolean, hasSsl: boolean, lang: "tr" | "en"): string[] {
  const items: string[] = []
  if (type === "wordpress") {
    items.push(
      lang === "en" ? "Creating database" : "Veritabanı oluşturuluyor",
      lang === "en" ? "Downloading WordPress" : "WordPress indiriliyor"
    )
  }
  items.push(lang === "en" ? "Writing Nginx configuration" : "Nginx yapılandırması yazılıyor")
  if (managed) {
    items.push(lang === "en" ? "Creating and starting systemd service" : "systemd servisi oluşturuluyor ve başlatılıyor")
  }
  if (hasSsl) {
    items.push(lang === "en" ? "Requesting SSL certificate (Let's Encrypt)" : "SSL sertifikası isteniyor (Let's Encrypt)")
  }
  return items
}

type ProvisionResult =
  | { ok: true; site: ApiSite }
  | { ok: false; message: string; siteId?: string }

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

export default function NewSitePage() {
  const { t, lang } = useTranslation()
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [selectedType, setSelectedType] = useState<SiteType | null>(null)
  const [domain, setDomain] = useState("")
  const [useWww, setUseWww] = useState(true)
  const [useSsl, setUseSsl] = useState(true)
  const [sslEmail, setSslEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ProvisionResult | null>(null)

  const typeInfo = SITE_TYPES.find((t) => t.type === selectedType)

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

      setResult({ ok: true, site: data })
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              <ArrowRight className="size-4 text-[#dfc9a0] dark:text-white" />
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

              <TypeSpecificFields type={typeInfo.type} domain={domain} t={t} lang={lang} />
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
                <Loader2 className="size-4 animate-spin text-[#dfc9a0] dark:text-white" />
              ) : (
                <Check className="size-4 text-[#dfc9a0] dark:text-white" />
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
              {typeChecklist(typeInfo.type, typeInfo.managed, useSsl, lang).map((item, index) => (
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

function TypeSpecificFields({
  type,
  domain,
  t,
  lang,
}: {
  type: SiteType
  domain: string
  t: (key: string) => string
  lang: "tr" | "en"
}) {
  const rootPlaceholder = `/var/www/${domain || (lang === "en" ? "example.com" : "ornek.com")}`

  switch (type) {
    case "nodejs":
      return (
        <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-[#16223f]">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="node-version" className="text-xs font-bold text-slate-700 dark:text-slate-300">{t("sites.wizard.nodeVersion")}</Label>
              <Input id="node-version" defaultValue="20.x" className="font-mono h-10 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="start-cmd" className="text-xs font-bold text-slate-700 dark:text-slate-300">{t("sites.wizard.startCommand")}</Label>
              <Input id="start-cmd" defaultValue="npm run start" className="font-mono h-10 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="port" className="text-xs font-bold text-slate-700 dark:text-slate-300">{t("sites.wizard.appPort")}</Label>
              <Input id="port" defaultValue="3000" className="font-mono h-10 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100" />
            </div>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">
            {t("sites.wizard.codeStoredIn").replace("{path}", rootPlaceholder)}
          </p>
        </div>
      )
    case "python":
      return (
        <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-[#16223f]">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="python-version" className="text-xs font-bold text-slate-700 dark:text-slate-300">{t("sites.wizard.pythonVersion")}</Label>
              <Input id="python-version" defaultValue="3.12" className="font-mono h-10 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="start-cmd" className="text-xs font-bold text-slate-700 dark:text-slate-300">{t("sites.wizard.startCommand")}</Label>
              <Input id="start-cmd" defaultValue="gunicorn app:app --bind 127.0.0.1:$PORT" className="font-mono h-10 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="port" className="text-xs font-bold text-slate-700 dark:text-slate-300">{t("sites.wizard.appPort")}</Label>
              <Input id="port" defaultValue="8000" className="font-mono h-10 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100" />
            </div>
          </div>
        </div>
      )
    case "wordpress":
      return (
        <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-slate-100 dark:border-[#16223f]">
          <div className="space-y-2">
            <Label htmlFor="php-version" className="text-xs font-bold text-slate-700 dark:text-slate-300">{t("sites.wizard.phpVersion")}</Label>
            <Input id="php-version" defaultValue="8.3" className="font-mono h-10 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="site-root" className="text-xs font-bold text-slate-700 dark:text-slate-300">{t("sites.wizard.siteRoot")}</Label>
            <Input id="site-root" placeholder={rootPlaceholder} className="font-mono h-10 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="db-name" className="text-xs font-bold text-slate-700 dark:text-slate-300">{t("sites.wizard.dbName")}</Label>
            <Input id="db-name" placeholder={domain.replace(/[^a-zA-Z0-9]/g, "_") || "wp_db"} className="font-mono h-10 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="db-user" className="text-xs font-bold text-slate-700 dark:text-slate-300">{t("sites.wizard.dbUser")}</Label>
            <Input id="db-user" placeholder="wp_user" className="font-mono h-10 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="db-password" className="text-xs font-bold text-slate-700 dark:text-slate-300">{t("sites.wizard.dbPassword")}</Label>
            <Input id="db-password" type="password" placeholder={t("sites.wizard.dbPasswordPlaceholder")} className="font-mono h-10 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100" />
          </div>
        </div>
      )
    case "php":
      return (
        <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-slate-100 dark:border-[#16223f]">
          <div className="space-y-2">
            <Label htmlFor="php-version" className="text-xs font-bold text-slate-700 dark:text-slate-300">{t("sites.wizard.phpVersion")}</Label>
            <Input id="php-version" defaultValue="8.3" className="font-mono h-10 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="site-root" className="text-xs font-bold text-slate-700 dark:text-slate-300">{t("sites.wizard.siteRoot")}</Label>
            <Input id="site-root" placeholder={rootPlaceholder} className="font-mono h-10 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100" />
          </div>
        </div>
      )
    case "static":
      return (
        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-[#16223f]">
          <Label htmlFor="site-root" className="text-xs font-bold text-slate-700 dark:text-slate-300">{t("sites.wizard.siteRoot")}</Label>
          <Input id="site-root" placeholder={rootPlaceholder} className="font-mono h-10 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100" />
        </div>
      )
    case "proxy":
      return (
        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-[#16223f]">
          <Label htmlFor="target-url" className="text-xs font-bold text-slate-700 dark:text-slate-300">{t("sites.wizard.upstreamUrl")}</Label>
          <Input id="target-url" placeholder="http://127.0.0.1:8080" className="font-mono h-10 rounded-xl bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100" />
        </div>
      )
  }
}