"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useCurrentUser } from "@/hooks/use-current-user"

type SitePermission = "VIEW" | "EDIT_FILES" | "RESTART" | "DELETE" | "MANAGE_BACKUPS" | "MANAGE_DEPLOY_KEYS"

const PERMISSION_LABELS: Record<SitePermission, string> = {
  VIEW: "Görüntüle",
  EDIT_FILES: "Dosyaları düzenle",
  RESTART: "Yeniden başlat / durdur",
  DELETE: "Dosya sil (dosya yöneticisi)",
  MANAGE_BACKUPS: "Yedeklemeleri yönet",
  MANAGE_DEPLOY_KEYS: "GitHub anahtarlarını yönet",
}
const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS) as SitePermission[]

interface AccessRow {
  userId: string
  username: string
  permissions: SitePermission[]
}

async function parseError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  return data?.error ?? `İstek başarısız oldu (${res.status}).`
}

/**
 * SADECE SUPER_ADMIN'e görünür (bkz. aşağıdaki erken `return null` — asıl
 * koruma her zaman API tarafında, `/api/sites/[id]/access*` route'ları da
 * ayrıca `isSuperAdmin()` kontrolü yapıyor). Sistemde MEMBER rolünde
 * kullanıcı yoksa boş bir durum mesajı gösterir.
 */
export function SiteAccessCard({ siteId }: { siteId: string }) {
  const { user: me, loading: meLoading } = useCurrentUser()

  const [rows, setRows] = useState<AccessRow[]>([])
  const [draft, setDraft] = useState<Record<string, Set<SitePermission>>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [savingFor, setSavingFor] = useState<string | null>(null)
  const [rowError, setRowError] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/sites/${siteId}/access`, { cache: "no-store" })
      if (!res.ok) {
        setLoadError(await parseError(res))
        return
      }
      const data = (await res.json()) as AccessRow[]
      setRows(data)
      setDraft(Object.fromEntries(data.map((r) => [r.userId, new Set(r.permissions)])))
    } catch {
      setLoadError("Sunucuya bağlanılamadı.")
    } finally {
      setLoading(false)
    }
  }, [siteId])

  useEffect(() => {
    if (me?.role !== "SUPER_ADMIN") return
    const timer = setTimeout(() => {
      load()
    }, 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.role])

  function toggle(userId: string, permission: SitePermission) {
    setDraft((d) => {
      const current = new Set(d[userId] ?? [])
      if (current.has(permission)) current.delete(permission)
      else current.add(permission)
      return { ...d, [userId]: current }
    })
  }

  async function handleSave(userId: string) {
    setSavingFor(userId)
    setRowError((e) => ({ ...e, [userId]: "" }))
    try {
      const permissions = Array.from(draft[userId] ?? [])
      const res = await fetch(`/api/sites/${siteId}/access/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions }),
      })
      if (!res.ok) {
        const message = await parseError(res)
        setRowError((e) => ({ ...e, [userId]: message }))
        return
      }
      await load()
    } catch {
      setRowError((e) => ({ ...e, [userId]: "Sunucuya bağlanılamadı." }))
    } finally {
      setSavingFor(null)
    }
  }

  if (meLoading || me?.role !== "SUPER_ADMIN") return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4" />
          Erişim
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Üye (MEMBER) rolündeki kullanıcılara bu sitede hangi işlemlerin izin verildiğini belirleyin.
          Süper adminler her zaman tam erişime sahiptir, burada listelenmezler.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Yükleniyor...
          </div>
        ) : loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sistemde üye (MEMBER) rolünde bir kullanıcı yok. Kullanıcılar sayfasından ekleyebilirsiniz.
          </p>
        ) : (
          <div className="space-y-4">
            {rows.map((row) => {
              const selected = draft[row.userId] ?? new Set<SitePermission>()
              return (
                <div key={row.userId} className="space-y-2 rounded-md border border-border p-3">
                  <p className="font-medium text-foreground">{row.username}</p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {ALL_PERMISSIONS.map((perm) => (
                      <label key={perm} className="flex items-center gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={selected.has(perm)}
                          onChange={() => toggle(row.userId, perm)}
                          className="size-4 rounded border-input"
                        />
                        {PERMISSION_LABELS[perm]}
                      </label>
                    ))}
                  </div>
                  {rowError[row.userId] && <p className="text-sm text-destructive">{rowError[row.userId]}</p>}
                  <Button size="sm" disabled={savingFor === row.userId} onClick={() => handleSave(row.userId)}>
                    {savingFor === row.userId && <Loader2 className="size-4 animate-spin" />}
                    Kaydet
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
