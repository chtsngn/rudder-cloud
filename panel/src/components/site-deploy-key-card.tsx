"use client"

import { useCallback, useEffect, useState } from "react"
import { Copy, KeyRound, Loader2, PlugZap, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTranslation } from "@/components/language-provider"
import { cn } from "@/lib/utils"

interface DeployKeyData {
  keyName: string
  publicKey: string | null
  fingerprint: string | null
  createdAt: string | null
}

async function parseError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  return data?.error ?? `İstek başarısız oldu (${res.status}).`
}

/**
 * SSH deploy key (manuel/GitHub dışı depolar için — bkz. src/lib/deploy-keys.ts).
 * Public key deponun "Deploy Keys" ayarına salt-okunur eklenir; git bu
 * anahtarı otomatik kullanır (GIT_SSH_COMMAND). Bağlantı testi `ssh -T`.
 */
export function SiteDeployKeyCard({ siteId, repoUrl }: { siteId: string; repoUrl: string }) {
  const { lang } = useTranslation()
  const [key, setKey] = useState<DeployKeyData | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ ok: boolean; output: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/sites/${siteId}/deploy-key`, { cache: "no-store" })
      if (!res.ok) {
        setError(await parseError(res))
        setKey(null)
        return
      }
      const data = (await res.json()) as { deployKey: DeployKeyData | null }
      setKey(data.deployKey)
    } catch {
      setError(lang === "en" ? "Could not reach the server." : "Sunucuya bağlanılamadı.")
      setKey(null)
    }
  }, [siteId, lang])

  useEffect(() => {
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])

  async function handleGenerate() {
    setBusy(true)
    setError(null)
    setTestResult(null)
    try {
      const res = await fetch(`/api/sites/${siteId}/deploy-key`, { method: "POST" })
      if (!res.ok) {
        setError(await parseError(res))
        return
      }
      const data = (await res.json()) as { deployKey: DeployKeyData }
      setKey(data.deployKey)
    } catch {
      setError(lang === "en" ? "Could not reach the server." : "Sunucuya bağlanılamadı.")
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(lang === "en" ? "Delete the deploy key? Pulls over SSH will stop working until a new key is added to the repo." : "Deploy key silinsin mi? Yeni bir anahtar depoya eklenene kadar SSH ile pull çalışmaz.")) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/sites/${siteId}/deploy-key`, { method: "DELETE" })
      if (!res.ok) {
        setError(await parseError(res))
        return
      }
      setKey(null)
      setTestResult(null)
    } catch {
      setError(lang === "en" ? "Could not reach the server." : "Sunucuya bağlanılamadı.")
    } finally {
      setBusy(false)
    }
  }

  async function handleTest() {
    setBusy(true)
    setError(null)
    setTestResult(null)
    try {
      const res = await fetch(`/api/sites/${siteId}/deploy-key/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      if (!res.ok) {
        setError(await parseError(res))
        return
      }
      setTestResult((await res.json()) as { ok: boolean; output: string })
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
    <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex items-center gap-2 text-xs font-bold text-foreground">
        <KeyRound className="size-3.5" />
        {lang === "en" ? "SSH Deploy Key" : "SSH Deploy Key"}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {lang === "en"
          ? `The repo address is SSH (${repoUrl}). Generate a read-only key here, add the public key under the repository's Deploy Keys, then test the connection.`
          : `Depo adresi SSH (${repoUrl}). Burada salt-okunur bir anahtar üretin, public key'i deponun "Deploy Keys" ayarına ekleyin, sonra bağlantıyı test edin.`}
      </p>

      {key === undefined ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : key === null ? (
        <Button size="sm" onClick={handleGenerate} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
          {lang === "en" ? "Generate Deploy Key" : "Deploy Key Oluştur"}
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-mono text-muted-foreground truncate">{key.fingerprint || key.keyName}</span>
            <Button variant="ghost" size="sm" onClick={() => key.publicKey && copy(key.publicKey)}>
              <Copy className="size-3.5" />
              {copied ? (lang === "en" ? "Copied" : "Kopyalandı") : (lang === "en" ? "Copy public key" : "Public key'i kopyala")}
            </Button>
          </div>
          <pre className="overflow-x-auto rounded-lg bg-muted/40 p-3 text-[11px] whitespace-pre-wrap break-all">{key.publicKey}</pre>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleTest} disabled={busy}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <PlugZap className="size-3.5" />}
              {lang === "en" ? "Test connection" : "Bağlantıyı test et"}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDelete} disabled={busy}>
              <Trash2 className="size-3.5" />
              {lang === "en" ? "Delete key" : "Anahtarı sil"}
            </Button>
          </div>
          {testResult && (
            <pre className={cn("overflow-x-auto rounded-lg p-3 text-[11px] whitespace-pre-wrap", testResult.ok ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300" : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300")}>
              {testResult.ok ? "✓ " : "✗ "}{testResult.output}
            </pre>
          )}
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
