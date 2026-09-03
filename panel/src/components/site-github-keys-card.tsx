"use client"

import { useCallback, useEffect, useState } from "react"
import { Copy, KeyRound, Loader2, RefreshCw, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTranslation } from "@/components/language-provider"
import { cn } from "@/lib/utils"

interface DeployKeyData {
  keyName: string
  hostAlias: string
  publicKey: string | null
  fingerprint: string | null
  createdAt: string | null
  githubStatus?: "active" | "deleted_on_github" | "not_checked"
  githubKeyId?: number | null
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

interface GitHubRepoItem {
  id: number
  fullName: string
  defaultBranch: string
  private: boolean
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
  const { t, lang } = useTranslation()
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

  const [ghAccount, setGhAccount] = useState<{ username: string; avatarUrl?: string } | null>(null)
  const [githubRepos, setGithubRepos] = useState<GitHubRepoItem[]>([])
  const [autoAddDeployKeyToGh, setAutoAddDeployKeyToGh] = useState(true)
  const [deployKeyTitle, setDeployKeyTitle] = useState("")
  const [deployKeyReadOnly, setDeployKeyReadOnly] = useState(true)
  const [ghDeploySuccess, setGhDeploySuccess] = useState<string | null>(null)
  const [autoCleanNotice, setAutoCleanNotice] = useState<string | null>(null)

  const [syncing, setSyncing] = useState(false)

  const load = useCallback(async (overrideRepo?: string) => {
    setLoading(true)
    setLoadError(null)
    try {
      const activeRepo = overrideRepo !== undefined ? overrideRepo : repoSlug
      const parts = (activeRepo || "").split("/")
      const owner = parts[0]?.trim()
      const repo = parts[1]?.trim()
      const q = owner && repo ? `?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}` : ""

      const [deployRes, actionsRes, ghRes] = await Promise.all([
        fetch(`/api/sites/${siteId}/deploy-key${q}`, { cache: "no-store" }),
        fetch(`/api/sites/${siteId}/actions-key`, { cache: "no-store" }),
        fetch(`/api/settings/github`, { cache: "no-store" }).catch(() => null),
      ])
      if (!deployRes.ok) {
        setLoadError(await parseError(deployRes))
        return
      }
      if (!actionsRes.ok) {
        setLoadError(await parseError(actionsRes))
        return
      }
      const deployData = (await deployRes.json()) as {
        deployKey: (DeployKeyData & { repo?: string | null }) | null
        autoCleared?: boolean
        message?: string
      }
      const actionsData = (await actionsRes.json()) as { actionsKey: ActionsKeyData | null }
      
      setDeployKey(deployData.deployKey)
      setActionsKey(actionsData.actionsKey)

      if (deployData.deployKey?.repo && !repoSlug) {
        setRepoSlug(deployData.deployKey.repo)
      }

      if (deployData.autoCleared) {
        setDeployKey(null)
        setAutoCleanNotice(
          lang === "tr"
            ? "⚠️ Deploy key GitHub deposundan silindiği tespit edildi ve buradan da otomatik olarak kaldırıldı. Dilerseniz hemen yeni bir anahtar oluşturabilirsiniz."
            : "⚠️ Deploy key was detected as removed from GitHub and has been automatically removed here. You can generate a new deploy key anytime."
        )
      }

      if (ghRes && ghRes.ok) {
        const ghData = (await ghRes.json().catch(() => null)) as {
          connected?: boolean
          account?: { username: string; avatarUrl?: string }
        } | null
        if (ghData?.connected && ghData.account) {
          setGhAccount({
            username: ghData.account.username,
            avatarUrl: ghData.account.avatarUrl,
          })
          // Kullanıcının depolarını da getir
          fetch(`/api/settings/github/repos`, { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
              if (d?.repos) setGithubRepos(d.repos)
            })
            .catch(() => null)
        }
      }
    } catch {
      setLoadError(lang === "tr" ? "Sunucuya bağlanılamadı." : "Failed to connect to server.")
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }, [siteId, lang, repoSlug])

  useEffect(() => {
    const initialSlug = guessOwnerRepo(initialRepoUrl ?? "")
    if (initialSlug) setRepoSlug(initialSlug)
    load(initialSlug || undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId])

  // Kullanıcı başka bir sekmede GitHub'dan anahtarı silip panele döndüğünde otomatik senkronize et
  useEffect(() => {
    function handleFocusOrVisible() {
      if (document.visibilityState === "visible") {
        load()
      }
    }
    window.addEventListener("focus", handleFocusOrVisible)
    document.addEventListener("visibilitychange", handleFocusOrVisible)
    return () => {
      window.removeEventListener("focus", handleFocusOrVisible)
      document.removeEventListener("visibilitychange", handleFocusOrVisible)
    }
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

  async function handleCreateDeployKey() {
    setDeployCreating(true)
    setDeployError(null)
    setDeployTestResult(null)
    setGhDeploySuccess(null)
    setAutoCleanNotice(null)
    try {
      const parts = repoSlug.split("/")
      const owner = parts[0]?.trim()
      const repo = parts[1]?.trim()

      const res = await fetch(`/api/sites/${siteId}/deploy-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoAddToGithub: !!ghAccount && autoAddDeployKeyToGh && !!owner && !!repo,
          owner: owner || undefined,
          repo: repo || undefined,
          title: deployKeyTitle.trim() || undefined,
          readOnly: deployKeyReadOnly,
        }),
      })
      if (!res.ok) {
        setDeployError(await parseError(res))
        return
      }
      const data = (await res.json()) as {
        deployKey: DeployKeyData
        githubAdded?: boolean
        githubError?: string
      }
      setDeployKey(data.deployKey)
      if (data.githubAdded) {
        setGhDeploySuccess(
          lang === "tr"
            ? `✅ Deploy Key GitHub deposuna (@${repoSlug || ghAccount?.username}) başarıyla eklendi!`
            : `✅ Deploy Key successfully added to GitHub repository (@${repoSlug || ghAccount?.username})!`
        )
      } else if (data.githubError) {
        setDeployError(
          lang === "tr"
            ? `Deploy Key üretildi fakat GitHub'a eklenemedi: ${data.githubError}`
            : `Deploy Key created but could not be pushed to GitHub: ${data.githubError}`
        )
      }
    } catch {
      setDeployError(lang === "tr" ? "Sunucuya bağlanılamadı." : "Failed to connect to server.")
    } finally {
      setDeployCreating(false)
    }
  }

  async function handleDeleteDeployKey() {
    const confirmMsg = lang === "tr"
      ? "Deploy key hem bu sunucudan hem de bağlı GitHub deposundan silinecektir. Devam edilsin mi?"
      : "Deploy key will be permanently removed from both this server and the connected GitHub repository. Continue?"
    if (!window.confirm(confirmMsg)) return

    setDeployDeleting(true)
    setDeployError(null)
    setGhDeploySuccess(null)
    try {
      const parts = repoSlug.split("/")
      const owner = parts[0]?.trim() || ""
      const repo = parts[1]?.trim() || ""
      const q = owner && repo ? `?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}` : ""
      const res = await fetch(`/api/sites/${siteId}/deploy-key${q}`, { method: "DELETE" })
      if (!res.ok) {
        setDeployError(await parseError(res))
        return
      }
      const data = await res.json().catch(() => ({}))
      setDeployKey(null)
      setDeployTestResult(null)
      setGhDeploySuccess(
        data.githubDeleted
          ? (lang === "tr"
              ? "Deploy key sunucudan ve GitHub deposundan başarıyla kaldırıldı."
              : "Deploy key successfully removed from server and GitHub repository.")
          : (lang === "tr"
              ? "Deploy key sunucudan silindi."
              : "Deploy key deleted from server.")
      )
    } catch {
      setDeployError(lang === "tr" ? "Sunucuya bağlanılamadı." : "Failed to connect to server.")
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
          {lang === "tr" ? "GitHub Erişim Anahtarları" : "GitHub Access Keys"}
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
            {autoCleanNotice && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-300">
                <span className="text-sm">⚠️</span>
                <div>
                  <p className="font-semibold">{lang === "tr" ? "Otomatik Senkronizasyon" : "Automatic Sync"}</p>
                  <p className="mt-0.5 opacity-90">{autoCleanNotice}</p>
                </div>
              </div>
            )}

            {/* --- Depo Seçimi --- */}
            <div className="space-y-2">
              <Label htmlFor="repoSlug" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {lang === "tr" ? "GitHub Deposu (owner/repo)" : "GitHub Repository (owner/repo)"}
              </Label>
              
              {githubRepos.length > 0 ? (
                <div className="space-y-2">
                  <select
                    id="repoSelect"
                    value={repoSlug}
                    onChange={(e) => {
                      const val = e.target.value
                      setRepoSlug(val)
                      if (deployKey && val) {
                        load(val)
                      }
                    }}
                    className="w-full h-10 px-3 rounded-xl text-xs bg-white dark:bg-[#090e1f] border border-slate-200 dark:border-[#16223f] text-slate-900 dark:text-slate-100 font-mono outline-none focus:ring-1 focus:ring-[#c8a87c] dark:focus:ring-[#2a4687]"
                  >
                    <option value="">
                      {lang === "tr"
                        ? `— GitHub Deposu Seçin (${githubRepos.length} depo mevcut) —`
                        : `— Select GitHub Repository (${githubRepos.length} repos found) —`}
                    </option>
                    {githubRepos.map((r) => (
                      <option key={r.id} value={r.fullName}>
                        {r.private ? "🔒 " : "🌐 "} {r.fullName} ({r.defaultBranch})
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center gap-2">
                    <Input
                      id="repoSlug"
                      value={repoSlug}
                      onChange={(e) => setRepoSlug(e.target.value)}
                      placeholder={lang === "tr" ? "veya elle girin: owner/repo" : "or enter manually: owner/repo"}
                      className="h-8 text-xs font-mono bg-white/70 dark:bg-[#090e1f]/70"
                    />
                  </div>
                </div>
              ) : (
                <Input
                  id="repoSlug"
                  value={repoSlug}
                  onChange={(e) => setRepoSlug(e.target.value)}
                  placeholder="owner/repo"
                  className="font-mono text-xs"
                />
              )}

              <p className="text-[11px] text-muted-foreground">
                {lang === "tr"
                  ? "Deploy key'in atanacağı veya klonlanacağı GitHub deposunu seçin veya yazın."
                  : "Select or specify the GitHub repository where the deploy key will be attached."}
              </p>
            </div>

            {/* --- Deploy key --- */}
            <div className="space-y-4 border-t border-border pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <span>Deploy Key (git clone/pull)</span>
                    {deployKey?.githubStatus === "active" && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        {lang === "tr" ? "GitHub'da Aktif" : "Active on GitHub"}
                      </span>
                    )}
                    {deployKey?.githubStatus === "deleted_on_github" && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 inline-flex items-center gap-1">
                        {lang === "tr" ? "GitHub'dan Silinmiş" : "Deleted from GitHub"}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {lang === "tr"
                      ? "Özel (private) repolardan güvenli kod çekebilmek için tek yönlü SSH anahtarı."
                      : "One-way, read-only SSH key to pull code from private repositories securely."}
                  </p>
                </div>
              </div>

              {!deployKey ? (
                <div className="space-y-4 p-4 rounded-xl bg-slate-50/60 dark:bg-[#090e1f]/60 border border-slate-200 dark:border-[#16223f]">
                  {ghAccount ? (
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {lang === "tr" ? "Bağlı GitHub Hesabı" : "Connected GitHub Account"}: @{ghAccount.username}
                          </span>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer select-none text-slate-700 dark:text-slate-300 font-medium">
                          <input
                            type="checkbox"
                            checked={autoAddDeployKeyToGh}
                            onChange={(e) => setAutoAddDeployKeyToGh(e.target.checked)}
                            className="size-3.5 rounded accent-[#580619] dark:accent-[#162752]"
                          />
                          {lang === "tr" ? "GitHub Deposuna Otomatik Ekle" : "Auto-add to GitHub Repository"}
                        </label>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 pt-1 border-t border-slate-200/60 dark:border-[#16223f]/60">
                        <div className="space-y-1">
                          <Label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                            {lang === "tr" ? "Anahtar Başlığı (GitHub'da görünecek)" : "Key Title (Visible on GitHub)"}
                          </Label>
                          <Input
                            value={deployKeyTitle}
                            onChange={(e) => setDeployKeyTitle(e.target.value)}
                            placeholder={`Rudder Cloud Deploy Key`}
                            className="h-8 text-xs bg-white dark:bg-[#060a17]"
                          />
                        </div>
                        <div className="flex flex-col justify-center pt-2">
                          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-700 dark:text-slate-300">
                            <input
                              type="checkbox"
                              checked={deployKeyReadOnly}
                              onChange={(e) => setDeployKeyReadOnly(e.target.checked)}
                              className="size-3.5 rounded accent-[#580619] dark:accent-[#162752]"
                            />
                            <span className="font-semibold">
                              {lang === "tr" ? "Salt-Okunur (Read-Only)" : "Read-Only"}
                            </span>
                          </label>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {lang === "tr"
                              ? "Yalnızca clone ve pull izinleri verir, kod push etmeye izin vermez."
                              : "Grants clone and pull only, disallows pushing code."}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-[#060a17] border border-slate-200 dark:border-[#16223f] text-xs text-slate-500 dark:text-slate-400">
                      <span>
                        {lang === "tr"
                          ? "GitHub hesabınızı bağlayarak anahtarı tek tıkla deponuza gönderebilirsiniz."
                          : "Connect your GitHub account to add keys to your repository with one click."}
                      </span>
                      <a
                        href="/settings"
                        className="text-[#580619] dark:text-blue-300 font-semibold hover:underline shrink-0 ml-2"
                      >
                        {t("nav.settings")} &rarr;
                      </a>
                    </div>
                  )}

                  {ghDeploySuccess && (
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-900">
                      {ghDeploySuccess}
                    </p>
                  )}

                  <div className="flex justify-end pt-1">
                    <Button
                      onClick={handleCreateDeployKey}
                      disabled={deployCreating || (autoAddDeployKeyToGh && !repoSlug.trim())}
                      className="bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white text-xs h-9 px-4 rounded-xl shadow-xs"
                    >
                      {deployCreating && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                      <KeyRound className="size-3.5 mr-1.5" />
                      {autoAddDeployKeyToGh && ghAccount
                        ? (lang === "tr" ? "Deploy Key Oluştur ve GitHub'a Gönder" : "Create Deploy Key & Push to GitHub")
                        : (lang === "tr" ? "Deploy Key Oluştur" : "Create Deploy Key")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <dl className="divide-y divide-border rounded-lg border border-border">
                    <div className="flex items-center justify-between px-3 py-2 text-sm">
                      <dt className="text-muted-foreground">{lang === "tr" ? "Anahtar adı" : "Key name"}</dt>
                      <dd className="font-mono text-xs text-foreground">{deployKey.keyName}</dd>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2 text-sm">
                      <dt className="text-muted-foreground">{t("settings.github.fingerprintLabel")}</dt>
                      <dd className="font-mono text-xs text-foreground">
                        {deployKey.fingerprint || "—"}
                      </dd>
                    </div>
                  </dl>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold">Public key</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copy("deployPub", deployKey.publicKey ?? "")}
                        className="h-7 text-xs"
                      >
                        <Copy className="size-3.5 mr-1" />
                        {copiedField === "deployPub" ? t("common.copied") : t("common.copy")}
                      </Button>
                    </div>
                    <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-[11px] font-mono">
                      {deployKey.publicKey}
                    </pre>
                  </div>

                  {suggestedCloneUrl && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold">
                          {lang === "tr" ? "Önerilen Repo URL (alias ile)" : "Recommended Repo URL (with alias)"}
                        </Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copy("cloneUrl", suggestedCloneUrl)}
                          className="h-7 text-xs"
                        >
                          <Copy className="size-3.5 mr-1" />
                          {copiedField === "cloneUrl" ? t("common.copied") : t("common.copy")}
                        </Button>
                      </div>
                      <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-[11px] font-mono">
                        {suggestedCloneUrl}
                      </pre>
                      <p className="text-[11px] text-muted-foreground">
                        {lang === "tr"
                          ? "Bu anahtarla çekiş yapmak için yukarıdaki \"Git & Dağıtım\" kartındaki Repo URL alanına bu adresi yapıştırın."
                          : "Paste this URL into the Repo URL field under the Git tab to pull using this deploy key."}
                      </p>
                    </div>
                  )}

                  {ghDeploySuccess && (
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-900">
                      {ghDeploySuccess}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button variant="outline" size="sm" onClick={handleTestDeployKey} disabled={deployTesting} className="h-8 text-xs">
                      {deployTesting && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
                      {lang === "tr" ? "Bağlantıyı Test Et" : "Test Connection"}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSyncing(true)
                        load().then(() => {
                          setGhDeploySuccess(
                            lang === "tr"
                              ? "GitHub senkronizasyonu tamamlandı."
                              : "GitHub synchronization completed."
                          )
                        })
                      }}
                      disabled={syncing || deployTesting}
                      className="h-8 text-xs"
                    >
                      <RefreshCw className={cn("size-3.5 mr-1.5 text-[#c8a87c] dark:text-blue-300", syncing && "animate-spin")} />
                      {lang === "tr" ? "GitHub ile Senkronize Et" : "Sync with GitHub"}
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCreateDeployKey}
                      disabled={deployCreating}
                      className="h-8 text-xs border-[#c8a87c]/60 dark:border-[#2a4687]/60 hover:bg-[#580619]/5 dark:hover:bg-[#162752]/20"
                    >
                      {deployCreating ? (
                        <Loader2 className="size-3.5 animate-spin mr-1.5" />
                      ) : (
                        <KeyRound className="size-3.5 mr-1.5 text-[#c8a87c] dark:text-blue-300" />
                      )}
                      {lang === "tr" ? "Yeniden Üret ve GitHub'a Gönder" : "Regenerate & Push to GitHub"}
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDeleteDeployKey}
                      disabled={deployDeleting}
                      className="h-8 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 ml-auto"
                    >
                      {deployDeleting ? (
                        <Loader2 className="size-3.5 animate-spin mr-1" />
                      ) : (
                        <Trash2 className="size-3.5 mr-1" />
                      )}
                      {lang === "tr" ? "Sil (GitHub'dan da Kaldır)" : "Delete (Also from GitHub)"}
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
                          ? (lang === "tr" ? "Bağlantı doğrulandı." : "Connection verified.")
                          : (lang === "tr" ? "Kesin sonuç alınamadı — çıktıyı incele:" : "Could not verify — check output:")}
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
                  {lang === "tr" ? "GitHub Actions Erişimi (SSH deploy)" : "GitHub Actions Access (SSH deploy)"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {lang === "tr"
                    ? "GitHub Actions'ın bu sunucuya SSH ile bağlanıp deploy komutlarını çalıştırabilmesi için — public key sunucuda panel kullanıcısının kendi authorized_keys dosyasına eklenir."
                    : "For GitHub Actions to SSH into this server and run deploy scripts — public key is added to the panel user's authorized_keys file on the server."}
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
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
