"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  Cpu,
  Globe,
  HardDrive,
  MemoryStick,
  Plus,
  Server,
  CheckCircle2,
  RotateCw,
  Network,
  Box,
  Radio,
  Layers,
  Search,
  ArrowRight,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { SiteCard } from "@/components/site-card"
import type { Site } from "@/lib/mock-data"
import { apiSiteToUiSite, type ApiSite } from "@/lib/site-adapter"
import { cn } from "@/lib/utils"

interface SystemStats {
  cpu: { usedPercent: number; cores: number; loadAvg: number[] }
  mem: { usedPercent: number; usedGB: number; totalGB: number }
  disk: { usedPercent: number; usedGB: number; totalGB: number }
  host: { hostname: string; platform: string; uptimeSeconds: number; ip: string }
}

interface UsedPort {
  port: number
  protocol: "tcp"
  address: string
  process: string | null
  source: "site" | "docker" | "system"
  label: string | null
}

interface PortsResponse {
  used: UsedPort[]
  suggestions: number[]
  suggestRange: { start: number; end: number }
}

const STATS_POLL_MS = 5000

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  return `${days} gün ${hours} saat`
}

function MetricCard({
  icon: Icon,
  title,
  mainValue,
  subValue,
  percentage,
}: {
  icon: any
  title: string
  mainValue: string
  subValue: string
  percentage: number
}) {
  const safePct = Math.max(0, Math.min(100, Math.round(percentage)))
  const isHigh = safePct >= 85
  const isWarning = safePct >= 70 && safePct < 85

  const statusConfig = isHigh
    ? {
        label: "Yüksek Yük",
        dotColor: "bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]",
        textColor: "text-red-700 dark:text-red-400 font-bold",
        pctColor: "text-red-600 dark:text-red-400 font-bold",
        barGradient: "linear-gradient(90deg, #ef4444 0%, #b91c1c 100%)",
        cardBorderHover: "hover:border-red-300 dark:hover:border-red-800",
      }
    : isWarning
    ? {
        label: "Orta Yük",
        dotColor: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]",
        textColor: "text-amber-700 dark:text-amber-400 font-semibold",
        pctColor: "text-amber-800 dark:text-amber-300 font-bold",
        barGradient: "linear-gradient(90deg, #f59e0b 0%, #d97706 100%)",
        cardBorderHover: "hover:border-amber-300 dark:hover:border-amber-800",
      }
    : {
        label: "Normal",
        dotColor: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]",
        textColor: "text-emerald-700 dark:text-emerald-400 font-medium",
        pctColor: "text-slate-800 dark:text-slate-200 font-bold",
        barGradient: "linear-gradient(90deg, #10b981 0%, #059669 100%)",
        cardBorderHover: "hover:border-[#c8a87c]/70 dark:hover:border-blue-500/50",
      }

  return (
    <div className={cn(
      "group relative rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)] transition-all duration-300 hover:shadow-[0_8px_24px_rgba(200,168,124,0.12)] dark:hover:shadow-[0_8px_24px_rgba(22,39,82,0.3)] flex flex-col justify-between overflow-hidden",
      statusConfig.cardBorderHover
    )}>
      <div>
        <div className="flex items-center justify-between gap-2 mb-3.5">
          <span className="font-heading text-[12px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            {title}
          </span>
          <div className="size-9 rounded-xl bg-[#580619]/5 dark:bg-[#101c38] border border-[#c8a87c]/30 dark:border-[#1e3568]/50 flex items-center justify-center text-[#580619] dark:text-blue-300 group-hover:bg-[#580619] dark:group-hover:bg-[#162752] group-hover:text-white group-hover:border-[#580619] dark:group-hover:border-[#2a4687] transition-all duration-300 shadow-sm">
            <Icon className="size-4.5" />
          </div>
        </div>

        <div className="flex items-baseline gap-2 mb-1.5">
          <span className="font-mono text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            {mainValue}
          </span>
        </div>

        <p className="font-mono text-xs font-medium text-slate-500 dark:text-slate-400 truncate mb-5">
          {subValue}
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between text-xs font-semibold mb-2 font-mono">
          <span className={cn("flex items-center gap-1.5", statusConfig.textColor)}>
            <span className={cn("size-2 rounded-full", statusConfig.dotColor)} />
            {statusConfig.label}
          </span>
          <span className={cn("text-sm", statusConfig.pctColor)}>
            {safePct}%
          </span>
        </div>

        <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800/80 overflow-hidden border border-slate-200/80 dark:border-slate-700/80 p-[1.5px] shadow-inner">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${safePct}%`,
              background: statusConfig.barGradient,
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [sites, setSites] = useState<Site[] | null>(null)
  const [ports, setPorts] = useState<UsedPort[] | null>(null)
  const [portFilter, setPortFilter] = useState<"all" | "site" | "docker" | "system">("all")
  const [refreshing, setRefreshing] = useState(false)

  const loadStats = async () => {
    try {
      const res = await fetch("/api/system/stats", { cache: "no-store" })
      if (!res.ok) return
      const data = (await res.json()) as SystemStats
      setStats(data)
    } catch {
      // ignore
    }
  }

  const loadSites = async () => {
    try {
      const res = await fetch("/api/sites", { cache: "no-store" })
      if (!res.ok) throw new Error("failed")
      const data = (await res.json()) as ApiSite[]
      setSites(data.map(apiSiteToUiSite))
    } catch {
      setSites([])
    }
  }

  const loadPorts = async () => {
    try {
      const res = await fetch("/api/system/ports", { cache: "no-store" })
      if (!res.ok) throw new Error("failed")
      const data = (await res.json()) as PortsResponse
      setPorts(data.used ?? [])
    } catch {
      setPorts([])
    }
  }

  useEffect(() => {
    loadStats()
    loadSites()
    loadPorts()
    const interval = setInterval(loadStats, STATS_POLL_MS)
    return () => clearInterval(interval)
  }, [])

  const handleManualRefresh = async () => {
    setRefreshing(true)
    await Promise.all([loadStats(), loadSites(), loadPorts()])
    setTimeout(() => setRefreshing(false), 500)
  }

  const serverInfo = [
    { label: "Sunucu Adı", value: stats?.host.hostname ?? "—" },
    { label: "İşletim Sistemi", value: stats?.host.platform ?? "—" },
    { label: "Çalışma Süresi", value: stats ? formatUptime(stats.host.uptimeSeconds) : "—" },
    { label: "IP Adresi", value: stats?.host.ip ?? "—" },
  ]

  const filteredPorts = (ports ?? []).filter((p) => {
    if (portFilter === "all") return true
    return p.source === portFilter
  })

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      {/* ═══ 1. ÜST BAŞLIK & AKSİYON ALANI ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-extrabold tracking-tight text-[#580619] dark:text-slate-100">
            Anasayfa
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-sans">
            Sunucunuzun gerçek zamanlı donanım telemetrisi, portları ve barındırılan web siteleriniz.
          </p>
        </div>

        {/* Hızlı Butonlar */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleManualRefresh}
            title="Yenile"
            className="size-9 rounded-xl border border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#090e1f] text-slate-600 dark:text-slate-300 hover:text-[#580619] dark:hover:text-blue-300 hover:border-[#c8a87c] dark:hover:border-[#2a4687] shadow-sm flex items-center justify-center transition-all cursor-pointer active:scale-95"
          >
            <RotateCw className={cn("size-4", refreshing && "animate-spin text-[#580619] dark:text-blue-300")} />
          </button>

          <Button
            asChild
            className="bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white font-semibold text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2 h-10 border border-[#c8a87c]/40 dark:border-[#2a4687]/60 hover:border-[#c8a87c] dark:hover:border-[#385db3] hover:scale-[1.02] cursor-pointer"
          >
            <Link href="/sites/new">
              <Plus className="size-4 text-[#dfc9a0] dark:text-white" />
              YENİ SİTE EKLE
            </Link>
          </Button>
        </div>
      </div>

      {/* ═══ 2. ÜST 4 TELEMETRİ KARTI ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* CPU Card */}
        {stats === null ? (
          <div className="h-48 rounded-2xl border border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-6 animate-pulse" />
        ) : (
          <MetricCard
            icon={Cpu}
            title="İşlemci (CPU)"
            mainValue={`${Math.round(stats.cpu.usedPercent)}%`}
            subValue={`${stats.cpu.cores} Çekirdek • Yük: ${(stats.cpu.loadAvg[0] ?? 0).toFixed(2)}`}
            percentage={stats.cpu.usedPercent}
          />
        )}

        {/* RAM Card */}
        {stats === null ? (
          <div className="h-48 rounded-2xl border border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-6 animate-pulse" />
        ) : (
          <MetricCard
            icon={MemoryStick}
            title="Bellek (RAM)"
            mainValue={`${Math.round(stats.mem.usedPercent)}%`}
            subValue={`${stats.mem.usedGB.toFixed(1)} GB / ${stats.mem.totalGB.toFixed(1)} GB`}
            percentage={stats.mem.usedPercent}
          />
        )}

        {/* Disk Card */}
        {stats === null ? (
          <div className="h-48 rounded-2xl border border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-6 animate-pulse" />
        ) : (
          <MetricCard
            icon={HardDrive}
            title="Depolama (Disk)"
            mainValue={`${Math.round(stats.disk.usedPercent)}%`}
            subValue={`${stats.disk.usedGB.toFixed(1)} GB / ${stats.disk.totalGB.toFixed(1)} GB`}
            percentage={stats.disk.usedPercent}
          />
        )}

        {/* Sunucu Bilgisi Card */}
        {stats === null ? (
          <div className="h-48 rounded-2xl border border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-6 animate-pulse" />
        ) : (
          <div className="group relative rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)] transition-all duration-300 hover:shadow-[0_8px_24px_rgba(200,168,124,0.12)] dark:hover:shadow-[0_8px_24px_rgba(22,39,82,0.3)] hover:border-[#c8a87c]/70 dark:hover:border-[#2a4687] flex flex-col justify-between overflow-hidden">
            <div>
              <div className="flex items-center justify-between gap-2 mb-3.5">
                <span className="font-heading text-[12px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Sunucu Bilgisi
                </span>
                <div className="size-9 rounded-xl bg-[#580619]/5 dark:bg-[#101c38] border border-[#c8a87c]/30 dark:border-[#1e3568]/50 flex items-center justify-center text-[#580619] dark:text-blue-300 group-hover:bg-[#580619] dark:group-hover:bg-[#162752] group-hover:text-white group-hover:border-[#580619] dark:group-hover:border-[#2a4687] transition-all duration-300 shadow-sm">
                  <Server className="size-4.5" />
                </div>
              </div>

              <div className="space-y-2 text-xs">
                {serverInfo.map((info) => (
                  <div key={info.label} className="flex items-center justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400 text-[11px] shrink-0 font-medium">
                      {info.label}:
                    </span>
                    <span className="font-mono text-slate-800 dark:text-slate-200 text-[11px] font-bold truncate text-right">
                      {info.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-3.5 border-t border-slate-100 dark:border-[#16223f] flex items-center justify-between text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                Sistem Aktif
              </span>
              <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">Port 3001</span>
            </div>
          </div>
        )}
      </div>

      {/* ═══ 3. KULLANILAN PORTLAR ALANI (DASHBOARD PORT MONİTÖRÜ) ═══ */}
      <div className="space-y-4 pt-1">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-xl font-extrabold text-[#580619] dark:text-slate-100 tracking-tight flex items-center gap-2">
              <Network className="size-5 text-[#c8a87c] dark:text-blue-300" />
              Kullanılan Portlar
            </h2>
            {ports !== null && (
              <span className="rounded-full bg-[#580619]/10 dark:bg-[#101c38] border border-[#580619]/20 dark:border-[#1e3568]/50 px-2.5 py-0.5 text-xs font-bold text-[#580619] dark:text-blue-300 font-mono">
                {ports.length} Aktif
              </span>
            )}
          </div>

          {/* Filtre Sekmeleri */}
          {ports && ports.length > 0 && (
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#070c1a] p-1 rounded-xl border border-slate-200/80 dark:border-[#16223f] text-xs font-medium">
              <button
                type="button"
                onClick={() => setPortFilter("all")}
                className={cn(
                  "px-3 py-1 rounded-lg transition-all cursor-pointer",
                  portFilter === "all"
                    ? "bg-white dark:bg-[#162752] text-[#580619] dark:text-white font-bold shadow-sm dark:border dark:border-[#2a4687]/60"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                )}
              >
                Tümü ({ports.length})
              </button>
              <button
                type="button"
                onClick={() => setPortFilter("site")}
                className={cn(
                  "px-3 py-1 rounded-lg transition-all cursor-pointer",
                  portFilter === "site"
                    ? "bg-white dark:bg-[#162752] text-[#580619] dark:text-white font-bold shadow-sm dark:border dark:border-[#2a4687]/60"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                )}
              >
                Siteler ({ports.filter((p) => p.source === "site").length})
              </button>
              <button
                type="button"
                onClick={() => setPortFilter("docker")}
                className={cn(
                  "px-3 py-1 rounded-lg transition-all cursor-pointer",
                  portFilter === "docker"
                    ? "bg-white dark:bg-[#162752] text-[#580619] dark:text-white font-bold shadow-sm dark:border dark:border-[#2a4687]/60"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                )}
              >
                Docker ({ports.filter((p) => p.source === "docker").length})
              </button>
              <button
                type="button"
                onClick={() => setPortFilter("system")}
                className={cn(
                  "px-3 py-1 rounded-lg transition-all cursor-pointer",
                  portFilter === "system"
                    ? "bg-white dark:bg-[#162752] text-[#580619] dark:text-white font-bold shadow-sm dark:border dark:border-[#2a4687]/60"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                )}
              >
                Sistem ({ports.filter((p) => p.source === "system").length})
              </button>
            </div>
          )}
        </div>

        {/* Port Kartları Grid Yapısı */}
        {ports === null ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-2xl border border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#090e1f]"
              />
            ))}
          </div>
        ) : ports.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-6 text-center text-xs text-slate-500 dark:text-slate-400">
            Sunucuda dinlenen aktif port bulunamadı.
          </div>
        ) : filteredPorts.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-6 text-center text-xs text-slate-500 dark:text-slate-400">
            Seçilen filtrede port bulunamadı.
          </div>
        ) : (
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredPorts.map((p) => (
              <div
                key={`${p.address}:${p.port}`}
                className="group relative flex items-center justify-between p-4 rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:border-[#c8a87c] dark:hover:border-[#2a4687] hover:shadow-md transition-all duration-200"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Port Numarası Rozeti */}
                  <div className="size-11 rounded-xl bg-[#580619]/5 dark:bg-[#101c38] border border-[#c8a87c]/30 dark:border-[#1e3568]/50 flex flex-col items-center justify-center text-[#580619] dark:text-blue-300 group-hover:bg-[#580619] dark:group-hover:bg-[#162752] group-hover:text-white transition-colors shrink-0">
                    <span className="font-mono text-[13px] font-extrabold leading-none">
                      {p.port}
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-wider opacity-80 mt-0.5">
                      {p.protocol}
                    </span>
                  </div>

                  {/* Servis & Kaynak Detayı */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight">
                        {p.label ?? p.process ?? "Sistem Süreci"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      {/* Kaynak Rozeti */}
                      {p.source === "site" && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-[#580619]/10 dark:bg-[#101c38] text-[#580619] dark:text-blue-300 border border-[#580619]/20 dark:border-[#1e3568]/50">
                          <Globe className="size-2.5" />
                          Site
                        </span>
                      )}
                      {p.source === "docker" && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 dark:bg-[#101c38] text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-[#1e3568]/50">
                          <Box className="size-2.5" />
                          Docker
                        </span>
                      )}
                      {p.source === "system" && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          <Server className="size-2.5" />
                          Sistem
                        </span>
                      )}

                      <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 truncate">
                        {p.address}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Canlı Dinleme Durumu */}
                <div className="shrink-0 pl-2">
                  <span
                    className="size-2 rounded-full bg-emerald-500 block shadow-[0_0_6px_rgba(16,185,129,0.5)]"
                    title="Dinleniyor (Listening)"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ 4. SİTELERİNİZ ALANI ═══ */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-xl font-extrabold text-[#580619] dark:text-slate-100 tracking-tight">
              Siteleriniz
            </h2>
            {sites !== null && (
              <span className="rounded-full bg-[#580619]/10 dark:bg-[#101c38] border border-[#580619]/20 dark:border-[#1e3568]/50 px-2.5 py-0.5 text-xs font-bold text-[#580619] dark:text-blue-300 font-mono">
                {sites.length}
              </span>
            )}
          </div>

          <Link
            href="/sites"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#580619] dark:text-blue-300 hover:text-[#720a22] dark:hover:text-white transition-colors group px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#090e1f] hover:border-[#c8a87c] dark:hover:border-[#2a4687] shadow-2xs"
          >
            Tüm Siteleri Yönet
            <ArrowRight className="size-3.5 text-[#c8a87c] dark:text-blue-300 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Siteler Konteyneri */}
        {sites === null ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-36 animate-pulse rounded-2xl border border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#090e1f]"
              />
            ))}
          </div>
        ) : sites.length === 0 ? (
          /* Sade & Şık Boş Durum Alanı */
          <div className="rounded-3xl border border-slate-200/90 dark:border-[#16223f] bg-gradient-to-b from-white dark:from-[#090e1f] via-slate-50/40 dark:via-[#070b18] to-white dark:to-[#090e1f] p-10 md:p-14 shadow-sm flex flex-col items-center justify-center text-center relative overflow-hidden">
            {/* Ortada Parlayan Dümen Amblemi */}
            <div className="relative size-20 rounded-2xl bg-gradient-to-b from-[#580619]/10 to-[#580619]/5 dark:from-[#101c38] dark:to-[#090e1f] border-2 border-[#c8a87c]/40 dark:border-[#1e3568]/50 flex items-center justify-center p-4 mb-5 shadow-inner group">
              <Image
                src="/rudder-helm-transparent.png"
                alt="Rudder Dümen"
                width={52}
                height={52}
                className="object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition-transform duration-700 group-hover:rotate-180"
              />
            </div>

            <h3 className="font-heading text-xl md:text-2xl font-extrabold text-slate-800 dark:text-slate-100 mb-2 tracking-tight">
              Henüz bir site eklenmedi.
            </h3>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 max-w-md mb-7 font-sans leading-relaxed">
              Sunucunuzda yeni bir WordPress, Node.js, Python veya statik web sitesi yayına alarak self-hosting deneyiminizi başlatın.
            </p>

            <Button
              asChild
              className="bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white font-bold text-xs uppercase tracking-wider px-8 py-3 rounded-xl shadow-lg transition-all flex items-center gap-2.5 h-12 hover:scale-[1.03] border border-[#c8a87c]/50 dark:border-[#2a4687]/60"
            >
              <Link href="/sites/new">
                <Plus className="size-4.5 text-[#dfc9a0] dark:text-white" />
                İLK SİTENİZİ EKLEYİN
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {sites.map((site) => (
              <SiteCard key={site.id} site={site} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}