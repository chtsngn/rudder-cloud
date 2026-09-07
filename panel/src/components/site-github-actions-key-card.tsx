"use client"

import { useCallback, useEffect, useState } from "react"
import { Copy, KeyRound, Loader2, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { useTranslation } from "@/components/language-provider"

interface ActionsKeyData {
  keyName: string
  publicKey: string | null
  fingerprint: string | null
  createdAt: string | null
}

interface GhResult {
  attempted: boolean
  ok: boolean
  message: string
}

async function parseError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  return data?.error ?? `İstek başarısız oldu (${res.status}).`
}

/**
 * GitHub Actions'ın (kullanıcının KENDİ CI/CD akışı) bu sunucuya SSH ile
 * bağlanıp deploy komutları çalıştırabilmesi için bir anahtar çifti üretir.
 * GitHub App entegrasyonuyla (bkz. github-app.ts) İLGİSİZ — o panelin
 * KENDİ pull mekanizmasını kimliklendiriyor, bu ise tam tersi yönde: dışarıdan
 * (GitHub Actions) sunucuya erişim. Eskiden burada bir de manuel "Deploy Key
 * (git clone/pull)" bölümü vardı — GitHub App bunu tamamen gereksiz kıldığı
 * için 2026-09-07'de kaldırıldı (bkz. docs/ARCHITECTURE.md).
 */
export function SiteGithubActionsKeyCard({ siteId, repoSlug }: { siteId: string; repoSlug?: string }) {
  const { t, lang } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [actionsKey, setActionsKey] = useState<ActionsKeyData | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const [actionsCreating, setActionsCreating] = useState(false)
  const [actionsError, setActionsError] = useState<string | null>(null)
  const [actionsDeleting, setActionsDeleting] = useState(false)
  const [useGh, setUseGh] = useState(false)
  const [ghResult, setGhResult] = useState<GhResult | null>(null)
  const [revealedPrivateKey, setRevealedPrivateKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/sites/${siteId}/actions-key`, { cache: "no-store" })
      if (!res.ok) {
        setLoadError(await parseError(res))
        return
      }
      const data = (await res.json()) as { actionsKey: ActionsKeyData | null }
      setActionsKey(data.actionsKey)
    } catch {
      setLoadError(lang === "tr" ? "Sunucuya bağlanılamadı." : "Failed to connect to server.")
    } finally {
      setLoading(false)
    }
  }, [siteId, lang])

  useEffect(() => {
    // `load()` senkron olarak `setLoading(true)` çağırıyor — bir sonraki
    // makrotaska erteleyerek react-hooks/set-state-in-effect'i tetiklememek
    // için (bkz. sites/[id]/page.tsx'teki `loadLogs` effect'iyle aynı desen).
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])

  function copy(field: string, value: string) {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopiedField(field)
        setTimeout(() => setCopiedField((f) => (f === field ? null : f)), 2000)
      })
      .catch(() => {})
  }

  async function handleCreateActionsKey() {
    setActionsCreating(true)
    setActionsError(null)
    setGhResult(null)
    setRevealedPrivateKey(null)
    try {
      const res = await fetch(`/api/sites/${siteId}/actions-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useGh, repoSlug: repoSlug || undefined }),
      })
      if (!res.ok) {
        setActionsError(await parseError(res))
        return
      }
      const data = (await res.json()) as {
        actionsKey: ActionsKeyData
        ghResult: GhResult | null
        privateKey?: string
      }
      setActionsKey(data.actionsKey)
      setGhResult(data.ghResult)
      if (data.privateKey) setRevealedPrivateKey(data.privateKey)
    } catch {
      setActionsError("Sunucuya bağlanılamadı.")
    } finally {
      setActionsCreating(false)
    }
  }

  async function handleDeleteActionsKey() {
    if (
      !window.confirm(
        "Actions anahtarı silinsin mi? GitHub Actions bu anahtarla artık sunucuya bağlanamaz."
      )
    )
      return
    setActionsDeleting(true)
    setActionsError(null)
    try {
      const res = await fetch(`/api/sites/${siteId}/actions-key`, { method: "DELETE" })
      if (!res.ok) {
        setActionsError(await parseError(res))
        return
      }
      setActionsKey(null)
      setGhResult(null)
      setRevealedPrivateKey(null)
    } catch {
      setActionsError("Sunucuya bağlanılamadı.")
    } finally {
      setActionsDeleting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" />
          {lang === "tr" ? "GitHub Actions Erişimi (SSH Deploy)" : "GitHub Actions Access (SSH Deploy)"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {lang === "tr"
                ? "GitHub Actions'ın bu sunucuya SSH ile bağlanıp deploy komutlarını çalıştırabilmesi için — public key sunucuda panel kullanıcısının kendi authorized_keys dosyasına eklenir."
                : "For GitHub Actions to SSH into this server and run deploy scripts — public key is added to the panel user's authorized_keys file on the server."}
            </p>

            {!actionsKey ? (
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={useGh}
                    onChange={(e) => setUseGh(e.target.checked)}
                    className="size-4 rounded border-input"
                  />
                  {lang === "tr"
                    ? "Sunucuda gh CLI kuruluysa secret'ı otomatik eklemeyi dene"
                    : "Try auto-injecting secret if gh CLI is installed on server"}
                </label>
                <Button onClick={handleCreateActionsKey} disabled={actionsCreating}>
                  {actionsCreating && <Loader2 className="size-4 animate-spin" />}
                  {lang === "tr" ? "Actions Anahtarı Oluştur" : "Create Actions Key"}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <dl className="divide-y divide-border rounded-lg border border-border">
                  <div className="flex items-center justify-between px-3 py-2 text-sm">
                    <dt className="text-muted-foreground">{lang === "tr" ? "Anahtar adı" : "Key name"}</dt>
                    <dd className="font-mono text-xs text-foreground">{actionsKey.keyName}</dd>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 text-sm">
                    <dt className="text-muted-foreground">{t("settings.github.fingerprintLabel")}</dt>
                    <dd className="font-mono text-xs text-foreground">
                      {actionsKey.fingerprint || "—"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 text-sm">
                    <dt className="text-muted-foreground">authorized_keys</dt>
                    <dd className="text-success">{lang === "tr" ? "Eklendi" : "Added"}</dd>
                  </div>
                </dl>

                {ghResult && (
                  <p className={`text-xs ${ghResult.ok ? "text-success" : "text-muted-foreground"}`}>
                    {ghResult.message}
                  </p>
                )}

                {revealedPrivateKey && (
                  <div className="space-y-1.5 rounded-lg border border-warning/40 p-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-warning">
                        {lang === "tr" ? "Private key — yalnızca bu sefer gösteriliyor" : "Private key — shown only once"}
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copy("actionsPriv", revealedPrivateKey)}
                      >
                        <Copy className="size-3.5" />
                        {copiedField === "actionsPriv" ? t("common.copied") : t("common.copy")}
                      </Button>
                    </div>
                    <pre className="overflow-x-auto rounded-lg bg-muted/40 p-3 text-xs">
                      {revealedPrivateKey}
                    </pre>
                    <p className="text-xs text-muted-foreground">
                      {lang === "tr"
                        ? "GitHub: Repo → Settings → Secrets and variables → Actions → New repository secret. Secret adı: SSH_PRIVATE_KEY."
                        : "GitHub: Repo → Settings → Secrets and variables → Actions → New repository secret. Secret name: SSH_PRIVATE_KEY."}
                    </p>
                  </div>
                )}

                <Button variant="ghost" onClick={handleDeleteActionsKey} disabled={actionsDeleting}>
                  {actionsDeleting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  {t("common.delete")}
                </Button>
              </div>
            )}

            {actionsError && <p className="text-sm text-destructive">{actionsError}</p>}
          </>
        )}
      </CardContent>
    </Card>
  )
}
