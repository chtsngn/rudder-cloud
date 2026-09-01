"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Plus, Trash2, Users as UsersIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SuperAdminGate } from "@/components/super-admin-gate"
import { useCurrentUser } from "@/hooks/use-current-user"

interface UserView {
  id: string
  username: string
  role: "SUPER_ADMIN" | "MEMBER"
  createdAt: string
  updatedAt: string
}

const SELECT_CLASS =
  "border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px]"

async function parseError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  return data?.error ?? `İstek başarısız oldu (${res.status}).`
}

function UsersContent() {
  const { user: me } = useCurrentUser()

  const [users, setUsers] = useState<UserView[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ username: "", password: "", role: "MEMBER" as "SUPER_ADMIN" | "MEMBER" })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [rowError, setRowError] = useState<Record<string, string>>({})
  const [resetOpenFor, setResetOpenFor] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      const res = await fetch("/api/users", { cache: "no-store" })
      if (!res.ok) {
        setListError(await parseError(res))
        return
      }
      setUsers((await res.json()) as UserView[])
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

  async function handleCreate() {
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      })
      if (!res.ok) {
        setCreateError(await parseError(res))
        return
      }
      setCreateOpen(false)
      setCreateForm({ username: "", password: "", role: "MEMBER" })
      await load()
    } catch {
      setCreateError("Sunucuya bağlanılamadı.")
    } finally {
      setCreating(false)
    }
  }

  async function handleRoleChange(id: string, role: "SUPER_ADMIN" | "MEMBER") {
    setRowBusy(id)
    setRowError((e) => ({ ...e, [id]: "" }))
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) {
        const message = await parseError(res)
        setRowError((e) => ({ ...e, [id]: message }))
        return
      }
      await load()
    } catch {
      setRowError((e) => ({ ...e, [id]: "Sunucuya bağlanılamadı." }))
    } finally {
      setRowBusy(null)
    }
  }

  async function handleResetPassword(id: string) {
    if (resetPassword.length < 8) {
      setRowError((e) => ({ ...e, [id]: "Parola en az 8 karakter olmalı." }))
      return
    }
    setRowBusy(id)
    setRowError((e) => ({ ...e, [id]: "" }))
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPassword }),
      })
      if (!res.ok) {
        const message = await parseError(res)
        setRowError((e) => ({ ...e, [id]: message }))
        return
      }
      setResetOpenFor(null)
      setResetPassword("")
    } catch {
      setRowError((e) => ({ ...e, [id]: "Sunucuya bağlanılamadı." }))
    } finally {
      setRowBusy(null)
    }
  }

  async function handleDelete(u: UserView) {
    if (!window.confirm(`${u.username} silinsin mi? Bu işlem geri alınamaz.`)) return
    setRowBusy(u.id)
    setRowError((e) => ({ ...e, [u.id]: "" }))
    try {
      const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" })
      if (!res.ok) {
        const message = await parseError(res)
        setRowError((e) => ({ ...e, [u.id]: message }))
        return
      }
      await load()
    } catch {
      setRowError((e) => ({ ...e, [u.id]: "Sunucuya bağlanılamadı." }))
    } finally {
      setRowBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-semibold text-foreground">
            <UsersIcon className="size-5" />
            Kullanıcılar
          </h1>
          <p className="text-sm text-muted-foreground">
            Panele erişebilen hesaplar ve rolleri. Site bazlı izinler, ilgili sitenin detay
            sayfasındaki &ldquo;Erişim&rdquo; kartından yönetilir.
          </p>
        </div>
        <Button onClick={() => setCreateOpen((v) => !v)}>
          <Plus className="size-4" />
          Yeni Kullanıcı
        </Button>
      </div>

      {createOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Yeni Kullanıcı</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-username">Kullanıcı adı</Label>
                <Input
                  id="new-username"
                  value={createForm.username}
                  onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
                  placeholder="ör. ayse"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">Parola</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="en az 8 karakter"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-role">Rol</Label>
                <select
                  id="new-role"
                  value={createForm.role}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, role: e.target.value as "SUPER_ADMIN" | "MEMBER" }))
                  }
                  className={SELECT_CLASS}
                >
                  <option value="MEMBER">Üye — yalnızca verilen sitelere erişir</option>
                  <option value="SUPER_ADMIN">Süper Admin — her şeye tam erişir</option>
                </select>
              </div>
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={creating}>
                {creating && <Loader2 className="size-4 animate-spin" />}
                Oluştur
              </Button>
              <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                Vazgeç
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Yükleniyor...
            </div>
          ) : listError ? (
            <p className="p-6 text-sm text-destructive">{listError}</p>
          ) : users.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Henüz kullanıcı yok.</p>
          ) : (
            <div className="divide-y divide-border">
              {users.map((u) => (
                <div key={u.id} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-medium text-foreground">{u.username}</span>
                    {u.id === me?.id && <Badge variant="secondary">siz</Badge>}
                    <div className="ml-auto flex items-center gap-2">
                      <select
                        value={u.role}
                        disabled={rowBusy === u.id}
                        onChange={(e) => handleRoleChange(u.id, e.target.value as "SUPER_ADMIN" | "MEMBER")}
                        className={SELECT_CLASS + " w-auto"}
                      >
                        <option value="MEMBER">Üye</option>
                        <option value="SUPER_ADMIN">Süper Admin</option>
                      </select>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={rowBusy === u.id}
                        onClick={() => {
                          setResetOpenFor(resetOpenFor === u.id ? null : u.id)
                          setResetPassword("")
                        }}
                      >
                        Parola Sıfırla
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={rowBusy === u.id || u.id === me?.id}
                        onClick={() => handleDelete(u)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  {resetOpenFor === u.id && (
                    <div className="flex items-center gap-2 pl-1">
                      <Input
                        type="password"
                        placeholder="yeni parola (en az 8 karakter)"
                        value={resetPassword}
                        onChange={(e) => setResetPassword(e.target.value)}
                        className="max-w-xs"
                      />
                      <Button size="sm" disabled={rowBusy === u.id} onClick={() => handleResetPassword(u.id)}>
                        Kaydet
                      </Button>
                    </div>
                  )}
                  {rowError[u.id] && <p className="pl-1 text-sm text-destructive">{rowError[u.id]}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function UsersPage() {
  return (
    <SuperAdminGate>
      <UsersContent />
    </SuperAdminGate>
  )
}
