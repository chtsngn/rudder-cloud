"use client"

import { useCallback, useEffect, useState, useMemo } from "react"
import {
  Loader2,
  Plus,
  Trash2,
  Users as UsersIcon,
  Shield,
  ShieldCheck,
  User as UserIcon,
  KeyRound,
  Search,
  Check,
  X,
  Sparkles,
  Calendar,
  Lock,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SuperAdminGate } from "@/components/super-admin-gate"
import { useCurrentUser } from "@/hooks/use-current-user"
import { CustomSelect } from "@/components/ui/custom-select"
import { useTranslation } from "@/components/language-provider"
import { cn } from "@/lib/utils"

interface UserView {
  id: string
  username: string
  role: "SUPER_ADMIN" | "MEMBER"
  createdAt: string
  updatedAt: string
}

async function parseError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  return data?.error ?? `İstek başarısız oldu (${res.status}).`
}

function formatDate(isoStr: string, locale: string = "tr-TR") {
  try {
    const d = new Date(isoStr)
    return d.toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  } catch {
    return isoStr
  }
}

function UsersContent() {
  const { t, lang } = useTranslation()
  const { user: me } = useCurrentUser()

  const [users, setUsers] = useState<UserView[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState<"ALL" | "SUPER_ADMIN" | "MEMBER">("ALL")

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({
    username: "",
    password: "",
    role: "MEMBER" as "SUPER_ADMIN" | "MEMBER",
  })
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
  }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
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
    if (!window.confirm(`${u.username} kullanıcısı silinsin mi? Bu işlem geri alınamaz.`)) return
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
    } finally {
      setRowBusy(null)
    }
  }

  // Filtreleme
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchQuery = u.username.toLowerCase().includes(searchQuery.toLowerCase())
      const matchRole = roleFilter === "ALL" || u.role === roleFilter
      return matchQuery && matchRole
    })
  }, [users, searchQuery, roleFilter])

  // İstatistikler
  const superAdminCount = users.filter((u) => u.role === "SUPER_ADMIN").length
  const memberCount = users.filter((u) => u.role === "MEMBER").length

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      {/* ═══ 1. ÜST BAŞLIK & İSTATİSTİK ROZETLERİ ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-3.5">
          <div className="size-12 rounded-2xl bg-[#580619]/5 dark:bg-[#101c38] border border-[#c8a87c]/30 dark:border-[#1e3568]/50 flex items-center justify-center text-[#580619] dark:text-blue-300 shadow-2xs">
            <UsersIcon className="size-6 text-[#580619] dark:text-blue-300" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-heading text-2xl md:text-3xl font-extrabold tracking-tight text-[#580619] dark:text-slate-100">
                {t("users.title")}
              </h1>
              <span className="rounded-full bg-[#580619]/10 dark:bg-[#101c38] border border-[#580619]/20 dark:border-[#1e3568]/50 px-2.5 py-0.5 text-xs font-bold text-[#580619] dark:text-blue-300 font-mono">
                {users.length}
              </span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-sans mt-0.5">
              {t("users.subtitle")}
            </p>
          </div>
        </div>

        {/* Eylem Butonu */}
        <Button
          onClick={() => setCreateOpen((v) => !v)}
          className="bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white font-semibold text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl shadow-sm transition-all flex items-center gap-2 h-11 border border-[#c8a87c]/40 dark:border-[#2a4687]/60 hover:border-[#c8a87c] dark:hover:border-[#385db3] shrink-0 cursor-pointer active:scale-95"
        >
          <Plus className="size-4 text-inherit" />
          {t("users.addUser")}
        </Button>
      </div>

      {/* ═══ 2. YENİ KULLANICI OLUŞTURMA KARTI ═══ */}
      {createOpen && (
        <div className="rounded-2xl border border-[#c8a87c]/80 dark:border-[#1e3568] bg-white dark:bg-[#090e1f] p-6 shadow-md space-y-5 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#16223f] pb-3">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-xl bg-[#580619]/10 dark:bg-[#101c38] text-[#580619] dark:text-blue-300 flex items-center justify-center">
                <Plus className="size-4" />
              </div>
              <h3 className="font-heading font-bold text-base text-slate-900 dark:text-slate-100">
                {t("users.modalTitle")}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="size-7 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">{t("users.username")}</Label>
                <Input
                  value={createForm.username}
                  onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
                  placeholder={lang === "tr" ? "ör. ahmet veya developer" : "e.g. john or developer"}
                  className="h-10 rounded-xl text-xs bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">{t("users.tempPassword")}</Label>
                <Input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder={lang === "tr" ? "en az 8 karakter" : "at least 8 characters"}
                  className="h-10 rounded-xl text-xs font-mono bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">{t("users.systemRole")}</Label>
                <CustomSelect
                  value={createForm.role}
                  onChange={(val) =>
                    setCreateForm((f) => ({ ...f, role: val as "SUPER_ADMIN" | "MEMBER" }))
                  }
                  options={[
                    { value: "MEMBER", label: t("users.memberRoleOption") },
                    { value: "SUPER_ADMIN", label: t("users.adminRoleOption") },
                  ]}
                  className="w-full"
                />
              </div>
            </div>

            {createError && (
              <p className="text-xs text-red-600 dark:text-red-400 font-mono bg-red-50 dark:bg-red-950/40 p-2.5 rounded-lg border border-red-200 dark:border-red-900">
                {createError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-[#16223f]">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                className="h-9 px-4 rounded-xl text-xs font-semibold dark:border-[#16223f] dark:text-slate-300 dark:hover:bg-[#111f40]"
              >
                {t("common.vazgec")}
              </Button>
              <Button
                type="submit"
                disabled={creating}
                className="bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white h-9 px-5 rounded-xl text-xs font-semibold border border-[#c8a87c]/40 dark:border-[#2a4687]/60 cursor-pointer"
              >
                {creating && <Loader2 className="size-3.5 animate-spin mr-1.5 text-inherit" />}
                {t("users.saveUserBtn")}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* ═══ 3. ARAMA & FİLTRELEME ÇUBUĞU ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white dark:bg-[#090e1f] p-3.5 rounded-2xl border border-slate-200/90 dark:border-[#16223f] shadow-2xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("users.searchPlaceholder")}
            className="pl-9 h-9.5 rounded-xl text-xs bg-slate-50/50 dark:bg-[#060a17] border-slate-200 dark:border-[#16223f] dark:text-slate-100 focus:bg-white dark:focus:bg-[#060a17]"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider pl-1">
            {t("users.roleFilterLabel")}
          </span>
          <div className="flex items-center bg-slate-100/80 dark:bg-[#070c1a] p-0.5 rounded-xl border border-slate-200 dark:border-[#16223f] text-xs">
            <button
              type="button"
              onClick={() => setRoleFilter("ALL")}
              className={cn(
                "px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer",
                roleFilter === "ALL"
                  ? "bg-white dark:bg-[#162752] text-[#580619] dark:text-white shadow-2xs dark:border dark:border-[#2a4687]/60"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              )}
            >
              {t("users.filterAll")} ({users.length})
            </button>
            <button
              type="button"
              onClick={() => setRoleFilter("SUPER_ADMIN")}
              className={cn(
                "px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer",
                roleFilter === "SUPER_ADMIN"
                  ? "bg-white dark:bg-[#162752] text-[#580619] dark:text-white shadow-2xs dark:border dark:border-[#2a4687]/60"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              )}
            >
              {t("users.filterSuperAdmin")} ({superAdminCount})
            </button>
            <button
              type="button"
              onClick={() => setRoleFilter("MEMBER")}
              className={cn(
                "px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer",
                roleFilter === "MEMBER"
                  ? "bg-white dark:bg-[#162752] text-[#580619] dark:text-white shadow-2xs dark:border dark:border-[#2a4687]/60"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              )}
            >
              {t("users.filterMember")} ({memberCount})
            </button>
          </div>
        </div>
      </div>

      {/* ═══ 4. LÜKS KULLANICI TABLOSU ═══ */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Loader2 className="size-8 animate-spin text-[#580619] dark:text-blue-300 mb-2" />
            <span className="text-xs font-medium">{t("users.loadingUsers")}</span>
          </div>
        ) : listError ? (
          <div className="p-8 text-center text-xs text-red-600 dark:text-red-400 font-mono bg-red-50/50 dark:bg-red-950/30">
            {listError}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
            {searchQuery ? t("users.noUsersFound") : t("users.noUsersYet")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-[#16223f] bg-slate-50/70 dark:bg-[#060a17] text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="py-3.5 px-5">{t("users.colUser")}</th>
                  <th className="py-3.5 px-4">{t("users.colRole")}</th>
                  <th className="py-3.5 px-4 hidden md:table-cell">{t("users.colDate")}</th>
                  <th className="py-3.5 px-5 text-right">{t("users.colActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#16223f] text-xs">
                {filteredUsers.map((u) => {
                  const isMe = u.id === me?.id
                  const isBusy = rowBusy === u.id
                  const isSuper = u.role === "SUPER_ADMIN"

                  return (
                    <tr
                      key={u.id}
                      className={cn(
                        "group transition-colors hover:bg-slate-50/60 dark:hover:bg-[#0c1630]",
                        isMe && "bg-[#580619]/2 dark:bg-[#162752]/20"
                      )}
                    >
                      {/* Kullanıcı Bilgisi */}
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3">
                          {/* Avatar */}
                          <div
                            className={cn(
                              "size-9 rounded-xl flex items-center justify-center font-heading font-extrabold text-xs shadow-2xs shrink-0",
                              isSuper
                                ? "bg-[#580619] dark:bg-[#162752] text-[#dfc9a0] dark:text-white border border-[#c8a87c]/40 dark:border-[#2a4687]/60"
                                : "bg-slate-100 dark:bg-[#060a17] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#16223f]"
                            )}
                          >
                            {u.username.charAt(0).toUpperCase()}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                                {u.username}
                              </span>
                              {isMe && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[#580619]/10 dark:bg-[#101c38] border border-[#580619]/20 dark:border-[#1e3568]/50 px-2 py-0.5 text-[10px] font-extrabold text-[#580619] dark:text-blue-300">
                                  {t("users.you")}
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                              ID: {u.id.substring(0, 10)}...
                            </span>
                          </div>
                        </div>

                        {/* Parola Sıfırlama Çekmecesi */}
                        {resetOpenFor === u.id && (
                          <div className="mt-3 flex items-center gap-2 bg-slate-50 dark:bg-[#060a17] p-2.5 rounded-xl border border-slate-200 dark:border-[#16223f] animate-in fade-in duration-100">
                            <Input
                              type="password"
                              placeholder={lang === "tr" ? "Yeni parola (en az 8 karakter)" : "New password (min 8 chars)"}
                              value={resetPassword}
                              onChange={(e) => setResetPassword(e.target.value)}
                              className="h-8 text-xs font-mono max-w-xs bg-white dark:bg-[#090e1f] dark:border-[#16223f] dark:text-slate-100"
                              autoFocus
                            />
                            <Button
                              size="sm"
                              disabled={isBusy}
                              onClick={() => handleResetPassword(u.id)}
                              className="bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white h-8 px-3 text-xs font-semibold cursor-pointer border border-[#c8a87c]/40 dark:border-[#2a4687]/60"
                            >
                              {isBusy ? <Loader2 className="size-3 animate-spin" /> : t("common.save")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setResetOpenFor(null)
                                setResetPassword("")
                              }}
                              className="h-8 px-2 text-xs dark:hover:bg-[#111f40]"
                            >
                              <X className="size-3.5" />
                            </Button>
                          </div>
                        )}

                        {rowError[u.id] && (
                          <p className="mt-1 text-[11px] text-red-600 dark:text-red-400 font-mono">
                            {rowError[u.id]}
                          </p>
                        )}
                      </td>

                      {/* Rol Seçici / Rozet */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <CustomSelect
                            value={u.role}
                            disabled={isBusy}
                            onChange={(val) =>
                              handleRoleChange(u.id, val as "SUPER_ADMIN" | "MEMBER")
                            }
                            options={[
                              { value: "SUPER_ADMIN", label: t("users.superAdmin") },
                              { value: "MEMBER", label: t("users.member") },
                            ]}
                            size="sm"
                            className={cn(
                              "font-bold min-w-[125px]",
                              isSuper
                                ? "bg-[#580619]/10 dark:bg-[#101c38] text-[#580619] dark:text-blue-300 border-[#c8a87c]/50 dark:border-[#1e3568]/50"
                                : "bg-slate-100 dark:bg-[#060a17] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#16223f]"
                            )}
                          />
                        </div>
                      </td>

                      {/* Kayıt Tarihi */}
                      <td className="py-4 px-4 hidden md:table-cell text-slate-500 dark:text-slate-400 font-sans">
                        <div className="flex items-center gap-1.5 text-xs">
                          <Calendar className="size-3 text-slate-400" />
                          <span>{formatDate(u.createdAt, lang === "en" ? "en-US" : "tr-TR")}</span>
                        </div>
                      </td>

                      {/* Güvenlik & İşlemler */}
                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Parola Sıfırla Butonu */}
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isBusy}
                            onClick={() => {
                              setResetOpenFor(resetOpenFor === u.id ? null : u.id)
                              setResetPassword("")
                            }}
                            className={cn(
                              "h-8 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer",
                              resetOpenFor === u.id
                                ? "border-[#c8a87c] dark:border-[#2a4687] bg-[#580619]/5 dark:bg-[#162752] text-[#580619] dark:text-white"
                                : "border-slate-200 dark:border-[#16223f] text-slate-700 dark:text-slate-300 hover:border-[#c8a87c] dark:hover:border-[#2a4687] dark:hover:text-blue-300 dark:hover:bg-[#111f40]"
                            )}
                          >
                            <KeyRound className="size-3 mr-1 text-[#c8a87c] dark:text-blue-300" />
                            {t("users.resetPassword")}
                          </Button>

                          {/* Sil Butonu */}
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isBusy || isMe}
                            onClick={() => handleDelete(u)}
                            title={isMe ? (lang === "tr" ? "Kendi hesabınızı silemezsiniz" : "Cannot delete your own account") : t("users.deleteUser")}
                            className="size-8 p-0 rounded-xl border-slate-200 dark:border-[#16223f] text-slate-400 hover:border-red-300 dark:hover:border-red-900 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-30 cursor-pointer"
                          >
                            {isBusy ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
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

