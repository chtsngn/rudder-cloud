"use client"

import { useCallback, useEffect, useState, useMemo } from "react"
import {
  ShieldCheck,
  RefreshCw,
  Search,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Users,
  Globe,
  UserCheck,
  Key,
  Database,
  Lock,
  Calendar,
  Clock,
  Layers,
  ChevronRight,
  Filter,
  X,
  FileCode,
  Check,
  Copy,
  Info,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { SuperAdminGate } from "@/components/super-admin-gate"
import { cn } from "@/lib/utils"

interface AuditLogEntry {
  id: string
  userId: string | null
  username: string
  action: string
  targetType: string | null
  targetId: string | null
  detail: string | null
  createdAt: string
}

async function parseError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  return data?.error ?? `İstek başarısız oldu (${res.status}).`
}

function formatDate(iso: string): { full: string; time: string; relative: string } {
  const date = new Date(iso)
  const full = date.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
  const time = date.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })

  // Göreceli zaman (örn: 5 dk önce)
  const diffMs = Date.now() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  let relative = "Az önce"
  if (diffDay > 0) relative = `${diffDay} gün önce`
  else if (diffHour > 0) relative = `${diffHour} saat önce`
  else if (diffMin > 0) relative = `${diffMin} dk önce`

  return { full, time, relative }
}

// Eylem Kategorileri & Rozet Renkleri
function getActionBadge(action: string) {
  const act = action.toUpperCase()
  if (act.includes("CREATE") || act.includes("START") || act.includes("DEPLOY")) {
    return {
      label: action,
      icon: Globe,
      color: "bg-emerald-50 text-emerald-700 border-emerald-200",
      dot: "bg-emerald-500",
    }
  }
  if (act.includes("DELETE") || act.includes("REVOKE") || act.includes("STOP")) {
    return {
      label: action,
      icon: AlertTriangle,
      color: "bg-rose-50 text-rose-700 border-rose-200",
      dot: "bg-rose-500",
    }
  }
  if (act.includes("USER") || act.includes("PASSWORD") || act.includes("ACCESS")) {
    return {
      label: action,
      icon: UserCheck,
      color: "bg-indigo-50 text-indigo-700 border-indigo-200",
      dot: "bg-indigo-500",
    }
  }
  if (act.includes("SSL") || act.includes("DOMAIN") || act.includes("KEY")) {
    return {
      label: action,
      icon: Key,
      color: "bg-amber-50 text-amber-700 border-amber-200",
      dot: "bg-amber-500",
    }
  }
  return {
    label: action,
    icon: Activity,
    color: "bg-slate-100 text-slate-700 border-slate-200",
    dot: "bg-slate-500",
  }
}

function AuditContent() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/audit", { cache: "no-store" })
      if (!res.ok) {
        setError(await parseError(res))
        return
      }
      setLogs((await res.json()) as AuditLogEntry[])
    } catch {
      setError("Sunucuya bağlanılamadı.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // İstatistikler
  const stats = useMemo(() => {
    const total = logs.length
    const failed = logs.filter(
      (l) =>
        (l.detail && l.detail.toUpperCase().includes("FAILED")) ||
        l.action.toUpperCase().includes("FAIL") ||
        l.action.toUpperCase().includes("DELETE")
    ).length
    const success = total - failed
    const uniqueUsers = new Set(logs.map((l) => l.username)).size

    return { total, success, failed, uniqueUsers }
  }, [logs])

  // Filtreleme
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Kategori Filtresi
      if (selectedCategory === "site" && !log.action.startsWith("SITE_")) return false
      if (selectedCategory === "user" && !log.action.startsWith("USER_")) return false
      if (
        selectedCategory === "security" &&
        !log.action.includes("SSL") &&
        !log.action.includes("KEY") &&
        !log.action.includes("DOMAIN") &&
        !log.action.includes("ACCESS")
      )
        return false
      if (
        selectedCategory === "failed" &&
        !(log.detail && log.detail.toUpperCase().includes("FAILED")) &&
        !log.action.toUpperCase().includes("FAIL")
      )
        return false

      // Arama Sorgusu
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchUser = log.username.toLowerCase().includes(q)
        const matchAction = log.action.toLowerCase().includes(q)
        const matchDetail = log.detail?.toLowerCase().includes(q) || false
        const matchTarget = log.targetId?.toLowerCase().includes(q) || false
        return matchUser || matchAction || matchDetail || matchTarget
      }

      return true
    })
  }, [logs, selectedCategory, searchQuery])

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="max-w-7xl mx-auto space-y-7 pb-12">
      {/* ═══ 1. ÜST BAŞLIK & YENİLE BUTONU ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-3.5">
          <div className="size-12 rounded-2xl bg-[#580619]/5 dark:bg-sky-500/10 border border-[#c8a87c]/30 dark:border-sky-500/30 flex items-center justify-center text-[#580619] dark:text-sky-400 shadow-2xs">
            <ShieldCheck className="size-6 text-[#580619] dark:text-sky-400" />
          </div>
          <div>
            <h1 className="font-heading text-2xl md:text-3xl font-extrabold tracking-tight text-[#580619] dark:text-slate-100">
              Denetim Günlüğü & Güvenlik İzleri
            </h1>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 font-sans mt-0.5">
              Panel üzerindeki tüm yönetimsel aktivitelerin ve kritik olayların kronolojik denetim kaydı.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-xs font-bold text-slate-700 dark:text-slate-300 shadow-2xs">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            {logs.length} Kayıt
          </span>

          <Button
            onClick={load}
            disabled={loading}
            className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs border border-slate-200 dark:border-slate-800 shadow-2xs hover:border-[#c8a87c] dark:hover:border-sky-500/50 transition-all flex items-center gap-2 h-9.5 px-3.5 rounded-xl cursor-pointer"
          >
            <RefreshCw className={cn("size-3.5 text-[#580619] dark:text-sky-400", loading && "animate-spin")} />
            Yenile
          </Button>
        </div>
      </div>

      {/* ═══ 2. İSTATİSTİK KARTLARI ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-2xs flex items-center gap-3.5">
          <div className="size-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300 shrink-0">
            <Activity className="size-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Toplam Olay</p>
            <p className="font-heading text-xl font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">{stats.total}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-2xs flex items-center gap-3.5">
          <div className="size-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <CheckCircle2 className="size-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Başarılı İşlem</p>
            <p className="font-heading text-xl font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">{stats.success}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-2xs flex items-center gap-3.5">
          <div className="size-10 rounded-xl bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
            <AlertTriangle className="size-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">Hata / Uyarı</p>
            <p className="font-heading text-xl font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">{stats.failed}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-2xs flex items-center gap-3.5">
          <div className="size-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <Users className="size-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Aktif Operatör</p>
            <p className="font-heading text-xl font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">{stats.uniqueUsers}</p>
          </div>
        </div>
      </div>

      {/* ═══ 3. ARAMA & KATEGORİ FİLTRELEME ÇUBUĞU ═══ */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
        {/* Arama Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Kullanıcı adı, eylem (SITE_CREATE), hedef veya detay ara..."
            className="pl-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-950 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 size-5 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Kategori Seçim Hapları */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {[
            { id: "all", label: "Tümü" },
            { id: "site", label: "Siteler" },
            { id: "user", label: "Kullanıcılar" },
            { id: "security", label: "Güvenlik & SSL" },
            { id: "failed", label: "Hatalı Olaylar" },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer",
                selectedCategory === cat.id
                  ? "bg-[#580619] dark:bg-sky-600 text-white shadow-xs"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ 4. LÜKS DENETİM TABLOSU ═══ */}
      <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="py-24 text-center space-y-3">
              <RefreshCw className="size-6 text-[#580619] dark:text-sky-400 animate-spin mx-auto" />
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400">Denetim kayıtları yükleniyor...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center space-y-3">
              <div className="size-12 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
                <AlertTriangle className="size-6" />
              </div>
              <p className="text-sm font-bold text-red-600 dark:text-red-400">{error}</p>
              <Button variant="outline" size="sm" onClick={load} className="rounded-xl">
                Tekrar Dene
              </Button>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <div className="size-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400 dark:text-slate-500">
                <Filter className="size-6" />
              </div>
              <p className="font-heading font-bold text-base text-slate-800 dark:text-slate-200">Kayıt Bulunamadı</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                {searchQuery || selectedCategory !== "all"
                  ? "Seçtiğiniz filtrelere veya arama sorgusuna uygun herhangi bir denetim kaydı bulunamadı."
                  : "Sistemde henüz kaydedilmiş bir denetim olayı yok."}
              </p>
              {(searchQuery || selectedCategory !== "all") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("")
                    setSelectedCategory("all")
                  }}
                  className="rounded-xl mt-2 text-xs"
                >
                  Filtreleri Sıfırla
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 text-[11px] font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase select-none">
                    <th className="py-3 px-4 font-mono">ZAMAN DAMGASI</th>
                    <th className="py-3 px-4">OPERATÖR</th>
                    <th className="py-3 px-4">EYLEM</th>
                    <th className="py-3 px-4">HEDEF & DETAY</th>
                    <th className="py-3 px-4 text-center">DURUM</th>
                    <th className="py-3 px-4 text-right">AYRINTI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredLogs.map((log) => {
                    const badge = getActionBadge(log.action)
                    const dateInfo = formatDate(log.createdAt)
                    const isFailed =
                      (log.detail && log.detail.toUpperCase().includes("FAILED")) ||
                      log.action.toUpperCase().includes("FAIL")

                    return (
                      <tr
                        key={log.id}
                        onClick={() => setSelectedLog(log)}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group cursor-pointer"
                      >
                        {/* 1. Zaman */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                              <Clock className="size-3 text-slate-400 dark:text-slate-500" />
                              {dateInfo.time}
                            </span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-sans mt-0.5">
                              {dateInfo.full} • {dateInfo.relative}
                            </span>
                          </div>
                        </td>

                        {/* 2. Operatör */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <div className="size-7 rounded-xl bg-[#580619]/10 dark:bg-sky-500/10 border border-[#c8a87c]/30 dark:border-sky-500/30 flex items-center justify-center font-heading font-bold text-[11px] text-[#580619] dark:text-sky-400">
                              {log.username.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 dark:text-slate-100">{log.username}</p>
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                                {log.userId ? log.userId.slice(0, 8) + "..." : "Sistem"}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* 3. Eylem */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl font-mono text-[11px] font-bold border",
                              badge.color
                            )}
                          >
                            <span className={cn("size-1.5 rounded-full", badge.dot)} />
                            {log.action}
                          </span>
                        </td>

                        {/* 4. Hedef & Detay */}
                        <td className="py-3.5 px-4 max-w-md">
                          <div className="space-y-1">
                            {log.targetType && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-600 dark:text-slate-300 mr-2 border border-slate-200 dark:border-slate-700">
                                {log.targetType}: {log.targetId || "—"}
                              </span>
                            )}
                            <p className="text-xs text-slate-700 dark:text-slate-300 font-sans truncate" title={log.detail || ""}>
                              {log.detail || "Ek ayrıntı yok"}
                            </p>
                          </div>
                        </td>

                        {/* 5. Durum */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          {isFailed ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-red-900 font-bold text-[10px]">
                              <AlertTriangle className="size-3 text-rose-600 dark:text-rose-400" />
                              BAŞARISIZ
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 font-bold text-[10px]">
                              <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400" />
                              BAŞARILI
                            </span>
                          )}
                        </td>

                        {/* 6. Ayrıntı Butonu */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedLog(log)
                            }}
                            className="size-7 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-400 group-hover:text-[#580619] dark:group-hover:text-sky-400 group-hover:border-[#c8a87c] dark:group-hover:border-sky-500 flex items-center justify-center transition-all cursor-pointer"
                          >
                            <ChevronRight className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ 5. AYRINTILI KAYIT DENETİM MODALI ═══ */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-xl bg-[#580619]/10 dark:bg-sky-500/10 text-[#580619] dark:text-sky-400 flex items-center justify-center">
                  <FileCode className="size-4.5 text-[#580619] dark:text-sky-400" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-base text-slate-900 dark:text-slate-100">
                    Denetim Kaydı Detayları
                  </h3>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">ID: {selectedLog.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="size-7 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-950/60 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Operatör</p>
                  <p className="font-bold text-slate-900 dark:text-slate-100 mt-0.5">{selectedLog.username}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Zaman Damgası</p>
                  <p className="font-mono text-slate-900 dark:text-slate-100 mt-0.5">{formatDate(selectedLog.createdAt).full} {formatDate(selectedLog.createdAt).time}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Eylem</p>
                  <p className="font-mono font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">{selectedLog.action}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Hedef Türü</p>
                  <p className="font-mono text-slate-900 dark:text-slate-100 mt-0.5">{selectedLog.targetType || "—"}</p>
                </div>
              </div>

              <div>
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">Açıklama ve Operasyon Detayı</p>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 font-mono text-xs break-all leading-relaxed">
                  {selectedLog.detail || "Detay bilgisi kaydedilmemiş."}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">Kayıt Verisi (JSON)</p>
                <div className="relative">
                  <pre className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/80 text-slate-800 dark:text-slate-200 font-mono text-[11px] overflow-x-auto max-h-48 border border-slate-200 dark:border-slate-800">
                    {JSON.stringify(selectedLog, null, 2)}
                  </pre>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(JSON.stringify(selectedLog, null, 2), "modal-json")}
                    className="absolute right-2.5 top-2.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-mono text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                  >
                    {copiedId === "modal-json" ? <Check className="size-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="size-3 text-slate-500" />}
                    Kopyala
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedLog(null)}
                className="rounded-xl px-4 text-xs font-semibold"
              >
                Kapat
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AuditPage() {
  return (
    <SuperAdminGate>
      <AuditContent />
    </SuperAdminGate>
  )
}