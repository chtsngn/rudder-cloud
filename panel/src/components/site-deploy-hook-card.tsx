"use client"

import { useCallback, useEffect, useState } from "react"
import { Copy, Link2, Loader2, RefreshCw, Trash2, Webhook } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useTranslation } from "@/components/language-provider"

interface HookStatus {
  configured: boolean
  createdAt: string | null
}

async function parseError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  return data?.error ?? `İstek başarısız oldu (${res.status}).`
}

/**
 * Deploy hook kartı (2026-09-15) — GitHub Actions SSH anahtarının yerine:
 * CI'dan tek bir POST ile bu siteyi deploy ettir. URL yalnızca üretim anında
 * gösterilir (token saklanmıyor). GitHub App bağlıysa push webhook'u zaten
 * otomatik tetikliyor; bu hook GitHub dışı CI'lar ve "build bittikten sonra
 * deploy" senaryoları için.
 */
export function SiteDeployHookCard({ siteId, githubConnected }: { siteId: string; githubConnected: boolean }) {
  const { lang } = useTranslation()
  const [status, setStatus] = useState<HookStatus | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revealedUrl, setRevealedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const res = await fetch(`/api/sites/${siteId}/deploy-hook`, { cache: "no-store" })
      if (!res.ok) {
        setLoadError(await parseError(res))
        return
      }
      setStatus((await res.json()) as HookStatus)
    } catch {
      setLoadError(lang === "en" ? "Could not reach the server." : "Sunucuya bağlanılamadı.")
    }
  }, [siteId, lang])

  useEffect(() => {
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])

  async function handleGenerate() {
    if (status?.configured && !window.confirm(lang === "en" ? "Regenerate the hook URL? The old URL stops working immediately." : "Hook URL'i yenilensin mi? Eski URL anında geçersiz olur.")) return
    setBusy(true)
    setError(null)
    setRevealedUrl(null)
    try {
      const res = await fetch(`/api/sites/${siteId}/deploy-hook`, { method: "POST" })
      if (!res.ok) {
        setError(await parseError(res))
        return
      }
      const data = (await res.json()) as HookStatus & { url: string }
      setStatus({ configured: true, createdAt: data.createdAt })
      setRevealedUrl(data.url)
    } catch {
      setError(lang === "en" ? "Could not reach the server." : "Sunucuya bağlanılamadı.")
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(lang === "en" ? "Remove the deploy hook? CI calls to the URL will fail." : "Deploy hook kaldırılsın mı? URL'e gelen CI çağrıları başarısız olur.")) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/sites/${siteId}/deploy-hook`, { method: "DELETE" })
      if (!res.ok) {
        setError(await parseError(res))
        return
      }
      setStatus({ configured: false, createdAt: null })
      setRevealedUrl(null)
    } catch {
      setError(lang === "en" ? "Could not reach the server." : "Sunucuya bağlanılamadı.")
    } finally {
      setBusy(false)
    }
  }

  function copy(value: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Webhook className="size-4" />
          {lang === "en" ? "Deploy Hook (CI/CD trigger)" : "Deploy Hook (CI/CD tetikleyicisi)"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          {lang === "en"
            ? "A secret URL. A single POST from your CI (GitHub Actions, GitLab CI, a cron, curl…) runs this site's deploy pipeline: pull → deploy command → restart. No SSH key needed."
            : "Gizli bir URL. CI'ınızdan (GitHub Actions, GitLab CI, cron, curl…) atılan tek bir POST bu sitenin deploy hattını çalıştırır: pull → deploy komutu → yeniden başlatma. SSH anahtarı gerekmez."}
        </p>
        {githubConnected && (
          <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
            {lang === "en"
              ? "This site is connected to a GitHub App: pushes to the connected branch already deploy automatically through the App's webhook (see Settings → GitHub App). The hook below is optional."
              : "Bu site bir GitHub App'e bağlı: bağlı branch'e yapılan push'lar App'in webhook'u üzerinden zaten otomatik deploy ediliyor (bkz. Ayarlar → GitHub App). Aşağıdaki hook isteğe bağlı."}
          </p>
        )}

        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : status === null ? (
          <div className="flex items-center justify-center py-4 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleGenerate} disabled={busy} size="sm">
                {busy ? <Loader2 className="size-4 animate-spin" /> : status.configured ? <RefreshCw className="size-4" /> : <Link2 className="size-4" />}
                {status.configured
                  ? (lang === "en" ? "Regenerate URL" : "URL'i Yenile")
                  : (lang === "en" ? "Create Hook URL" : "Hook URL'i Oluştur")}
              </Button>
              {status.configured && (
                <>
                  <span className="text-xs text-muted-foreground">
                    {lang === "en" ? "Active since" : "Aktif:"}{" "}
                    {status.createdAt ? new Date(status.createdAt).toLocaleString(lang === "en" ? "en-US" : "tr-TR") : "—"}
                  </span>
                  <Button variant="ghost" size="sm" onClick={handleDelete} disabled={busy}>
                    <Trash2 className="size-3.5" />
                    {lang === "en" ? "Remove" : "Kaldır"}
                  </Button>
                </>
              )}
            </div>

            {revealedUrl && (
              <div className="space-y-2 rounded-lg border border-warning/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-warning">
                    {lang === "en" ? "Shown only once — copy it now" : "Yalnızca bu sefer gösteriliyor — şimdi kopyalayın"}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => copy(revealedUrl)}>
                    <Copy className="size-3.5" />
                    {copied ? (lang === "en" ? "Copied" : "Kopyalandı") : (lang === "en" ? "Copy" : "Kopyala")}
                  </Button>
                </div>
                <pre className="overflow-x-auto rounded-lg bg-muted/40 p-3 text-xs">{revealedUrl}</pre>
                <p className="text-[11px] text-muted-foreground">
                  {lang === "en" ? "Example (GitHub Actions step, URL stored as a secret):" : "Örnek (GitHub Actions adımı, URL bir secret olarak saklanır):"}
                </p>
                <pre className="overflow-x-auto rounded-lg bg-muted/40 p-3 text-[11px]">{`- name: Deploy
  run: curl -fsS -X POST "\${{ secrets.RUDDER_DEPLOY_HOOK }}?wait=1"`}</pre>
                <p className="text-[11px] text-muted-foreground">
                  {lang === "en"
                    ? "`?wait=1` waits for the deploy and fails the step if it fails; without it the panel answers 202 immediately and deploys in the background."
                    : "`?wait=1` deploy bitene kadar bekler ve başarısızsa adımı düşürür; onsuz panel hemen 202 döner ve arka planda deploy eder."}
                </p>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </>
        )}
      </CardContent>
    </Card>
  )
}
