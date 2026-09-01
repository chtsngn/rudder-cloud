"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface S3ConfigView {
  id: string
  label: string
  bucket: string
  region: string
  endpoint: string | null
  accessKeyId: string
  pathPrefix: string
  hasSecret: boolean
}

interface S3FormState {
  label: string
  bucket: string
  region: string
  endpoint: string
  accessKeyId: string
  secretAccessKey: string
  pathPrefix: string
}

const EMPTY_FORM: S3FormState = {
  label: "",
  bucket: "",
  region: "",
  endpoint: "",
  accessKeyId: "",
  secretAccessKey: "",
  pathPrefix: "",
}

async function parseError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  return data?.error ?? `İstek başarısız oldu (${res.status}).`
}

export default function SettingsPage() {
  const [configs, setConfigs] = useState<S3ConfigView[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<S3FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      const res = await fetch("/api/settings/s3", { cache: "no-store" })
      if (!res.ok) {
        setListError(await parseError(res))
        return
      }
      setConfigs((await res.json()) as S3ConfigView[])
    } catch {
      setListError("Sunucuya bağlanılamadı.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      load()
    }, 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openCreateForm() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setSaveError(null)
    setFormOpen(true)
  }

  function openEditForm(config: S3ConfigView) {
    setEditingId(config.id)
    setForm({
      label: config.label,
      bucket: config.bucket,
      region: config.region,
      endpoint: config.endpoint ?? "",
      accessKeyId: config.accessKeyId,
      secretAccessKey: "",
      pathPrefix: config.pathPrefix,
    })
    setSaveError(null)
    setFormOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const body = {
        label: form.label,
        bucket: form.bucket,
        region: form.region,
        endpoint: form.endpoint || null,
        accessKeyId: form.accessKeyId,
        pathPrefix: form.pathPrefix,
        ...(form.secretAccessKey ? { secretAccessKey: form.secretAccessKey } : {}),
      }
      const res = editingId
        ? await fetch(`/api/settings/s3/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/settings/s3", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
      if (!res.ok) {
        setSaveError(await parseError(res))
        return
      }
      setFormOpen(false)
      setForm(EMPTY_FORM)
      setEditingId(null)
      await load()
    } catch {
      setSaveError("Sunucuya bağlanılamadı.")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Bu S3 yapılandırması silinsin mi? Buna bağlı sitelerin yedekleme S3 ayarı sıfırlanır.")) {
      return
    }
    setDeletingId(id)
    try {
      const res = await fetch(`/api/settings/s3/${id}`, { method: "DELETE" })
      if (!res.ok) {
        setListError(await parseError(res))
        return
      }
      await load()
    } finally {
      setDeletingId(null)
    }
  }

  const canSubmit =
    form.bucket.trim() && form.region.trim() && form.accessKeyId.trim() && (editingId ? true : form.secretAccessKey.trim())

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-heading text-2xl font-semibold text-foreground">Ayarlar</h1>
        <p className="text-sm text-muted-foreground">
          Panel genelinde kullanılabilecek S3 (ya da S3-uyumlu) depolama yapılandırmaları —
          site bazında yedekleme ayarlarında seçilir.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>S3 Yapılandırmaları</CardTitle>
            <Button size="sm" onClick={openCreateForm}>
              <Plus className="size-3.5" />
              Yeni Yapılandırma
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {formOpen && (
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Etiket</Label>
                  <Input
                    value={form.label}
                    onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                    placeholder="Varsayılan"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Bucket</Label>
                  <Input
                    value={form.bucket}
                    onChange={(e) => setForm((f) => ({ ...f, bucket: e.target.value }))}
                    placeholder="panel-yedekler"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Bölge (region)</Label>
                  <Input
                    value={form.region}
                    onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                    placeholder="eu-central-1"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Özel endpoint (opsiyonel — MinIO/Spaces vb.)</Label>
                  <Input
                    value={form.endpoint}
                    onChange={(e) => setForm((f) => ({ ...f, endpoint: e.target.value }))}
                    placeholder="https://s3.example.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Access Key ID</Label>
                  <Input
                    value={form.accessKeyId}
                    onChange={(e) => setForm((f) => ({ ...f, accessKeyId: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Secret Access Key{editingId ? " (değiştirmek istemiyorsan boş bırak)" : ""}
                  </Label>
                  <Input
                    type="password"
                    value={form.secretAccessKey}
                    onChange={(e) => setForm((f) => ({ ...f, secretAccessKey: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Yol öneki (opsiyonel)</Label>
                  <Input
                    value={form.pathPrefix}
                    onChange={(e) => setForm((f) => ({ ...f, pathPrefix: e.target.value }))}
                    placeholder="backups/"
                  />
                </div>
              </div>
              {saveError && <p className="text-sm text-destructive">{saveError}</p>}
              <div className="flex items-center gap-2">
                <Button size="sm" disabled={!canSubmit || saving} onClick={handleSave}>
                  {saving && <Loader2 className="size-3.5 animate-spin" />}
                  {editingId ? "Güncelle" : "Oluştur"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setFormOpen(false)}>
                  Vazgeç
                </Button>
              </div>
            </div>
          )}

          {listError && <p className="text-sm text-destructive">{listError}</p>}

          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : configs.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Henüz bir S3 yapılandırması eklenmedi.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {configs.map((config) => (
                <div key={config.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-medium text-foreground">{config.label}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {config.bucket} · {config.region}
                      {config.endpoint ? ` · ${config.endpoint}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEditForm(config)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={deletingId === config.id}
                      onClick={() => handleDelete(config.id)}
                    >
                      {deletingId === config.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
