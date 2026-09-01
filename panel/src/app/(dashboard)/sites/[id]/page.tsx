"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, FolderOpen, Loader2, Play, RotateCw, Square, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { SiteAccessCard } from "@/components/site-access-card"
import { SiteBackupCard } from "@/components/site-backup-card"
import { SiteGithubKeysCard } from "@/components/site-github-keys-card"
import { StatMeter } from "@/components/stat-meter"
import { SITE_TYPES, type Site } from "@/lib/mock-data"
import { apiSiteToUiSite, type ApiSite } from "@/lib/site-adapter"

const STATUS_LABEL: Record<Site["status"], string> = {
  active: "Aktif",
  running: "Çalışıyor",
  stopped: "Durduruldu",
  provisioning: "Kuruluyor",
  error: "Hata",
}

const STATUS_BADGE_CLASS: Record<Site["status"], string> = {
  active: "border-success/40 text-success",
  running: "border-success/40 text-success",
  stopped: "border-muted-foreground/40 text-muted-foreground",
  provisioning: "border-warning/40 text-warning",
  error: "border-destructive/40 text-destructive",
}

type ServiceAction = "start" | "stop" | "restart"

export default function SiteDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()

  const [site, setSite] = useState<Site | null>(null)
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [actionPending, setActionPending] = useState<ServiceAction | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [logs, setLogs] = useState<string>("")
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState<string | null>(null)

  const [gitForm, setGitForm] = useState<{
    repoUrl: string
    gitBranch: string
    autoPullEnabled: boolean
    autoPullIntervalSeconds: number
    processManager: ApiSite["processManager"]
    customRestartCommand: string
  }>({
    repoUrl: "",
    gitBranch: "main",
    autoPullEnabled: false,
    autoPullIntervalSeconds: 15,
    processManager: "SYSTEMD",
    customRestartCommand: "",
  })
  const [gitLastPull, setGitLastPull] = useState<{
    at: string | null
    ok: boolean | null
    error: string | null
  }>({ at: null, ok: null, error: null })
  const [gitSaving, setGitSaving] = useState(false)
  const [gitSaveError, setGitSaveError] = useState<string | null>(null)
  const [gitSaveOk, setGitSaveOk] = useState(false)
  const [gitPulling, setGitPulling] = useState(false)
  const [gitPullError, setGitPullError] = useState<string | null>(null)
  const [gitPullMessage, setGitPullMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch(`/api/sites/${params.id}`, { cache: "no-store" })
        if (res.status === 404) {
          if (!cancelled) setNotFound(true)
          return
        }
        if (!res.ok) throw new Error("failed")
        const data = (await res.json()) as ApiSite
        if (!cancelled) {
          setSite(apiSiteToUiSite(data))
          setConfig((data.config ?? {}) as Record<string, unknown>)
          setGitForm({
            repoUrl: data.repoUrl ?? "",
            gitBranch: data.gitBranch || "main",
            autoPullEnabled: data.autoPullEnabled,
            autoPullIntervalSeconds: data.autoPullIntervalSeconds,
            processManager: data.processManager,
            customRestartCommand: data.customRestartCommand ?? "",
          })
          setGitLastPull({ at: data.lastPullAt, ok: data.lastPullOk, error: data.lastPullError })
        }
      } catch {
        if (!cancelled) setNotFound(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [params.id])

  const isManaged = site ? (SITE_TYPES.find((t) => t.type === site.type)?.managed ?? false) : false

  const loadLogs = useCallback(async () => {
    if (!site || !isManaged) return
    setLogsLoading(true)
    setLogsError(null)
    try {
      const res = await fetch(`/api/sites/${site.id}/logs?lines=200`, { cache: "no-store" })
      const data = (await res.json().catch(() => null)) as { logs?: string; error?: string } | null
      if (!res.ok || !data) {
        setLogsError(data?.error ?? "Loglar alınamadı.")
        return
      }
      setLogs(data.logs ?? "")
    } catch {
      setLogsError("Sunucuya bağlanılamadı.")
    } finally {
      setLogsLoading(false)
    }
  }, [site, isManaged])

  useEffect(() => {
    if (!site || !isManaged) return
    // setTimeout ile bir sonraki makrotaşka erteleniyor: loadLogs() ilk iş
    // olarak setLogsLoading(true) çağırıyor, bunu efekt gövdesinin senkron
    // kısmından çıkarmak "setState-in-effect" kuralını tetiklememek için
    // gerekli (bkz. react-hooks/set-state-in-effect).
    const timer = setTimeout(() => {
      loadLogs()
    }, 0)
    return () => clearTimeout(timer)
    // Yalnızca site ilk yüklendiğinde / id değiştiğinde çalışsın — loadLogs'un
    // kendisi her render'da yeniden oluşuyor (useCallback'e rağmen site
    // referansı değiştiği için), o yüzden buraya bağımlılık olarak eklenmiyor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site?.id, isManaged])

  async function handleServiceAction(action: ServiceAction) {
    if (!site) return
    setActionPending(action)
    setActionError(null)
    try {
      const res = await fetch(`/api/sites/${site.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const data = (await res.json().catch(() => null)) as (ApiSite & { error?: string }) | null
      if (!res.ok || !data || typeof data.id !== "string") {
        setActionError(data?.error ?? "Eylem gerçekleştirilemedi.")
        return
      }
      setSite(apiSiteToUiSite(data))
      setConfig((data.config ?? {}) as Record<string, unknown>)
      loadLogs()
    } catch {
      setActionError("Sunucuya bağlanılamadı.")
    } finally {
      setActionPending(null)
    }
  }

  async function handleGitSave() {
    if (!site) return
    setGitSaving(true)
    setGitSaveError(null)
    setGitSaveOk(false)
    try {
      const res = await fetch(`/api/sites/${site.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl: gitForm.repoUrl.trim() === "" ? null : gitForm.repoUrl.trim(),
          gitBranch: gitForm.gitBranch.trim() || "main",
          autoPullEnabled: gitForm.autoPullEnabled,
          autoPullIntervalSeconds: gitForm.autoPullIntervalSeconds,
          processManager: gitForm.processManager,
          customRestartCommand:
            gitForm.processManager === "CUSTOM_SCRIPT" && gitForm.customRestartCommand.trim() !== ""
              ? gitForm.customRestartCommand.trim()
              : null,
        }),
      })
      const data = (await res.json().catch(() => null)) as (ApiSite & { error?: string }) | null
      if (!res.ok || !data) {
        setGitSaveError(data?.error ?? "Kaydedilemedi.")
        return
      }
      setGitForm({
        repoUrl: data.repoUrl ?? "",
        gitBranch: data.gitBranch || "main",
        autoPullEnabled: data.autoPullEnabled,
        autoPullIntervalSeconds: data.autoPullIntervalSeconds,
        processManager: data.processManager,
        customRestartCommand: data.customRestartCommand ?? "",
      })
      setGitSaveOk(true)
    } catch {
      setGitSaveError("Sunucuya bağlanılamadı.")
    } finally {
      setGitSaving(false)
    }
  }

  async function handleGitPull() {
    if (!site) return
    setGitPulling(true)
    setGitPullError(null)
    setGitPullMessage(null)
    try {
      const res = await fetch(`/api/sites/${site.id}/git-pull`, { method: "POST" })
      const data = (await res.json().catch(() => null)) as
        | (Partial<ApiSite> & {
            pullChanged?: boolean
            restartError?: string | null
            error?: string
            site?: Partial<ApiSite>
          })
        | null
      if (!data) {
        setGitPullError("Sunucuya bağlanılamadı.")
        return
      }
      const statusSource = res.ok ? data : (data.site ?? data)
      setGitLastPull({
        at: statusSource.lastPullAt ?? null,
        ok: statusSource.lastPullOk ?? false,
        error: statusSource.lastPullError ?? (res.ok ? null : (data.error ?? null)),
      })
      if (!res.ok) {
        setGitPullError(data.error ?? "git pull başarısız oldu.")
      } else if (data.restartError) {
        setGitPullError(`Pull başarılı ama yeniden başlatma başarısız: ${data.restartError}`)
      } else {
        setGitPullMessage(
          data.pullChanged ? "Yeni commit çekildi, proje yeniden başlatıldı." : "Zaten güncel, değişiklik yok."
        )
      }
    } catch {
      setGitPullError("Sunucuya bağlanılamadı.")
    } finally {
      setGitPulling(false)
    }
  }

  async function handleDelete() {
    if (!site) return
    if (!window.confirm(`${site.domain} silinsin mi? Bu işlem geri alınamaz.`)) return

    setDeleting(true)
    try {
      await fetch(`/api/sites/${site.id}`, { method: "DELETE" })
      router.push("/")
      router.refresh()
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  if (notFound || !site) {
    return (
      <div className="space-y-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Anasayfaya dön
        </Link>
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Site bulunamadı.
          </CardContent>
        </Card>
      </div>
    )
  }

  const typeInfo = SITE_TYPES.find((t) => t.type === site.type)!
  const isRunning = site.status === "running"

  const configRows = [
    { label: "Alan adı", value: site.domain },
    ...(isManaged
      ? [{ label: "Port", value: String(config.port ?? "-") }]
      : []),
    ...(isManaged
      ? [{ label: "Başlatma komutu", value: String(config.startCommand ?? "-") }]
      : []),
    {
      label: "Site kök dizini",
      value: String(config.siteRoot ?? `/var/www/${site.domain}`),
    },
    {
      label: "Linux kullanıcısı",
      value: String(config.linuxUser ?? site.domain.split(".")[0]),
    },
    {
      label: "SSL",
      value: config.sslEnabled === false ? "Pasif" : "Aktif (Let's Encrypt)",
    },
    ...(isManaged
      ? [
          {
            label: "systemd birimi",
            value: `site-${site.domain.replace(/\./g, "-")}.service`,
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Anasayfaya dön
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-lg bg-muted font-mono text-xs font-semibold text-foreground">
            {typeInfo.abbr}
          </span>
          <div>
            <h1 className="font-mono text-xl font-semibold text-foreground">
              {site.domain}
            </h1>
            <p className="text-sm text-muted-foreground">{typeInfo.label}</p>
          </div>
          <Badge variant="outline" className={STATUS_BADGE_CLASS[site.status]}>
            {STATUS_LABEL[site.status]}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {site.type !== "proxy" && (
            <Button variant="outline" asChild>
              <Link href={`/sites/${site.id}/files`}>
                <FolderOpen className="size-4" />
                Dosyalar
              </Link>
            </Button>
          )}
          {isManaged && (
            <>
              <Button
                variant="outline"
                disabled={isRunning || actionPending !== null}
                onClick={() => handleServiceAction("start")}
              >
                {actionPending === "start" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                Başlat
              </Button>
              <Button
                variant="outline"
                disabled={!isRunning || actionPending !== null}
                onClick={() => handleServiceAction("stop")}
              >
                {actionPending === "stop" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Square className="size-4" />
                )}
                Durdur
              </Button>
              <Button
                variant="outline"
                disabled={actionPending !== null}
                onClick={() => handleServiceAction("restart")}
              >
                {actionPending === "restart" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RotateCw className="size-4" />
                )}
                Yeniden Başlat
              </Button>
            </>
          )}
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Sil
          </Button>
        </div>
      </div>

      {actionError && (
        <p className="text-sm text-destructive" role="alert">
          {actionError}
        </p>
      )}

      {isManaged ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="pt-6">
                <StatMeter label="CPU" value={site.cpu ?? 0} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <StatMeter label="RAM" value={site.ram ?? 0} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Yapılandırma</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-border">
                {configRows.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between py-2.5 text-sm"
                  >
                    <dt className="text-muted-foreground">{item.label}</dt>
                    <dd className="font-mono text-foreground">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Git &amp; Dağıtım</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="repoUrl">Repo adresi</Label>
                  <Input
                    id="repoUrl"
                    placeholder="git@github.com:owner/repo.git"
                    value={gitForm.repoUrl}
                    onChange={(e) => setGitForm((f) => ({ ...f, repoUrl: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gitBranch">Branch</Label>
                  <Input
                    id="gitBranch"
                    value={gitForm.gitBranch}
                    onChange={(e) => setGitForm((f) => ({ ...f, gitBranch: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="space-y-0.5 pr-4">
                  <Label htmlFor="autoPull">Otomatik pull</Label>
                  <p className="text-xs text-muted-foreground">
                    Etkinleştirilirse panel bu repoyu düzenli aralıklarla kontrol edip yeni commit
                    varsa çeker ve projeyi yeniden başlatır.
                  </p>
                </div>
                <Switch
                  id="autoPull"
                  checked={gitForm.autoPullEnabled}
                  onCheckedChange={(checked) =>
                    setGitForm((f) => ({ ...f, autoPullEnabled: checked }))
                  }
                />
              </div>

              {gitForm.autoPullEnabled && (
                <div className="space-y-1.5 sm:w-56">
                  <Label htmlFor="autoPullInterval">Kontrol aralığı (saniye)</Label>
                  <Input
                    id="autoPullInterval"
                    type="number"
                    min={5}
                    max={86400}
                    value={gitForm.autoPullIntervalSeconds}
                    onChange={(e) =>
                      setGitForm((f) => ({
                        ...f,
                        autoPullIntervalSeconds: Number(e.target.value) || 15,
                      }))
                    }
                  />
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="processManager">Yeniden başlatma yöntemi</Label>
                  <select
                    id="processManager"
                    value={gitForm.processManager}
                    onChange={(e) =>
                      setGitForm((f) => ({
                        ...f,
                        processManager: e.target.value as ApiSite["processManager"],
                      }))
                    }
                    className="border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                  >
                    <option value="SYSTEMD">systemd (panel yönetiyor — varsayılan)</option>
                    <option value="DOCKER_COMPOSE">Docker Compose (docker compose restart)</option>
                    <option value="PM2">PM2 (pm2 restart)</option>
                    <option value="CUSTOM_SCRIPT">Özel script</option>
                  </select>
                </div>
                {gitForm.processManager === "CUSTOM_SCRIPT" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="customRestartCommand">Özel restart betiği (mutlak yol)</Label>
                    <Input
                      id="customRestartCommand"
                      placeholder={`/var/www/${site.domain}/deploy/restart.sh`}
                      value={gitForm.customRestartCommand}
                      onChange={(e) =>
                        setGitForm((f) => ({ ...f, customRestartCommand: e.target.value }))
                      }
                    />
                  </div>
                )}
              </div>

              {gitSaveError && <p className="text-sm text-destructive">{gitSaveError}</p>}

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={handleGitSave} disabled={gitSaving}>
                  {gitSaving && <Loader2 className="size-4 animate-spin" />}
                  Kaydet
                </Button>
                <Button
                  variant="outline"
                  onClick={handleGitPull}
                  disabled={gitPulling || !gitForm.repoUrl.trim()}
                >
                  {gitPulling ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RotateCw className="size-4" />
                  )}
                  Şimdi Pull Et
                </Button>
                {gitSaveOk && <span className="text-xs text-success">Kaydedildi.</span>}
              </div>

              {(gitPullMessage || gitPullError) && (
                <p className={`text-sm ${gitPullError ? "text-destructive" : "text-success"}`}>
                  {gitPullError ?? gitPullMessage}
                </p>
              )}

              <dl className="divide-y divide-border border-t border-border pt-2">
                <div className="flex items-center justify-between py-2 text-sm">
                  <dt className="text-muted-foreground">Son pull</dt>
                  <dd className="font-mono text-foreground">
                    {gitLastPull.at
                      ? new Date(gitLastPull.at).toLocaleString("tr-TR")
                      : "Henüz yapılmadı"}
                  </dd>
                </div>
                {gitLastPull.at && (
                  <div className="flex items-center justify-between py-2 text-sm">
                    <dt className="text-muted-foreground">Durum</dt>
                    <dd className={gitLastPull.ok ? "text-success" : "text-destructive"}>
                      {gitLastPull.ok ? "Başarılı" : (gitLastPull.error ?? "Başarısız")}
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Son Kayıtlar</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => loadLogs()} disabled={logsLoading}>
                  {logsLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
                  Yenile
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {logsError ? (
                <p className="text-sm text-destructive">{logsError}</p>
              ) : (
                <pre className="max-h-64 overflow-auto rounded-lg bg-background p-4 font-mono text-xs text-muted-foreground">
                  {logsLoading && !logs
                    ? "Yükleniyor…"
                    : logs.trim()
                      ? logs
                      : "Henüz kayıt yok."}
                </pre>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Yapılandırma</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-border">
                {configRows.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between py-2.5 text-sm"
                  >
                    <dt className="text-muted-foreground">{item.label}</dt>
                    <dd className="font-mono text-foreground">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Bu site türü doğrudan Nginx tarafından sunulur; panel tarafından
              yönetilen bir süreç bulunmaz.
            </CardContent>
          </Card>
        </>
      )}

      {site.type !== "proxy" && <SiteBackupCard siteId={site.id} />}
      {site.type !== "proxy" && (
        <SiteGithubKeysCard siteId={site.id} initialRepoUrl={gitForm.repoUrl} />
      )}
      <SiteAccessCard siteId={site.id} />
    </div>
  )
}
