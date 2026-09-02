"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Activity,
  Cpu,
  HardDrive,
  MemoryStick,
  Plus,
  Server,
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

function MetricProgressBar({
  icon: Icon,
  label,
  value,
}: {
  icon: any
  label: string
  value: number | undefined
}) {
  const safeVal = Math.max(0, Math.min(100, Math.round(value ?? 0)))
  
  // Status dot color based on threshold
  const isHigh = safeVal >= 80
  const isMedium = safeVal >= 50 && safeVal < 80
  
  return (
    <div className="flex items-center gap-3 w-full">
      {/* Icon + Label */}
      <div className="flex items-center gap-1.5 w-16 shrink-0 text-zinc-300 font-medium text-xs">
        <Icon className="size-3.5 text-zinc-400 shrink-0" />
        <span>{label}</span>
      </div>

      {/* Metallic Groove Progress Bar */}
      <div className="relative flex-1 h-3 rounded-full bg-[#0d0e12] border border-white/[0.08] shadow-inner p-[1.5px] overflow-hidden">
        {/* Fill */}
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 shadow-sm",
            isHigh
              ? "bg-gradient-to-r from-zinc-300 via-rose-500 to-red-600 shadow-[0_0_8px_rgba(220,38,38,0.5)]"
              : isMedium
              ? "bg-gradient-to-r from-zinc-400 via-zinc-200 to-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.4)]"
              : "bg-gradient-to-r from-zinc-400 via-zinc-200 to-zinc-100 shadow-[0_0_6px_rgba(255,255,255,0.3)]"
          )}
          style={{ width: `${safeVal}%` }}
        />
      </div>

      {/* Status Dot + Percentage */}
      <div className="flex items-center justify-end gap-1.5 w-14 shrink-0">
        <span
          className={cn(
            "size-2 rounded-full shrink-0 shadow-sm",
            isHigh
              ? "bg-red-500 shadow-[0_0_6px_#ef4444]"
              : isMedium
              ? "bg-amber-400 shadow-[0_0_6px_#f59e0b]"
              : "bg-emerald-400 shadow-[0_0_6px_#10b981]"
          )}
        />
        <span className="font-mono text-xs font-bold text-white text-right">
          {safeVal}%
        </span>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [sites, setSites] = useState<Site[] | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadStats() {
      try {
        const res = await fetch("/api/system/stats", { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as SystemStats
        if (!cancelled) setStats(data)
      } catch {
        // Sessizce geç
      }
    }

    loadStats()
    const interval = setInterval(loadStats, STATS_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadSites() {
      try {
        const res = await fetch("/api/sites", { cache: "no-store" })
        if (!res.ok) throw new Error("failed")
        const data = (await res.json()) as ApiSite[]
        if (!cancelled) setSites(data.map(apiSiteToUiSite))
      } catch {
        if (!cancelled) setSites([])
      }
    }

    loadSites()
    return () => {
      cancelled = true
    }
  }, [])

  // Calculate normalized CPU load percentage
  const loadPercentage = stats?.cpu.loadAvg?.[0]
    ? Math.min(100, Math.round((stats.cpu.loadAvg[0] / (stats.cpu.cores || 1)) * 100))
    : stats?.cpu.usedPercent ?? 0

  const serverInfo = [
    { label: "Sunucu adı", value: stats?.host.hostname ?? "—" },
    { label: "İşletim sistemi", value: stats?.host.platform ?? "—" },
    { label: "Çalışma süresi", value: stats ? formatUptime(stats.host.uptimeSeconds) : "—" },
    { label: "IP adresi", value: stats?.host.ip ?? "—" },
  ]

  return (
    <div className="space-y-7 max-w-7xl mx-auto">
      {/* Page Title & Subtitle */}
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-white">
          Anasayfa
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Sunucunuzun genel durumu ve siteleriniz.
        </p>
      </div>

      {/* Top Combined Telemetry & Sunucu Bilgisi Card */}
      <div className="relative rounded-2xl border border-white/[0.08] bg-[#14151b]/95 p-5 shadow-2xl backdrop-blur-md overflow-hidden">
        {/* Subtle top red ambient line */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-red-500/30 to-transparent" />
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Left: 4 Telemetry Progress Bars (2x2 Grid) */}
          <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
            <MetricProgressBar
              icon={Cpu}
              label="CPU"
              value={stats?.cpu.usedPercent}
            />
            <MetricProgressBar
              icon={HardDrive}
              label="Disk"
              value={stats?.disk.usedPercent}
            />
            <MetricProgressBar
              icon={MemoryStick}
              label="RAM"
              value={stats?.mem.usedPercent}
            />
            <MetricProgressBar
              icon={Activity}
              label="Yük"
              value={loadPercentage}
            />
          </div>

          {/* Right: Sunucu Bilgisi Box */}
          <div className="lg:col-span-4 rounded-xl border border-white/[0.06] bg-[#191b22]/70 p-4 shadow-inner">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/[0.06]">
              <Server className="size-3.5 text-zinc-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                Sunucu Bilgisi
              </span>
            </div>
            <div className="space-y-1.5">
              {serverInfo.map((info) => (
                <div
                  key={info.label}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-zinc-400 text-[11px]">{info.label}</span>
                  <span className="font-mono font-medium text-zinc-200 text-[11px]">
                    {info.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Siteleriniz Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold text-white tracking-tight">
            Siteleriniz
          </h2>
          <Button
            asChild
            size="sm"
            className="border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20 text-zinc-200 hover:text-white px-3.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-1.5 h-8"
          >
            <Link href="/sites/new">
              <Plus className="size-3.5" />
              YENİ
            </Link>
          </Button>
        </div>

        {/* Sites Container */}
        {sites === null ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-xl border border-white/[0.06] bg-[#14151b]"
              />
            ))}
          </div>
        ) : sites.length === 0 ? (
          <div className="relative rounded-2xl border border-white/[0.08] bg-[#14151b]/85 p-10 shadow-2xl overflow-hidden bg-circuit-overlay min-h-[220px] flex flex-col items-center justify-center text-center">
            {/* Ambient Red Center Glow */}
            <div className="pointer-events-none absolute inset-0 bg-radial-gradient from-red-600/5 via-transparent to-transparent" />
            
            <p className="text-xs font-medium text-zinc-400 mb-4 relative z-10">
              Henüz bir site eklenmedi.
            </p>
            <Button
              asChild
              className="relative z-10 bg-gradient-to-r from-red-950 via-red-900 to-red-950 border border-red-600/60 hover:border-red-500 text-white font-semibold text-xs px-5 py-2.5 rounded-lg shadow-[0_0_16px_rgba(220,38,38,0.3)] hover:shadow-[0_0_24px_rgba(220,38,38,0.5)] transition-all flex items-center gap-2 hover:scale-[1.02]"
            >
              <Link href="/sites/new">
                <Plus className="size-3.5" />
                İlk sitenizi ekleyin
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sites.map((site) => (
              <SiteCard key={site.id} site={site} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
