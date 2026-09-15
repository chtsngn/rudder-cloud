"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, GitBranch, Loader2, Rocket, RotateCw, Save, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CustomSelect } from "@/components/ui/custom-select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { SiteDeployKeyCard } from "@/components/site-deploy-key-card"
import { useTranslation } from "@/components/language-provider"
import { PROCESS_MANAGER_LABELS, type ApiSite, type DbProcessManager } from "@/lib/site-adapter"
import { cn } from "@/lib/utils"

interface InstalledRepoOption {
  fullName: string
  private: boolean
  defaultBranch: string
  accountLogin: string
  installationId: string
}

interface DeployResponse extends Partial<ApiSite> {
  error?: string
  site?: ApiSite
  pullChanged?: boolean
  pullCommit?: string | null
  deployed?: boolean
  restartError?: string | null
  deployOutput?: string
}

const DEPLOY_COMMAND_PLACEHOLDER: Record<string, string> = {
  NODEJS: "npm ci && npm run build",
  PYTHON: "pip install -r requirements.txt",
  REVERSE_PROXY: "örn. npm ci && npm run build",
  DOCKER: "(compose build ediyor — genelde boş)",
}

function isSshUrl(url: string): boolean {
  return /^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+:/.test(url) || url.startsWith("ssh://")
}

/**
 * Git & Dağıtım (2026-09-15): depo kaynağı (GitHub App VEYA manuel adres +
 * SSH deploy key), deploy hattı ayarları (deploy komutu, süreç yöneticisi,
 * PM2 adı, özel betik), otomatik pull, "Pull" / "Deploy Et" ve son pull/deploy
 * durumu + çıktı. Yürütme alanları yalnızca SUPER_ADMIN'e açık (API de
 * zorlar — bkz. PATCH /api/sites/[id]).
 */
export function SiteGitCard({
  site,
  isSuperAdmin,
  onSiteUpdate,
}: {
  site: ApiSite
  isSuperAdmin: boolean
  onSiteUpdate: (site: ApiSite) => void
}) {
  const { t, lang } = useTranslation()
  const hasSystemdOption = site.type === "NODEJS" || site.type === "PYTHON"

  const [installedRepos, setInstalledRepos] = useState<InstalledRepoOption[]>([])
  const [installedReposLoaded, setInstalledReposLoaded] = useState(false)
  const [selectedRepoFullName, setSelectedRepoFullName] = useState(site.githubRepoFullName ?? "")
  const [connectingRepo, setConnectingRepo] = useState(false)
  const [disconnectingRepo, setDisconnectingRepo] = useState(false)
  const [connectRepoError, setConnectRepoError] = useState<string | null>(null)

  const [form, setForm] = useState({
    repoUrl: site.repoUrl ?? "",
    gitBranch: site.gitBranch || "main",
    autoPullEnabled: site.autoPullEnabled,
    autoPullIntervalSeconds: site.autoPullIntervalSeconds,
    processManager: site.processManager as DbProcessManager,
    customRestartCommand: site.customRestartCommand ?? "",
    deployCommand: site.deployCommand ?? "",
    pm2ProcessName: site.pm2ProcessName ?? "",
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)

  const [running, setRunning] = useState<"pull" | "deploy" | null>(null)
  const [result, setResult] = useState<{ ok: boolean; text: string; output?: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/settings/github/repos", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { repos?: InstalledRepoOption[] } | null) => {
        if (!cancelled) {
          if (data?.repos) setInstalledRepos(data.repos)
          setInstalledReposLoaded(true)
        }
      })
      .catch(() => {
        if (!cancelled) setInstalledReposLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function applyDeployResponse(res: Response, data: DeployResponse | null, successText: string) {
    if (!data) {
      setResult({ ok: false, text: lang === "en" ? "Could not reach the server." : "Sunucuya bağlanılamadı." })
      return
    }
    if (!res.ok) {
      if (data.site) onSiteUpdate(data.site)
      setResult({ ok: false, text: data.error ?? "İşlem başarısız oldu.", output: data.deployOutput })
      return
    }
    onSiteUpdate(data as ApiSite)
    setResult({
      ok: !data.restartError,
      text: data.restartError
        ? (lang === "en" ? `Pulled, but restart failed: ${data.restartError}` : `Çekildi ama yeniden başlatma başarısız: ${data.restartError}`)
        : successText,
      output: data.deployOutput,
    })
  }

  async function handleConnectRepo() {
    const repo = installedRepos.find((r) => r.fullName === selectedRepoFullName)
    if (!repo) return
    if (site.githubRepoFullName && repo.fullName !== site.githubRepoFullName) {
      const msg =
        lang === "en"
          ? `Switch from @${site.githubRepoFullName} to @${repo.fullName}? The site's current files will be DELETED and replaced with a fresh clone.`
          : `@${site.githubRepoFullName} yerine @${repo.fullName} bağlansın mı? Sitenin mevcut dosyaları SİLİNİP yeni reponun taze bir klonuyla değiştirilecek.`
      if (!window.confirm(msg)) return
    }
    setConnectingRepo(true)
    setConnectRepoError(null)
    setResult(null)
    try {
      const res = await fetch(`/api/sites/${site.id}/github-connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installationId: repo.installationId, repoFullName: repo.fullName, branch: repo.defaultBranch }),
      })
      const data = (await res.json().catch(() => null)) as DeployResponse | null
      if (!res.ok) {
        if (data?.site) onSiteUpdate(data.site)
        setConnectRepoError(data?.error ?? "Depo bağlanamadı.")
        if (data?.deployOutput) setResult({ ok: false, text: data.error ?? "", output: data.deployOutput })
        return
      }
      setForm((f) => ({ ...f, repoUrl: `https://github.com/${repo.fullName}.git`, gitBranch: repo.defaultBranch }))
      applyDeployResponse(res, data, lang === "en" ? "Repository connected and deployed into the site root." : "Depo bağlandı ve kök dizine deploy edildi.")
    } catch {
      setConnectRepoError(lang === "en" ? "Could not reach the server." : "Sunucuya bağlanılamadı.")
    } finally {
      setConnectingRepo(false)
    }
  }

  async function handleDisconnectRepo() {
    if (!window.confirm(lang === "en" ? "Disconnect this repository? Cloned files stay in place." : "Bu depo bağlantısı kaldırılsın mı? Klonlanmış dosyalar yerinde kalır.")) return
    setDisconnectingRepo(true)
    setConnectRepoError(null)
    try {
      const res = await fetch(`/api/sites/${site.id}/github-connect`, { method: "DELETE" })
      const data = (await res.json().catch(() => null)) as (ApiSite & { error?: string }) | null
      if (!res.ok || !data) {
        setConnectRepoError(data?.error ?? "Bağlantı kaldırılamadı.")
        return
      }
      onSiteUpdate(data)
      setSelectedRepoFullName("")
    } catch {
      setConnectRepoError(lang === "en" ? "Could not reach the server." : "Sunucuya bağlanılamadı.")
    } finally {
      setDisconnectingRepo(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    setSaveOk(false)
    try {
      const payload: Record<string, unknown> = {
        gitBranch: form.gitBranch.trim() || "main",
        autoPullEnabled: form.autoPullEnabled,
        autoPullIntervalSeconds: form.autoPullIntervalSeconds,
      }
      // GitHub App bağlıyken repoUrl salt-okunur (connect route yönetir).
      if (!site.githubRepoFullName) payload.repoUrl = form.repoUrl.trim() === "" ? null : form.repoUrl.trim()
      if (isSuperAdmin) {
        payload.processManager = form.processManager
        payload.customRestartCommand = form.processManager === "CUSTOM_SCRIPT" ? form.customRestartCommand.trim() || null : null
        payload.deployCommand = form.deployCommand.trim() || null
        payload.pm2ProcessName = form.processManager === "PM2" ? form.pm2ProcessName.trim() || null : null
      }
      const res = await fetch(`/api/sites/${site.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = (await res.json().catch(() => null)) as (ApiSite & { error?: string }) | null
      if (!res.ok || !data) {
        setSaveError(data?.error ?? "Kaydedilemedi.")
        return
      }
      onSiteUpdate(data)
      setForm({
        repoUrl: data.repoUrl ?? "",
        gitBranch: data.gitBranch || "main",
        autoPullEnabled: data.autoPullEnabled,
        autoPullIntervalSeconds: data.autoPullIntervalSeconds,
        processManager: data.processManager,
        customRestartCommand: data.customRestartCommand ?? "",
        deployCommand: data.deployCommand ?? "",
        pm2ProcessName: data.pm2ProcessName ?? "",
      })
      setSaveOk(true)
    } catch {
      setSaveError(lang === "en" ? "Could not reach the server." : "Sunucuya bağlanılamadı.")
    } finally {
      setSaving(false)
    }
  }

  async function handlePull() {
    setRunning("pull")
    setResult(null)
    try {
      const res = await fetch(`/api/sites/${site.id}/git-pull`, { method: "POST" })
      const data = (await res.json().catch(() => null)) as DeployResponse | null
      applyDeployResponse(
        res,
        data,
        data?.pullChanged
          ? (lang === "en" ? "New commit pulled and deployed." : "Yeni commit çekildi ve deploy edildi.")
          : (lang === "en" ? "Already up to date — nothing to do." : "Zaten güncel — yapılacak bir şey yok.")
      )
    } catch {
      setResult({ ok: false, text: lang === "en" ? "Could not reach the server." : "Sunucuya bağlanılamadı." })
    } finally {
      setRunning(null)
    }
  }

  async function handleDeploy() {
    setRunning("deploy")
    setResult(null)
    try {
      const res = await fetch(`/api/sites/${site.id}/deploy`, { method: "POST" })
      const data = (await res.json().catch(() => null)) as DeployResponse | null
      applyDeployResponse(res, data, lang === "en" ? "Deployed and restarted." : "Deploy edildi ve yeniden başlatıldı.")
    } catch {
      setResult({ ok: false, text: lang === "en" ? "Could not reach the server." : "Sunucuya bağlanılamadı." })
    } finally {
      setRunning(null)
    }
  }

  const processOptions: Array<{ value: DbProcessManager; label: string }> = (
    ["NONE", ...(hasSystemdOption ? (["SYSTEMD"] as DbProcessManager[]) : []), "DOCKER_COMPOSE", "PM2", "CUSTOM_SCRIPT"] as DbProcessManager[]
  ).map((value) => ({ value, label: PROCESS_MANAGER_LABELS[value][lang === "en" ? "en" : "tr"] }))

  const manualSsh = !site.githubRepoFullName && isSshUrl(form.repoUrl.trim())
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(lang === "en" ? "en-US" : "tr-TR") : t("sites.detail.gitPullNever"))
  const inputCls = "font-mono text-xs h-10 rounded-xl bg-card border border-border text-foreground"

  return (
    <div className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-xs space-y-6">
      <div className="border-b border-border pb-4">
        <h3 className="font-heading font-bold text-foreground text-base">{t("sites.detail.gitRepoTitle")}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {lang === "en"
            ? "Deploy pipeline: pull → deploy command → restart. Connect a GitHub App repository or enter any git address (GitLab, Bitbucket, self-hosted…)."
            : "Deploy hattı: pull → deploy komutu → yeniden başlatma. Bir GitHub App deposu bağlayın ya da herhangi bir git adresi girin (GitLab, Bitbucket, self-hosted…)."}
        </p>
      </div>

      {/* ── Depo kaynağı ── */}
      <div className="space-y-4">
        {!installedReposLoaded ? (
          <div className="flex items-center gap-2 p-4 rounded-xl border border-border bg-muted/30 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {lang === "en" ? "Loading GitHub App repositories…" : "GitHub App depoları yükleniyor…"}
          </div>
        ) : installedRepos.length > 0 ? (
          <div className="space-y-2 p-4 rounded-xl border border-border bg-muted/30">
            <Label className="text-xs font-bold text-foreground/90">{lang === "en" ? "GitHub App repository" : "GitHub App deposu"}</Label>
            <p className="text-[11px] text-muted-foreground">
              {lang === "en" ? "Only repositories your GitHub App installation is authorized for are listed." : "Yalnızca GitHub App kurulumunuzun izin verdiği depolar listelenir."}
            </p>
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <CustomSelect
                value={selectedRepoFullName}
                onChange={(val) => setSelectedRepoFullName(val)}
                options={installedRepos.map((r) => ({ value: r.fullName, label: `${r.private ? "🔒" : "🌐"} ${r.fullName} (${r.defaultBranch})` }))}
                className="w-full sm:flex-1"
              />
              <Button
                onClick={handleConnectRepo}
                disabled={!selectedRepoFullName || connectingRepo || selectedRepoFullName === site.githubRepoFullName}
                className="h-10 px-5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold cursor-pointer shrink-0"
              >
                {connectingRepo && <Loader2 className="size-3.5 animate-spin mr-1" />}
                {site.githubRepoFullName ? (lang === "en" ? "Switch Repository" : "Depoyu Değiştir") : (lang === "en" ? "Connect & Deploy" : "Bağla ve Deploy Et")}
              </Button>
            </div>
            {site.githubRepoFullName && (
              <div className="flex items-center justify-between gap-3 pt-1">
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <GitBranch className="size-3.5 shrink-0" />
                  {lang === "en" ? "Connected" : "Bağlı"}: @{site.githubRepoFullName} ({site.gitBranch})
                </p>
                <Button variant="ghost" size="sm" disabled={disconnectingRepo} onClick={handleDisconnectRepo} className="h-7 text-[11px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0">
                  {disconnectingRepo ? <Loader2 className="size-3 animate-spin mr-1" /> : <Trash2 className="size-3 mr-1" />}
                  {lang === "en" ? "Disconnect" : "Bağlantıyı Kaldır"}
                </Button>
              </div>
            )}
            <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-1.5 pt-1">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
              {lang === "en" ? "Switching repositories deletes the site's current files and clones the new repository fresh." : "Depoyu değiştirmek, sitenin mevcut dosyalarını siler ve yeni depoyu sıfırdan klonlar."}
            </p>
            {connectRepoError && <p className="text-xs text-destructive">{connectRepoError}</p>}
          </div>
        ) : (
          <div className="p-3.5 rounded-xl border border-border bg-muted/30 text-[11px] text-muted-foreground">
            {lang === "en" ? "No GitHub App installed — " : "Kurulu bir GitHub App yok — "}
            <Link href="/settings" className="text-primary font-semibold hover:underline">
              {lang === "en" ? "connect one in Settings" : "Ayarlar'dan bağlayın"}
            </Link>
            {lang === "en" ? " to pick repositories here, or enter a git address below." : ", ya da aşağıya bir git adresi girin."}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <div className="space-y-1.5">
            <Label htmlFor="repoUrl" className="text-xs font-bold text-foreground/90">
              {lang === "en" ? "Repository address (manual)" : "Depo adresi (manuel)"}
            </Label>
            <Input
              id="repoUrl"
              placeholder="git@gitlab.com:owner/repo.git  |  https://github.com/owner/repo.git"
              value={form.repoUrl}
              disabled={!!site.githubRepoFullName}
              onChange={(e) => setForm((f) => ({ ...f, repoUrl: e.target.value }))}
              className={inputCls}
            />
            <p className="text-[11px] text-muted-foreground">
              {site.githubRepoFullName
                ? (lang === "en" ? "Managed by the GitHub App connection above." : "Yukarıdaki GitHub App bağlantısı yönetiyor.")
                : (lang === "en" ? "SSH addresses use a per-site deploy key (generated below); public HTTPS addresses need nothing." : "SSH adresleri site başına deploy key kullanır (aşağıda üretilir); public HTTPS adresleri için bir şey gerekmez.")}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gitBranch" className="text-xs font-bold text-foreground/90">Branch</Label>
            <Input id="gitBranch" value={form.gitBranch} onChange={(e) => setForm((f) => ({ ...f, gitBranch: e.target.value }))} className={inputCls} />
          </div>
        </div>

        {manualSsh && <SiteDeployKeyCard siteId={site.id} repoUrl={form.repoUrl.trim()} />}
      </div>

      {/* ── Deploy ayarları ── */}
      <div className="space-y-4 border-t border-border pt-5">
        <div>
          <p className="text-xs font-bold text-foreground">{lang === "en" ? "Deploy pipeline" : "Deploy hattı"}</p>
          {!isSuperAdmin && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
              {lang === "en" ? "Only a super admin can change the command / process manager fields (they run with the panel's privileges)." : "Komut / süreç yöneticisi alanlarını yalnızca süper admin değiştirebilir (panel yetkisiyle çalışırlar)."}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="deployCommand" className="text-xs font-bold text-foreground/90">
            {lang === "en" ? "Deploy command (after pull, before restart — optional)" : "Deploy komutu (pull sonrası, yeniden başlatmadan önce — isteğe bağlı)"}
          </Label>
          <Input
            id="deployCommand"
            placeholder={DEPLOY_COMMAND_PLACEHOLDER[site.type] ?? ""}
            value={form.deployCommand}
            disabled={!isSuperAdmin}
            onChange={(e) => setForm((f) => ({ ...f, deployCommand: e.target.value }))}
            className={inputCls}
          />
          <p className="text-[11px] text-muted-foreground">
            {lang === "en" ? "Runs in the site folder as the panel user via bash. Environment: PORT, GIT_COMMIT, CI=true." : "Site klasöründe, panel kullanıcısı olarak bash ile çalışır. Ortam: PORT, GIT_COMMIT, CI=true."}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-foreground/90">{t("sites.detail.processManagerLabel")}</Label>
            {isSuperAdmin ? (
              <CustomSelect value={form.processManager} onChange={(val) => setForm((f) => ({ ...f, processManager: val as DbProcessManager }))} options={processOptions} className="w-full" />
            ) : (
              <Input value={PROCESS_MANAGER_LABELS[form.processManager][lang === "en" ? "en" : "tr"]} disabled className={inputCls} />
            )}
          </div>
          {form.processManager === "PM2" && (
            <div className="space-y-1.5">
              <Label htmlFor="pm2ProcessName" className="text-xs font-bold text-foreground/90">{lang === "en" ? "PM2 process name" : "PM2 süreç adı"}</Label>
              <Input id="pm2ProcessName" placeholder={site.domain.replace(/\./g, "-")} value={form.pm2ProcessName} disabled={!isSuperAdmin} onChange={(e) => setForm((f) => ({ ...f, pm2ProcessName: e.target.value }))} className={inputCls} />
              <p className="text-[11px] text-muted-foreground">{lang === "en" ? "The name shown by `pm2 list` in the root terminal." : "Root terminalde `pm2 list`'in gösterdiği ad."}</p>
            </div>
          )}
          {form.processManager === "CUSTOM_SCRIPT" && (
            <div className="space-y-1.5">
              <Label htmlFor="customRestartCommand" className="text-xs font-bold text-foreground/90">{t("sites.detail.customRestartScriptLabel")}</Label>
              <Input id="customRestartCommand" placeholder={`/var/www/${site.domain}/deploy/restart.sh`} value={form.customRestartCommand} disabled={!isSuperAdmin} onChange={(e) => setForm((f) => ({ ...f, customRestartCommand: e.target.value }))} className={inputCls} />
            </div>
          )}
        </div>
        {form.processManager === "DOCKER_COMPOSE" && (
          <p className="text-[11px] text-muted-foreground">
            {lang === "en" ? "After each deploy the panel runs `docker compose up -d --build --remove-orphans` in the site folder, so code, compose and image changes all go live." : "Her deploy sonrası panel site klasöründe `docker compose up -d --build --remove-orphans` çalıştırır — kod, compose ve image değişiklikleri yayına girer."}
          </p>
        )}

        <div className="flex items-center justify-between rounded-xl border border-border p-4 bg-muted/30">
          <div>
            <p className="text-xs font-bold text-foreground">{t("sites.detail.autoPullRestartLabel")}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {lang === "en" ? "Polls the repo; on a new commit runs the full pipeline. A GitHub App push webhook triggers instantly (see Settings)." : "Depoyu periyodik kontrol eder; yeni commit'te tüm hattı çalıştırır. GitHub App push webhook'u anında tetikler (bkz. Ayarlar)."}
            </p>
          </div>
          <Switch checked={form.autoPullEnabled} onCheckedChange={(checked) => setForm((f) => ({ ...f, autoPullEnabled: checked }))} />
        </div>
        {form.autoPullEnabled && (
          <div className="space-y-1.5 sm:w-64">
            <Label htmlFor="autoPullInterval" className="text-xs font-bold text-foreground/90">{t("sites.detail.checkIntervalSecLabel")}</Label>
            <Input id="autoPullInterval" type="number" min={5} max={86400} value={form.autoPullIntervalSeconds} onChange={(e) => setForm((f) => ({ ...f, autoPullIntervalSeconds: Number(e.target.value) || 15 }))} className={inputCls} />
          </div>
        )}

        {saveError && <p className="text-xs text-destructive">{saveError}</p>}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary-hover text-primary-foreground h-10 px-5 rounded-xl text-xs font-semibold cursor-pointer shadow-sm">
            {saving ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Save className="size-3.5 mr-1" />}
            {t("sites.detail.saveGitSettings")}
          </Button>
          <Button variant="outline" onClick={handlePull} disabled={running !== null || !site.repoUrl} className="h-10 px-4 rounded-xl border border-border bg-card text-xs font-semibold cursor-pointer">
            {running === "pull" ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <RotateCw className="size-3.5 mr-1" />}
            {t("sites.detail.pullNow")}
          </Button>
          <Button variant="outline" onClick={handleDeploy} disabled={running !== null} className="h-10 px-4 rounded-xl border border-border bg-card text-xs font-semibold cursor-pointer text-[#580619] dark:text-[#38bdf8]" title={lang === "en" ? "pull → deploy command → restart, even without new commits" : "pull → deploy komutu → yeniden başlatma, yeni commit olmasa bile"}>
            {running === "deploy" ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Rocket className="size-3.5 mr-1" />}
            {lang === "en" ? "Deploy Now" : "Şimdi Deploy Et"}
          </Button>
          {saveOk && <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">{t("sites.detail.gitSettingsSaved")}</span>}
        </div>

        {result && (
          <div className={cn("p-3 rounded-xl text-xs font-mono space-y-2", result.ok ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900" : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900")}>
            <p>{result.text}</p>
            {result.output && <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900 dark:bg-[#030610] p-3 text-[11px] text-slate-100 whitespace-pre-wrap">{result.output}</pre>}
          </div>
        )}

        <div className="pt-4 border-t border-border grid gap-2 sm:grid-cols-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between gap-2">
            <span>{t("sites.detail.lastGitPull")}</span>
            <span className={cn("font-mono font-bold", site.lastPullOk === false ? "text-red-600 dark:text-red-400" : "text-foreground")}>{fmt(site.lastPullAt)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>{lang === "en" ? "Last deploy" : "Son deploy"}</span>
            <span className={cn("font-mono font-bold", site.lastDeployOk === false ? "text-red-600 dark:text-red-400" : "text-foreground")}>{fmt(site.lastDeployAt)}</span>
          </div>
          {site.lastPullError && <p className="sm:col-span-2 font-mono text-red-600 dark:text-red-400">{lang === "en" ? "Pull error" : "Pull hatası"}: {site.lastPullError}</p>}
          {site.lastDeployError && <p className="sm:col-span-2 font-mono text-red-600 dark:text-red-400">{lang === "en" ? "Deploy error" : "Deploy hatası"}: {site.lastDeployError}</p>}
          {site.lastDeployOutput && (
            <details className="sm:col-span-2">
              <summary className="cursor-pointer text-foreground/80 font-semibold">{lang === "en" ? "Last deploy output" : "Son deploy çıktısı"}</summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-900 dark:bg-[#030610] p-3 font-mono text-[11px] text-slate-100 whitespace-pre-wrap">{site.lastDeployOutput}</pre>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}
