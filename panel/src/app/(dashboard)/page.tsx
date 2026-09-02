"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Activity, Cpu, HardDrive, MemoryStick, Plus, Server } from "lucide-react"
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
  return `${days} gun ${hours} saat`
}

function MetricBar({ icon: Icon, label, value }: { icon: any; label: string; value: number | undefined }) {
  const v = Math.max(0, Math.min(100, Math.round(value ?? 0)))
  const isHigh = v >= 75
  const isMed = v >= 45 && v < 75

  return (
    <div className="flex items-center gap-3 w-full">
      <div className="flex items-center gap-1.5 w-[72px] shrink-0">
        <Icon className="size-3.5 shrink-0" style={{ color: "#6b5540" }} />
        <span className="text-[12px] font-medium" style={{ color: "#a8896a" }}>{label}</span>
      </div>

      {/* Track */}
      <div
        className="relative flex-1 h-[9px] rounded-full overflow-hidden"
        style={{ background: "#100d0a", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.8)" }}
      >
        {/* Fill */}
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${v}%`,
            background: isHigh
              ? "linear-gradient(90deg, #5a0a0a 0%, #991b1b 60%, #ef4444 100%)"
              : isMed
              ? "linear-gradient(90deg, #78400a 0%, #b45309 60%, #f59e0b 100%)"
              : "linear-gradient(90deg, #3a3020 0%, #8a7250 60%, #c9a96e 100%)",
            boxShadow: isHigh
              ? "0 0 8px rgba(239,68,68,0.5)"
              : isMed
              ? "0 0 6px rgba(245,158,11,0.4)"
              : "0 0 6px rgba(201,169,110,0.35)",
          }}
        />
      </div>

      {/* Dot + % */}
      <div className="flex items-center gap-1.5 w-12 shrink-0 justify-end">
        <span
          className="size-[7px] rounded-full shrink-0"
          style={{
            background: isHigh ? "#ef4444" : isMed ? "#f59e0b" : "#c9a96e",
            boxShadow: isHigh ? "0 0 5px #ef4444" : isMed ? "0 0 5px #f59e0b" : "0 0 5px #c9a96e",
          }}
        />
        <span className="font-mono text-[12px] font-bold" style={{ color: "#f0e6d0" }}>{v}%</span>
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
      } catch { /* ignore */ }
    }
    loadStats()
    const iv = setInterval(loadStats, STATS_POLL_MS)
    return () => { cancelled = true; clearInterval(iv) }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadSites() {
      try {
        const res = await fetch("/api/sites", { cache: "no-store" })
        if (!res.ok) throw new Error("failed")
        const data = (await res.json()) as ApiSite[]
        if (!cancelled) setSites(data.map(apiSiteToUiSite))
      } catch { if (!cancelled) setSites([]) }
    }
    loadSites()
    return () => { cancelled = true }
  }, [])

  const loadPct = stats?.cpu.loadAvg?.[0]
    ? Math.min(100, Math.round((stats.cpu.loadAvg[0] / (stats.cpu.cores || 1)) * 100))
    : stats?.cpu.usedPercent ?? 0

  const serverInfo = [
    { label: "Sunucu adi", value: stats?.host.hostname ?? "—" },
    { label: "Isletim sistemi", value: stats?.host.platform ?? "—" },
    { label: "Calisma suresi", value: stats ? formatUptime(stats.host.uptimeSeconds) : "—" },
    { label: "IP adresi", value: stats?.host.ip ?? "—" },
  ]

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1
          className="font-heading text-[22px] font-bold tracking-[0.06em]"
          style={{ color: "#f0e6d0", textShadow: "0 1px 8px rgba(201,169,110,0.2)" }}
        >
          Anasayfa
        </h1>
        <p className="text-[12px] mt-0.5" style={{ color: "#5a4a38" }}>
          Sunucunuzun genel durumu ve siteleriniz.
        </p>
      </div>

      {/* Metrics Card */}
      <div
        className="rounded-xl flex flex-col lg:flex-row gap-5 p-5"
        style={{
          background: "#16110d",
          border: "1px solid rgba(201,169,110,0.14)",
          boxShadow: "0 2px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(201,169,110,0.06)",
        }}
      >
        {/* Left: 4 bars */}
        <div className="flex-1 flex flex-col gap-5 justify-center">
          <MetricBar icon={Cpu} label="CPU" value={stats?.cpu.usedPercent} />
          <MetricBar icon={MemoryStick} label="RAM" value={stats?.mem.usedPercent} />
          <MetricBar icon={HardDrive} label="Disk" value={stats?.disk.usedPercent} />
          <MetricBar icon={Activity} label="Yuk" value={loadPct} />
        </div>

        {/* Divider */}
        <div
          className="hidden lg:block w-px self-stretch"
          style={{ background: "rgba(201,169,110,0.1)" }}
        />

        {/* Right: Sunucu Bilgisi */}
        <div
          className="lg:w-60 shrink-0 rounded-lg p-4"
          style={{ background: "#110d0a", border: "1px solid rgba(201,169,110,0.1)" }}
        >
          <div className="flex items-center gap-2 mb-3 pb-2.5" style={{ borderBottom: "1px solid rgba(201,169,110,0.1)" }}>
            <Server className="size-3.5" style={{ color: "#6b5540" }} />
            <span
              className="font-heading text-[11px] font-semibold tracking-[0.15em]"
              style={{ color: "#c9a96e" }}
            >
              SUNUCU BILGISI
            </span>
          </div>
          <div className="space-y-2">
            {serverInfo.map((info) => (
              <div key={info.label} className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] shrink-0" style={{ color: "#5a4a38" }}>{info.label}</span>
                <span className="font-mono text-[11px] font-semibold text-right truncate" style={{ color: "#d4b896" }}>
                  {info.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Siteleriniz */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2
            className="font-heading text-[16px] font-semibold tracking-[0.05em]"
            style={{ color: "#f0e6d0" }}
          >
            Siteleriniz
          </h2>
          <Link
            href="/sites/new"
            className="flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-[11px] font-bold tracking-wider transition-all"
            style={{
              border: "1px solid rgba(201,169,110,0.25)",
              color: "#c9a96e",
              background: "rgba(201,169,110,0.04)",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = "rgba(201,169,110,0.1)"
              ;(e.currentTarget as HTMLElement).style.borderColor = "rgba(201,169,110,0.5)"
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = "rgba(201,169,110,0.04)"
              ;(e.currentTarget as HTMLElement).style.borderColor = "rgba(201,169,110,0.25)"
            }}
          >
            <Plus className="size-3.5" />
            YENI
          </Link>
        </div>

        {sites === null ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-xl"
                style={{ background: "#16110d", border: "1px solid rgba(201,169,110,0.08)" }}
              />
            ))}
          </div>
        ) : sites.length === 0 ? (
          <div
            className="rounded-xl min-h-[200px] flex flex-col items-center justify-center text-center gap-4 py-10"
            style={{
              background: "#13100c",
              border: "1px solid rgba(201,169,110,0.1)",
            }}
          >
            <p className="text-[12px]" style={{ color: "#4a3a2a" }}>
              Henuz bir site eklenmedi.
            </p>
            <Link
              href="/sites/new"
              className="flex items-center gap-2 h-9 px-5 rounded-lg text-[12px] font-bold transition-all"
              style={{
                background: "linear-gradient(135deg, #4a0a12 0%, #7f1d1d 50%, #5a0a10 100%)",
                border: "1px solid rgba(201,169,110,0.2)",
                color: "#f0e6d0",
                boxShadow: "0 0 16px rgba(139,26,42,0.3)",
              }}
            >
              <Plus className="size-3.5" />
              Ilk sitenizi ekleyin
            </Link>
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
