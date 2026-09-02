"use client"

import { useCallback, useEffect, useState } from "react"
import { Database, Loader2, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { CustomSelect } from "@/components/ui/custom-select"

interface DetectedDatabase {
  engine: "postgres" | "mysql" | "mongo"
  host?: string
  port?: number
  database?: string
  source: string
}

interface BackupFileInfo {
  fileName: string
  sizeBytes: number
  createdAt: string
}

interface S3ConfigOption {
  id: string
  label: string
}

interface BackupData {
  detected: DetectedDatabase | null
  backups: BackupFileInfo[]
  schedule: {
    backupEnabled: boolean
    backupIntervalSeconds: number
    backupRetentionCount: number
    backupUploadToS3: boolean
    s3ConfigId: string | null
    lastBackupAt: string | null
    lastBackupOk: boolean | null
    lastBackupError: string | null
  }
}

const ENGINE_LABEL: Record<DetectedDatabase["engine"], string> = {
  postgres: "PostgreSQL",
  mysql: "MySQL/MariaDB",
  mongo: "MongoDB",
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function parseError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  return data?.error ?? `İstek başarısız oldu (${res.status}).`
}

export function SiteBackupCard({ siteId }: { siteId: string }) {
  const [data, setData] = useState<BackupData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [s3Configs, setS3Configs] = useState<S3ConfigOption[]>([])

  const [form, setForm] = useState({
    backupEnabled: false,
    backupIntervalSeconds: 86400,
    backupRetentionCount: 7,
    backupUploadToS3: false,
    s3ConfigId: "",
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)

  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [runMessage, setRunMessage] = useState<string | null>(null)

  const [deletingFile, setDeletingFile] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [backupRes, s3Res] = await Promise.all([
        fetch(`/api/sites/${siteId}/backup`, { cache: "no-store" }),
        fetch("/api/settings/s3", { cache: "no-store" }),
      ])
      if (!backupRes.ok) {
        setLoadError(await parseError(backupRes))
        return
      }
      const backupData = (await backupRes.json()) as BackupData
      setData(backupData)
      setForm({
        backupEnabled: backupData.schedule.backupEnabled,
        backupIntervalSeconds: backupData.schedule.backupIntervalSeconds,
        backupRetentionCount: backupData.schedule.backupRetentionCount,
        backupUploadToS3: backupData.schedule.backupUploadToS3,
        s3ConfigId: backupData.schedule.s3ConfigId ?? "",
      })
      if (s3Res.ok) {
        setS3Configs((await s3Res.json()) as S3ConfigOption[])
      }
    } catch {
      setLoadError("Sunucuya bağlanılamadı.")
    } finally {
      setLoading(false)
    }
  }, [siteId])

  useEffect(() => {
    const timer = setTimeout(() => {
      load()
    }, 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId])

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    setSaveOk(false)
    try {
      const res = await fetch(`/api/sites/${siteId}/backup`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backupEnabled: form.backupEnabled,
          backupIntervalSeconds: form.backupIntervalSeconds,
          backupRetentionCount: form.backupRetentionCount,
          backupUploadToS3: form.backupUploadToS3,
          s3ConfigId: form.s3ConfigId || null,
        }),
      })
      if (!res.ok) {
        setSaveError(await parseError(res))
        return
      }
      setSaveOk(true)
      await load()
    } catch {
      setSaveError("Sunucuya bağlanılamadı.")
    } finally {
      setSaving(false)
    }
  }

  async function handleRunNow() {
    setRunning(true)
    setRunError(null)
    setRunMessage(null)
    try {
      const res = await fetch(`/api/sites/${siteId}/backup/run`, { method: "POST" })
      const resData = (await res.json().catch(() => null)) as
        | { fileName?: string; uploadedToS3?: boolean; s3Error?: string | null; error?: string }
        | null
      if (!res.ok) {
        setRunError(resData?.error ?? "Yedekleme başarısız oldu.")
        return
      }
      if (resData?.s3Error) {
        setRunError(`Yedek alındı ama S3 yüklemesi başarısız: ${resData.s3Error}`)
      } else {
        setRunMessage(
          `Yedek alındı: ${resData?.fileName ?? ""}${resData?.uploadedToS3 ? " (S3'e yüklendi)" : ""}`
        )
      }
      await load()
    } catch {
      setRunError("Sunucuya bağlanılamadı.")
    } finally {
      setRunning(false)
    }
  }

  async function handleDeleteBackup(fileName: string) {
    if (!window.confirm(`"${fileName}" silinsin mi?`)) return
    setDeletingFile(fileName)
    try {
      const res = await fetch(`/api/sites/${siteId}/backup?file=${encodeURIComponent(fileName)}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        setRunError(await parseError(res))
        return
      }
      await load()
    } finally {
      setDeletingFile(null)
    }
  }

  function downloadBackup(fileName: string) {
    const a = document.createElement("a")
    a.href = `/api/sites/${siteId}/backup/download?file=${encodeURIComponent(fileName)}`
    a.rel = "noopener"
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="size-4" />
          Veritabanı Yedekleme
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : (
          <>
            <div className="rounded-lg border border-border p-3 text-sm">
              {data?.detected ? (
                <p className="text-foreground">
                  <span className="font-medium">{ENGINE_LABEL[data.detected.engine]}</span> algılandı
                  {data.detected.database ? ` — "${data.detected.database}"` : ""} ·{" "}
                  <span className="font-mono text-xs text-muted-foreground">{data.detected.source}</span>
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Veritabanı otomatik algılanamadı — sitenin <span className="font-mono">.env</span>{" "}
                  dosyasında <span className="font-mono">DATABASE_URL</span> ya da{" "}
                  <span className="font-mono">DB_CONNECTION</span>/<span className="font-mono">DB_*</span>{" "}
                  değişkenleri bulunamadı.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="space-y-0.5 pr-4">
                <Label htmlFor="backupEnabled">Periyodik yedekleme</Label>
                <p className="text-xs text-muted-foreground">
                  Etkinleştirilirse panel bu veritabanını düzenli aralıklarla yedekler.
                </p>
              </div>
              <Switch
                id="backupEnabled"
                checked={form.backupEnabled}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, backupEnabled: checked }))}
              />
            </div>

            {form.backupEnabled && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="backupInterval">Aralık (saniye)</Label>
                  <Input
                    id="backupInterval"
                    type="number"
                    min={300}
                    value={form.backupIntervalSeconds}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, backupIntervalSeconds: Number(e.target.value) || 86400 }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">86400 = günde bir.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="backupRetention">Saklanacak yedek sayısı</Label>
                  <Input
                    id="backupRetention"
                    type="number"
                    min={1}
                    max={100}
                    value={form.backupRetentionCount}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, backupRetentionCount: Number(e.target.value) || 7 }))
                    }
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="space-y-0.5 pr-4">
                <Label htmlFor="uploadToS3">S3&apos;e de yükle</Label>
                <p className="text-xs text-muted-foreground">
                  Ayarlar sayfasında tanımlı bir S3 yapılandırması seçilmeli.
                </p>
              </div>
              <Switch
                id="uploadToS3"
                checked={form.backupUploadToS3}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, backupUploadToS3: checked }))}
              />
            </div>

            {form.backupUploadToS3 && (
              <div className="space-y-1.5">
                <Label htmlFor="s3Config" className="text-xs font-bold text-slate-700">S3 Yapılandırması</Label>
                <CustomSelect
                  value={form.s3ConfigId}
                  onChange={(val) => setForm((f) => ({ ...f, s3ConfigId: val }))}
                  options={[
                    { value: "", label: "Seçilmedi (Varsayılan)" },
                    ...s3Configs.map((c) => ({ value: c.id, label: c.label })),
                  ]}
                  placeholder="S3 Yapılandırması Seçiniz..."
                  className="w-full"
                />
                {s3Configs.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Henüz S3 yapılandırması yok — Ayarlar sayfasından ekleyebilirsin.
                  </p>
                )}
              </div>
            )}

            {saveError && <p className="text-sm text-destructive">{saveError}</p>}

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                Kaydet
              </Button>
              <Button variant="outline" onClick={handleRunNow} disabled={running}>
                {running && <Loader2 className="size-4 animate-spin" />}
                Şimdi Yedekle
              </Button>
              {saveOk && <span className="text-xs text-success">Kaydedildi.</span>}
            </div>

            {(runMessage || runError) && (
              <p className={`text-sm ${runError ? "text-destructive" : "text-success"}`}>
                {runError ?? runMessage}
              </p>
            )}

            <dl className="divide-y divide-border border-t border-border pt-2">
              <div className="flex items-center justify-between py-2 text-sm">
                <dt className="text-muted-foreground">Son yedekleme</dt>
                <dd className="font-mono text-foreground">
                  {data?.schedule.lastBackupAt
                    ? new Date(data.schedule.lastBackupAt).toLocaleString("tr-TR")
                    : "Henüz yapılmadı"}
                </dd>
              </div>
              {data?.schedule.lastBackupAt && (
                <div className="flex items-center justify-between py-2 text-sm">
                  <dt className="text-muted-foreground">Durum</dt>
                  <dd className={data.schedule.lastBackupOk ? "text-success" : "text-destructive"}>
                    {data.schedule.lastBackupOk
                      ? "Başarılı"
                      : (data.schedule.lastBackupError ?? "Başarısız")}
                  </dd>
                </div>
              )}
            </dl>

            {data && data.backups.length > 0 && (
              <div className="space-y-1.5">
                <Label>Yedekler</Label>
                <div className="divide-y divide-border">
                  {data.backups.map((b) => (
                    <div key={b.fileName} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <button
                        className="truncate text-left font-mono text-xs text-foreground hover:underline"
                        onClick={() => downloadBackup(b.fileName)}
                        title="İndir"
                      >
                        {b.fileName}
                      </button>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-xs text-muted-foreground">{formatBytes(b.sizeBytes)}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(b.createdAt).toLocaleDateString("tr-TR")}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={deletingFile === b.fileName}
                          onClick={() => handleDeleteBackup(b.fileName)}
                        >
                          {deletingFile === b.fileName ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
