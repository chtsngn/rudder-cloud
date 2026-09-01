"use client"

import { useCallback, useEffect, useState } from "react"
import { Copy, KeyRound, Loader2, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface DeployKeyData {
  keyName: string
  hostAlias: string
  publicKey: string | null
  fingerprint: string | null
  createdAt: string | null
}

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

/** `owner/repo` çıkarımı — yalnızca varsayılan input değeri için, panelin
 * kendi git.ts doğrulamasının bir kopyası değil (o sunucu tarafında kalıyor). */
function guessOwnerRepo(url: string): string {
  const httpsMatch = url.match(/^https:\/\/[^/]+\/([^/]+\/[^/]+?)(\.git)?\/?$/)
  if (httpsMatch) return httpsMatch[1]
  const sshMatch = url.match(/^git@[^:]+:([^/]+\/[^/]+?)(\.git)?$/)
  if (sshMatch) return sshMatch[1]
  return ""
}

export function SiteGithubKeysCard({
  siteId,
  initialRepoUrl,
}: {
  siteId: string
  initialRepoUrl?: string
}) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [deployKey, setDeployKey] = useState<DeployKeyData | null>(null)
  const [actionsKey, setActionsKey] = useState<ActionsKeyData | null>(null)

  const [repoSlug, setRepoSlug] = useState("")
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const [deployCreating, setDeployCreating] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)
  const [deployDeleting, setDeployDeleting] = useState(false)
  const [deployTesting, setDeployTesting] = useState(false)
  const [deployTestResult, setDeployTestResult] = useState<{ ok: boolean; output: string } | null>(
    null
  )

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
      const [deployRes, actionsRes] = await Promise.all([
        fetch(`/api/sites/${siteId}/deploy-key`, { cache: "no-store" }),
        fetch(`/api/sites/${siteId}/actions-key`, { cache: "no-store" }),
      ])
      if (!deployRes.ok) {
        setLoadError(await parseError(deployRes))
        return
      }
      if (!actionsRes.ok) {
        setLoadError(await parseError(actionsRes))
        return
      }
      const deployData = (await deployRes.json()) as { deployKey: DeployKeyData | null }
      const actionsData = (await actionsRes.json()) as { actionsKey: ActionsKeyData | null }
      setDeployKey(deployData.deployKey)
      setActionsKey(actionsData.actionsKey)
    } catch {
      setLoadError("Sunucuya bağlanılamadı.")
    } finally {
      setLoading(false)
    }
  }, [siteId])

  useEffect(() => {
    const timer = setTimeout(() => {
      setRepoSlug(guessOwnerRepo(initialRepoUrl ?? ""))
      load()
    }, 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId])

  function copy(field: string, value: string) {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopiedField(field)
        setTimeout(() => setCopiedField((f) => (f === field ? null : f)), 2000)
      })
      .catch(() => {
        // clipboard API kullanılamıyorsa sessizce yut — kullanıcı yine de
        // metni elle seçip kopyalayabilir.
      })
  }

  async function handleCreateDeployKey() {
    setDeployCreating(true)
    setDeployError(null)
    setDeployTestResult(null)
    try {
      const res = await fetch(`/api/sites/${siteId}/deploy-key`, { method: "POST" })
      if (!res.ok) {
        setDeployError(await parseError(res))
        return
      }
      const data = (await res.json()) as { deployKey: DeployKeyData }
      setDeployKey(data.deployKey)
    } catch {
      setDeployError("Sunucuya bağlanılamadı.")
    } finally {
      setDeployCreating(false)
    }
  }

  async function handleDeleteDeployKey() {
    if (!window.confirm("Deploy key silinsin mi? GitHub'daki Deploy Keys kaydı çalışmaz hale gelir."))
      return
    setDeployDeleting(true)
    setDeployError(null)
    try {
      const res = await fetch(`/api/sites/${siteId}/deploy-key`, { method: "DELETE" })
      if (!res.ok) {
        setDeployError(await parseError(res))
        return
      }
      setDeployKey(null)
      setDeployTestResult(null)
    } catch {
      setDeployError("Sunucuya bağlanılamadı.")
    } finally {
      setDeployDeleting(false)
    }
  }

  async function handleTestDeployKey() {
    setDeployTesting(true)
    setDeployTestResult(null)
    setDeployError(null)
    try {
      const res = await fetch(`/api/sites/${siteId}/deploy-key/test`, { method: "POST" })
      const data = (await res.json().catch(() => null)) as
        | { ok: boolean; output: string; error?: string }
        | null
      if (!res.ok) {
        setDeployError(data?.error ?? "Bağlantı testi başarısız oldu.")
        return
      }
      if (data) setDeployTestResult({ ok: data.ok, output: data.output })
    } catch {
      setDeployError("Sunucuya bağlanılamadı.")
    } finally {
      setDeployTesting(false)
    }
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

  const suggestedCloneUrl =
    deployKey && repoSlug ? `git@${deployKey.hostAlias}:${repoSlug}.git` : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" />
          GitHub Erişim Anahtarları
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="repoSlug">GitHub owner/repo</Label>
              <Input
                id="repoSlug"
                value={repoSlug}
                onChange={(e) => setRepoSlug(e.target.value)}
                placeholder="codextrasoft/my-repo"
              />
              <p className="text-xs text-muted-foreground">
                Yalnızca aşağıdaki önerilen adresleri ve otomatik secret eklemeyi oluşturmak için
                kullanılır — kaydedilmez.
              </p>
            </div>

            {/* --- Deploy key --- */}
            <div className="space-y-3 border-t border-border pt-4">
              <div>
                <h3 className="text-sm font-medium text-foreground">Deploy Key (git clone/pull)</h3>
                <p className="text-xs text-muted-foreground">
                  Private repodan çekiş yapabilmek için tek yönlü, salt-okunur bir SSH anahtarı.
                </p>
              </div>

              {!deployKey ? (
                <Button onClick={handleCreateDeployKey} disabled={deployCreating}>
                  {deployCreating && <Loader2 className="size-4 animate-spin" />}
                  Deploy Key Oluştur
                </Button>
              ) : (
                <div className="space-y-3">
                  <dl className="divide-y divide-border rounded-lg border border-border">
                    <div className="flex items-center justify-between px-3 py-2 text-sm">
                      <dt className="text-muted-foreground">Anahtar adı</dt>
                      <dd className="font-mono text-xs text-foreground">{deployKey.keyName}</dd>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2 text-sm">
                      <dt className="text-muted-foreground">Parmak izi</dt>
                      <dd className="font-mono text-xs text-foreground">
                        {deployKey.fingerprint || "—"}
                      </dd>
                    </div>
                  </dl>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>Public key</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copy("deployPub", deployKey.publicKey ?? "")}
                      >
                        <Copy className="size-3.5" />
                        {copiedField === "deployPub" ? "Kopyalandı" : "Kopyala"}
                      </Button>
                    </div>
                    <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-xs">
                      {deployKey.publicKey}
                    </pre>
                    <p className="text-xs text-muted-foreground">
                      GitHub: Repo → Settings → Deploy keys → Add deploy key. Yazma erişimi
                      gerekmiyorsa &quot;Allow write access&quot; kutusunu işaretleme.
                    </p>
                  </div>

                  {suggestedCloneUrl && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label>Önerilen Repo URL (alias ile)</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copy("cloneUrl", suggestedCloneUrl)}
                        >
                          <Copy className="size-3.5" />
                          {copiedField === "cloneUrl" ? "Kopyalandı" : "Kopyala"}
                        </Button>
                      </div>
                      <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-xs">
                        {suggestedCloneUrl}
                      </pre>
                      <p className="text-xs text-muted-foreground">
                        Bu deploy key&apos;in kullanılması için yukarıdaki &quot;Git &amp; Dağıtım&quot;
                        kartındaki Repo URL alanına bu adresi yapıştır.
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" onClick={handleTestDeployKey} disabled={deployTesting}>
                      {deployTesting && <Loader2 className="size-4 animate-spin" />}
                      Bağlantıyı Test Et
                    </Button>
                    <Button variant="ghost" onClick={handleDeleteDeployKey} disabled={deployDeleting}>
                      {deployDeleting ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                      Sil
                    </Button>
                  </div>

                  {deployTestResult && (
                    <div
                      className={`rounded-lg border p-3 text-xs ${
                        deployTestResult.ok
                          ? "border-success/40 text-success"
                          : "border-warning/40 text-warning"
                      }`}
                    >
                      <p className="mb-1 font-medium">
                        {deployTestResult.ok
                          ? "Bağlantı doğrulandı."
                          : "Kesin sonuç alınamadı — çıktıyı incele:"}
                      </p>
                      <pre className="overflow-x-auto whitespace-pre-wrap font-mono">
                        {deployTestResult.output || "(çıktı yok)"}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {deployError && <p className="text-sm text-destructive">{deployError}</p>}
            </div>

            {/* --- Actions key --- */}
            <div className="space-y-3 border-t border-border pt-4">
              <div>
                <h3 className="text-sm font-medium text-foreground">
                  GitHub Actions Erişimi (SSH deploy)
                </h3>
                <p className="text-xs text-muted-foreground">
                  GitHub Actions&apos;ın bu sunucuya SSH ile bağlanıp deploy komutlarını
                  çalıştırabilmesi için — public key sunucuda{" "}
                  <span className="font-mono">panel</span> kullanıcısının kendi{" "}
                  <span className="font-mono">authorized_keys</span> dosyasına eklenir.
                </p>
              </div>

              {!actionsKey ? (
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={useGh}
                      onChange={(e) => setUseGh(e.target.checked)}
                      className="size-4 rounded border-input"
                    />
                    Sunucuda <span className="font-mono">gh</span> CLI kuruluysa secret&apos;ı otomatik
                    eklemeyi dene
                  </label>
                  <Button onClick={handleCreateActionsKey} disabled={actionsCreating}>
                    {actionsCreating && <Loader2 className="size-4 animate-spin" />}
                    Actions Anahtarı Oluştur
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <dl className="divide-y divide-border rounded-lg border border-border">
                    <div className="flex items-center justify-between px-3 py-2 text-sm">
                      <dt className="text-muted-foreground">Anahtar adı</dt>
                      <dd className="font-mono text-xs text-foreground">{actionsKey.keyName}</dd>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2 text-sm">
                      <dt className="text-muted-foreground">Parmak izi</dt>
                      <dd className="font-mono text-xs text-foreground">
                        {actionsKey.fingerprint || "—"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2 text-sm">
                      <dt className="text-muted-foreground">authorized_keys</dt>
                      <dd className="text-success">Eklendi</dd>
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
                          Private key — yalnızca bu sefer gösteriliyor
                        </Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copy("actionsPriv", revealedPrivateKey)}
                        >
                          <Copy className="size-3.5" />
                          {copiedField === "actionsPriv" ? "Kopyalandı" : "Kopyala"}
                        </Button>
                      </div>
                      <pre className="overflow-x-auto rounded-lg bg-muted/40 p-3 text-xs">
                        {revealedPrivateKey}
                      </pre>
                      <p className="text-xs text-muted-foreground">
                        GitHub: Repo → Settings → Secrets and variables → Actions → New repository
                        secret. Secret adı: <span className="font-mono">SSH_PRIVATE_KEY</span>. Bu
                        değer panelde tekrar gösterilmeyecek — kopyaladıktan sonra sayfadan
                        ayrılabilirsin.
                      </p>
                    </div>
                  )}

                  <Button variant="ghost" onClick={handleDeleteActionsKey} disabled={actionsDeleting}>
                    {actionsDeleting ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                    Sil
                  </Button>
                </div>
              )}

              {actionsError && <p className="text-sm text-destructive">{actionsError}</p>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
