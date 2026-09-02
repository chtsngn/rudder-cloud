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
  Activity,
  CheckCircle2,
  RotateCw,
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
  const isHigh = safePct >= 80

  return (
    <div className="group relative rounded-2xl border border-slate-200/90 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] transition-all duration-300 hover:shadow-[0_8px_24px_rgba(200,168,124,0.12)] hover:border-[#c8a87c]/70 flex flex-col justify-between overflow-hidden">
      {/* Top Header: Title & Relevant Tech Icon */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-3.5">
          <span className="font-heading text-[12px] font-bold uppercase tracking-wider text-slate-600">
            {title}
          </span>
          <div className="size-9 rounded-xl bg-[#580619]/5 border border-[#c8a87c]/30 flex items-center justify-center text-[#580619] group-hover:bg-[#580619] group-hover:text-white group-hover:border-[#580619] transition-all duration-300 shadow-sm">
            <Icon className="size-4.5" />
          </div>
        </div>

        {/* Main Metric Value */}
        <div className="flex items-baseline gap-2 mb-1.5">
          <span className="font-mono text-3xl font-extrabold tracking-tight text-slate-900">
            {mainValue}
          </span>
        </div>

        {/* Subtext info */}
        <p className="font-mono text-xs font-medium text-slate-500 truncate mb-5">
          {subValue}
        </p>
      </div>

      {/* Recessed Progress Gauge */}
      <div>
        <div className="flex items-center justify-between text-xs font-semibold mb-2 font-mono">
          <span className="flex items-center gap-1.5 text-slate-600">
            <span
              className={cn(
                "size-2 rounded-full",
                isHigh ? "bg-red-500 animate-pulse" : "bg-emerald-500"
              )}
            />
            {isHigh ? "Yüksek Yük" : "Normal"}
          </span>
          <span className={cn("font-bold text-sm", isHigh ? "text-red-600" : "text-[#580619]")}>
            {safePct}%
          </span>
        </div>

        {/* Bar */}
        <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden border border-slate-200/80 p-[1.5px] shadow-inner">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700",
              isHigh
                ? "bg-gradient-to-r from-red-600 to-red-700 shadow-[0_0_8px_rgba(220,38,38,0.5)]"
                : "bg-gradient-to-r from-[#580619] via-[#86102e] to-[#c8a87c]"
            )}
            style={{ width: `${safePct}%` }}
          />
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [sites, setSites] = useState<Site[] | null>(null)
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

  useEffect(() => {
    loadStats()
    loadSites()
    const interval = setInterval(loadStats, STATS_POLL_MS)
    return () => clearInterval(interval)
  }, [])

  const handleManualRefresh = async () => {
    setRefreshing(true)
    await Promise.all([loadStats(), loadSites()])
    setTimeout(() => setRefreshing(false), 500)
  }

  const serverInfo = [
    { label: "Sunucu Adı", value: stats?.host.hostname ?? "—" },
    { label: "İşletim Sistemi", value: stats?.host.platform ?? "—" },
    { label: "Çalışma Süresi", value: stats ? formatUptime(stats.host.uptimeSeconds) : "—" },
    { label: "IP Adresi", value: stats?.host.ip ?? "—" },
  ]

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      {/* ═══ 1. ÜST BAŞLIK & AKSİYON ALANI ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-200/80">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-extrabold tracking-tight text-[#580619]">
            Anasayfa
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-sans">
            Sunucunuzun gerçek zamanlı donanım telemetrisi ve barındırılan web siteleriniz.
          </p>
        </div>

        {/* Hızlı Butonlar */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleManualRefresh}
            title="Yenile"
            className="size-9 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-[#580619] hover:border-[#c8a87c] shadow-sm flex items-center justify-center transition-all cursor-pointer active:scale-95"
          >
            <RotateCw className={cn("size-4", refreshing && "animate-spin text-[#580619]")} />
          </button>

          <Button
            asChild
            className="bg-[#580619] hover:bg-[#720a22] text-white font-semibold text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2 h-10 border border-[#c8a87c]/40 hover:border-[#c8a87c] hover:scale-[1.02] cursor-pointer"
          >
            <Link href="/sites/new">
              <Plus className="size-4 text-[#dfc9a0]" />
              YENİ SİTE EKLE
            </Link>
          </Button>
        </div>
      </div>

      {/* ═══ 2. ÜST 4 TELEMETRİ KARTI ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* CPU Card */}
        {stats === null ? (
          <div className="h-48 rounded-2xl border border-slate-200 bg-white p-6 animate-pulse" />
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
          <div className="h-48 rounded-2xl border border-slate-200 bg-white p-6 animate-pulse" />
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
          <div className="h-48 rounded-2xl border border-slate-200 bg-white p-6 animate-pulse" />
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
          <div className="h-48 rounded-2xl border border-slate-200 bg-white p-6 animate-pulse" />
        ) : (
          <div className="group relative rounded-2xl border border-slate-200/90 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] transition-all duration-300 hover:shadow-[0_8px_24px_rgba(200,168,124,0.12)] hover:border-[#c8a87c]/70 flex flex-col justify-between overflow-hidden">
            <div>
              <div className="flex items-center justify-between gap-2 mb-3.5">
                <span className="font-heading text-[12px] font-bold uppercase tracking-wider text-slate-600">
                  Sunucu Bilgisi
                </span>
                <div className="size-9 rounded-xl bg-[#580619]/5 border border-[#c8a87c]/30 flex items-center justify-center text-[#580619] group-hover:bg-[#580619] group-hover:text-white group-hover:border-[#580619] transition-all duration-300 shadow-sm">
                  <Server className="size-4.5" />
                </div>
              </div>

              <div className="space-y-2 text-xs">
                {serverInfo.map((info) => (
                  <div key={info.label} className="flex items-center justify-between gap-2">
                    <span className="text-slate-500 text-[11px] shrink-0 font-medium">
                      {info.label}:
                    </span>
                    <span className="font-mono text-slate-800 text-[11px] font-bold truncate text-right">
                      {info.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-emerald-700 font-semibold">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-emerald-600" />
                Sistem Aktif
              </span>
              <span className="font-mono text-[10px] text-slate-400">Port 3001</span>
            </div>
          </div>
        )}
      </div>

      {/* ═══ 3. SİTELERİNİZ ALANI ═══ */}
      <div className="space-y-5 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-xl font-extrabold text-[#580619] tracking-tight">
              Siteleriniz
            </h2>
            {sites !== null && (
              <span className="rounded-full bg-[#580619]/10 border border-[#580619]/20 px-2.5 py-0.5 text-xs font-bold text-[#580619] font-mono">
                {sites.length}
              </span>
            )}
          </div>
        </div>

        {/* Siteler Konteyneri */}
        {sites === null ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-white"
              />
            ))}
          </div>
        ) : sites.length === 0 ? (
          /* Sade & Şık Boş Durum Alanı */
          <div className="rounded-3xl border border-slate-200/90 bg-gradient-to-b from-white via-slate-50/40 to-white p-10 md:p-14 shadow-sm flex flex-col items-center justify-center text-center relative overflow-hidden">
            {/* Ortada Parlayan Dümen Amblemi */}
            <div className="relative size-20 rounded-2xl bg-gradient-to-b from-[#580619]/10 to-[#580619]/5 border-2 border-[#c8a87c]/40 flex items-center justify-center p-4 mb-5 shadow-inner group">
              <Image
                src="/rudder-helm-transparent.png"
                alt="Rudder Dümen"
                width={52}
                height={52}
                className="object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition-transform duration-700 group-hover:rotate-180"
              />
            </div>

            <h3 className="font-heading text-xl md:text-2xl font-extrabold text-slate-800 mb-2 tracking-tight">
              Henüz bir site eklenmedi.
            </h3>
            <p className="text-xs md:text-sm text-slate-500 max-w-md mb-7 font-sans leading-relaxed">
              Sunucunuzda yeni bir WordPress, Node.js, Python veya statik web sitesi yayına alarak self-hosting deneyiminizi başlatın.
            </p>

            <Button
              asChild
              className="bg-[#580619] hover:bg-[#720a22] text-white font-bold text-xs uppercase tracking-wider px-8 py-3 rounded-xl shadow-lg transition-all flex items-center gap-2.5 h-12 hover:scale-[1.03] border border-[#c8a87c]/50"
            >
              <Link href="/sites/new">
                <Plus className="size-4.5 text-[#dfc9a0]" />
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