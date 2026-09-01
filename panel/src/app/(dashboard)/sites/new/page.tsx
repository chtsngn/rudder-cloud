"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2, XCircle } from "lucide-react"

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

/**
 * Bu, gerçek canlı bir kurulum logu DEĞİL — provisioning tek bir senkron
 * istekte gerçekleştiği için adım adım ilerleme bilgisi yok (bkz. proje
 * notları). Kullanıcıya bu site türü için tipik olarak neler yapıldığını
 * gösteren statik bir referans listesi; hepsi aynı anda "beklemede"
 * gösterilir, istek bitince tek bir sonuç ekranına geçilir.
 */
function typeChecklist(type: SiteType, managed: boolean, hasSsl: boolean): string[] {
  const items: string[] = []
  if (type === "wordpress") items.push("Veritabanı oluşturuluyor", "WordPress indiriliyor")
  items.push("Nginx yapılandırması yazılıyor")
  if (managed) items.push("systemd servisi oluşturuluyor ve başlatılıyor")
  if (hasSsl) items.push("SSL sertifikası isteniyor (Let's Encrypt)")
  return items
}

type ProvisionResult =
  | { ok: true; site: ApiSite }
  | { ok: false; message: string; siteId?: string }

export default function NewSitePage() {
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
        setResult({ ok: false, message: data?.error ?? "Site oluşturulamadı. Lütfen tekrar deneyin." })
        return
      }

      if (data.status === "FAILED") {
        const cfg = (data.config ?? {}) as Record<string, unknown>
        const message =
          typeof cfg.provisionError === "string" ? cfg.provisionError : "Kurulum başarısız oldu."
        setResult({ ok: false, message, siteId: data.id })
        return
      }

      setResult({ ok: true, site: data })
    } catch {
      setResult({ ok: false, message: "Sunucuya bağlanılamadı. Lütfen tekrar deneyin." })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Anasayfaya dön
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-semibold text-foreground">
          Yeni Site Ekle
        </h1>
        <p className="text-sm text-muted-foreground">
          Adım {step} / 3 —{" "}
          {step === 1
            ? "Site türünü seçin"
            : step === 2
              ? "Site ayarlarını girin"
              : "Kurulum"}
        </p>
      </div>

      {step === 1 && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SITE_TYPES.map((t) => (
              <button
                key={t.type}
                type="button"
                onClick={() => setSelectedType(t.type)}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors",
                  selectedType === t.type
                    ? "border-ring bg-secondary ring-2 ring-ring/40"
                    : "border-border bg-card hover:border-ring/40"
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="flex size-9 items-center justify-center rounded-md bg-muted font-mono text-[11px] font-semibold text-foreground">
                    {t.abbr}
                  </span>
                  {selectedType === t.type && (
                    <Check className="size-4 text-primary" />
                  )}
                </div>
                <p className="font-medium text-foreground">{t.label}</p>
                <p className="text-xs text-muted-foreground">{t.description}</p>
              </button>
            ))}
          </div>

          <div className="flex justify-end">
            <Button disabled={!selectedType} onClick={() => setStep(2)}>
              İleri
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 2 && typeInfo && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{typeInfo.label} sitesi ayarları</CardTitle>
              <CardDescription>
                Bu bilgiler daha sonra site ayrıntıları sayfasından değiştirilebilir.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="domain">Alan adı</Label>
                <Input
                  id="domain"
                  placeholder="ornek.com"
                  className="font-mono"
                  value={domain}
                  onChange={(event) => setDomain(event.target.value)}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    www yönlendirmesi
                  </p>
                  <p className="text-xs text-muted-foreground">
                    www.{domain || "ornek.com"} adresini de kapsar
                  </p>
                </div>
                <Switch checked={useWww} onCheckedChange={setUseWww} />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    SSL sertifikası (Let&apos;s Encrypt)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Otomatik SSL kurulumu ve yenileme
                  </p>
                </div>
                <Switch checked={useSsl} onCheckedChange={setUseSsl} />
              </div>

              {useSsl && (
                <div className="space-y-2">
                  <Label htmlFor="ssl-email">SSL bildirim e-postası</Label>
                  <Input
                    id="ssl-email"
                    type="email"
                    placeholder="admin@ornek.com"
                    value={sslEmail}
                    onChange={(event) => setSslEmail(event.target.value)}
                  />
                </div>
              )}

              <TypeSpecificFields type={typeInfo.type} domain={domain} />
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)} disabled={submitting}>
              <ArrowLeft className="size-4" />
              Geri
            </Button>
            <Button onClick={handleCreate} disabled={!domain.trim() || submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Siteyi Oluştur
            </Button>
          </div>
        </>
      )}

      {step === 3 && typeInfo && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                {result === null
                  ? "Site kuruluyor…"
                  : result.ok
                    ? "Site oluşturuldu"
                    : "Kurulum başarısız"}
              </CardTitle>
              <CardDescription>
                {result === null
                  ? "Bu işlem WordPress indirme veya SSL doğrulaması nedeniyle birkaç dakika sürebilir. Bu pencereyi kapatabilirsiniz, kurulum arka planda devam eder."
                  : result.ok
                    ? `${domain} artık Nginx üzerinden sunuluyor.`
                    : "Aşağıdaki hatayı inceleyip tekrar deneyebilir ya da site kaydını inceleyebilirsiniz."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {result === null && (
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {typeChecklist(typeInfo.type, typeInfo.managed, useSsl).map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <Loader2 className="size-3.5 shrink-0 animate-spin" />
                      {item}
                    </li>
                  ))}
                </ul>
              )}

              {result?.ok === true && (
                <div className="flex items-start gap-2 rounded-lg border border-success/40 bg-success/5 p-3 text-sm text-success">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Nginx{typeInfo.managed ? ", systemd servisi" : ""}
                    {useSsl ? " ve SSL sertifikası" : ""} yapılandırıldı.
                  </span>
                </div>
              )}

              {result?.ok === false && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
                  <XCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{result.message}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {result !== null && (
            <div className="flex justify-between">
              {result.ok ? (
                <>
                  <Button variant="outline" onClick={() => router.push("/")}>
                    Site listesine dön
                  </Button>
                  <Button
                    onClick={() => {
                      router.push(`/sites/${result.site.id}`)
                      router.refresh()
                    }}
                  >
                    Siteye git
                    <ArrowRight className="size-4" />
                  </Button>
                </>
              ) : (
                <>
                  {result.siteId ? (
                    <Button variant="outline" onClick={() => router.push("/")}>
                      Site listesine dön
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={() => setStep(2)}>
                      <ArrowLeft className="size-4" />
                      Geri dön
                    </Button>
                  )}
                  {result.siteId && (
                    <Button
                      onClick={() => {
                        router.push(`/sites/${result.siteId}`)
                        router.refresh()
                      }}
                    >
                      Site kaydını incele
                      <ArrowRight className="size-4" />
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TypeSpecificFields({ type, domain }: { type: SiteType; domain: string }) {
  const rootPlaceholder = `/var/www/${domain || "ornek.com"}`

  switch (type) {
    case "nodejs":
      return (
        <div className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="node-version">Node.js sürümü (bilgi amaçlı)</Label>
              <Input id="node-version" defaultValue="20.x" className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="start-cmd">Başlatma komutu</Label>
              <Input id="start-cmd" defaultValue="npm run start" className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="port">Uygulama portu</Label>
              <Input id="port" defaultValue="3000" className="font-mono" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Uygulama kodunun sunucuda önceden <code className="font-mono">{rootPlaceholder}</code>{" "}
            dizinine yüklenmiş olması gerekir; panel systemd servisini bu dizinde{" "}
            <code className="font-mono">panel</code> kullanıcısıyla çalıştırır.
          </p>
        </div>
      )
    case "python":
      return (
        <div className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="python-version">Python sürümü (bilgi amaçlı)</Label>
              <Input id="python-version" defaultValue="3.12" className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="start-cmd">Başlatma komutu</Label>
              <Input id="start-cmd" defaultValue="gunicorn app:app --bind 127.0.0.1:$PORT" className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="port">Uygulama portu</Label>
              <Input id="port" defaultValue="8000" className="font-mono" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Uygulama kodunun sunucuda önceden <code className="font-mono">{rootPlaceholder}</code>{" "}
            dizinine yüklenmiş olması gerekir; panel systemd servisini bu dizinde{" "}
            <code className="font-mono">panel</code> kullanıcısıyla çalıştırır.
          </p>
        </div>
      )
    case "wordpress":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="php-version">PHP sürümü</Label>
            <Input id="php-version" defaultValue="8.3" className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="site-root">Site kök dizini</Label>
            <Input id="site-root" placeholder={rootPlaceholder} className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="linux-user">Linux kullanıcısı (opsiyonel)</Label>
            <Input id="linux-user" placeholder="boş bırakılırsa oluşturulmaz" className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="db-name">Veritabanı adı</Label>
            <Input id="db-name" defaultValue="wp_site" className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="db-user">Veritabanı kullanıcısı</Label>
            <Input id="db-user" defaultValue="wp_site_u" className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="db-password">Veritabanı şifresi</Label>
            <Input id="db-password" type="password" className="font-mono" />
          </div>
        </div>
      )
    case "php":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="php-version">PHP sürümü</Label>
            <Input id="php-version" defaultValue="8.3" className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="site-root">Site kök dizini</Label>
            <Input id="site-root" placeholder={rootPlaceholder} className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="linux-user">Linux kullanıcısı (opsiyonel)</Label>
            <Input id="linux-user" placeholder="boş bırakılırsa oluşturulmaz" className="font-mono" />
          </div>
        </div>
      )
    case "static":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="site-root">Site kök dizini</Label>
            <Input id="site-root" placeholder={rootPlaceholder} className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="linux-user">Linux kullanıcısı (opsiyonel)</Label>
            <Input id="linux-user" placeholder="boş bırakılırsa oluşturulmaz" className="font-mono" />
          </div>
        </div>
      )
    case "proxy":
      return (
        <div className="space-y-2">
          <Label htmlFor="target-url">Hedef adres</Label>
          <Input id="target-url" placeholder="http://127.0.0.1:4000" className="font-mono" />
        </div>
      )
  }
}
