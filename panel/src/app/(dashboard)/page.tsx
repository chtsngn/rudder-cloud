"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  Activity,
  Cpu,
  HardDrive,
  MemoryStick,
  Plus,
  Server,
  Layers,
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

function StatCard({
  icon: Icon,
  title,
  value,
  subtext,
  percentage,
  colorScheme = "burgundy",
}: {
  icon: any
  title: string
  value: string
  subtext: string
  percentage: number
  colorScheme?: "burgundy" | "bronze"
}) {
  const safePct = Math.max(0, Math.min(100, Math.round(percentage)))
  const isHigh = safePct >= 80

  return (
    <div className="group relative rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:border-slate-300 overflow-hidden flex flex-col justify-between">
      {/* Top Nautical Accent Line */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 h-[3px] transition-all",
          colorScheme === "bronze"
            ? "bg-gradient-to-r from-[#c8a87c] via-[#b8956a] to-[#c8a87c]"
            : "bg-gradient-to-r from-[#2e0911] via-[#4a0e1c] to-[#2e0911]"
        )}
      />

      {/* Header with Icon and Title */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 font-sans">
            {title}
          </span>
          <div className="size-8 rounded-lg bg-[#2e0911]/5 flex items-center justify-center text-[#2e0911] group-hover:bg-[#2e0911]/10 transition-colors">
            <Icon className="size-4" />
          </div>
        </div>

        {/* Main Stat Value */}
        <div className="mb-1">
          <span className="font-mono text-3xl font-bold tracking-tight text-slate-800">
            {value}
          </span>
        </div>

        {/* Subtext */}
        <p className="text-xs font-medium text-slate-500 truncate mb-4">
          {subtext}
        </p>
      </div>

      {/* Progress Meter Bar */}
      <div>
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1.5 font-mono">
          <span>Kullanım</span>
          <span className={cn(isHigh ? "text-red-600 font-bold" : "text-slate-700")}>
            {safePct}%
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden p-[1px] border border-slate-200/60">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              isHigh
                ? "bg-gradient-to-r from-red-600 to-red-700"
                : colorScheme === "bronze"
                ? "bg-gradient-to-r from-[#b8956a] to-[#c8a87c]"
                : "bg-gradient-to-r from-[#4a0e1c] to-[#2e0911]"
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

  useEffect(() => {
    let cancelled = false

    async function loadStats() {
      try {
        const res = await fetch("/api/system/stats", { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as SystemStats
        if (!cancelled) setStats(data)
      } catch {
        // ignore
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

  const serverInfo = [
    { label: "Sunucu Adı", value: stats?.host.hostname ?? "—" },
    { label: "İşletim Sistemi", value: stats?.host.platform ?? "—" },
    { label: "Çalışma Süresi", value: stats ? formatUptime(stats.host.uptimeSeconds) : "—" },
    { label: "IP Adresi", value: stats?.host.ip ?? "—" },
  ]

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-wide text-[#2e0911]">
            Anasayfa
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-sans">
            Sunucunuzun genel durumu ve yönetilen siteleriniz.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            asChild
            className="bg-[#2e0911] hover:bg-[#4a0e1c] text-white font-semibold text-xs uppercase tracking-wider px-4 py-2 rounded-lg shadow-sm transition-all flex items-center gap-1.5 h-9"
          >
            <Link href="/sites/new">
              <Plus className="size-4" />
              YENİ SİTE EKLE
            </Link>
          </Button>
        </div>
      </div>

      {/* 4 Balanced Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* CPU Card */}
        {stats === null ? (
          <div className="h-44 rounded-xl border border-slate-200 bg-white p-5 animate-pulse" />
        ) : (
          <StatCard
            icon={Cpu}
            title="CPU Kullanımı"
            value={`${Math.round(stats.cpu.usedPercent)}%`}
            subtext={`${stats.cpu.cores} Çekirdek • Yük: ${(stats.cpu.loadAvg[0] ?? 0).toFixed(2)}`}
            percentage={stats.cpu.usedPercent}
            colorScheme="burgundy"
          />
        )}

        {/* RAM Card */}
        {stats === null ? (
          <div className="h-44 rounded-xl border border-slate-200 bg-white p-5 animate-pulse" />
        ) : (
          <StatCard
            icon={MemoryStick}
            title="RAM Kullanımı"
            value={`${Math.round(stats.mem.usedPercent)}%`}
            subtext={`${stats.mem.usedGB.toFixed(1)} GB / ${stats.mem.totalGB.toFixed(1)} GB`}
            percentage={stats.mem.usedPercent}
            colorScheme="bronze"
          />
        )}

        {/* Disk Card */}
        {stats === null ? (
          <div className="h-44 rounded-xl border border-slate-200 bg-white p-5 animate-pulse" />
        ) : (
          <StatCard
            icon={HardDrive}
            title="Disk Kullanımı"
            value={`${Math.round(stats.disk.usedPercent)}%`}
            subtext={`${stats.disk.usedGB.toFixed(1)} GB / ${stats.disk.totalGB.toFixed(1)} GB`}
            percentage={stats.disk.usedPercent}
            colorScheme="burgundy"
          />
        )}

        {/* Sunucu Bilgisi Card */}
        {stats === null ? (
          <div className="h-44 rounded-xl border border-slate-200 bg-white p-5 animate-pulse" />
        ) : (
          <div className="relative rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:border-slate-300 overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#c8a87c] via-[#2e0911] to-[#c8a87c]" />
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 font-sans">
                  Sunucu Bilgisi
                </span>
                <div className="size-8 rounded-lg bg-[#2e0911]/5 flex items-center justify-center text-[#2e0911]">
                  <Server className="size-4" />
                </div>
              </div>

              <div className="space-y-2 text-xs">
                {serverInfo.map((info) => (
                  <div key={info.label} className="flex items-center justify-between gap-2">
                    <span className="text-slate-500 text-[11px] shrink-0 font-medium">
                      {info.label}:
                    </span>
                    <span className="font-mono text-slate-800 text-[11px] font-semibold truncate text-right">
                      {info.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Siteleriniz Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h2 className="font-heading text-lg font-bold text-[#2e0911] tracking-wide">
              Siteleriniz
            </h2>
            {sites !== null && (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                {sites.length}
              </span>
            )}
          </div>
        </div>

        {/* Sites Container */}
        {sites === null ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white"
              />
            ))}
          </div>
        ) : sites.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 shadow-sm flex flex-col items-center justify-center text-center">
            {/* Helm Watermark / Emblem Icon */}
            <div className="size-16 rounded-2xl bg-[#2e0911]/5 border border-[#2e0911]/10 flex items-center justify-center p-3 mb-4 shadow-inner">
              <Image
                src="/rudder-helm-transparent.png"
                alt="Rudder Helm"
                width={40}
                height={40}
                className="object-contain"
              />
            </div>

            <h3 className="font-heading text-lg font-bold text-slate-800 mb-1">
              Henüz bir site eklenmedi.
            </h3>
            <p className="text-xs text-slate-500 max-w-md mb-6 font-sans">
              Sunucunuzda yeni bir WordPress, Node.js, Python veya statik web sitesi yayına alarak self-hosting deneyiminizi başlatın.
            </p>

            <Button
              asChild
              className="bg-[#2e0911] hover:bg-[#4a0e1c] text-white font-semibold text-xs tracking-wider px-5 py-2.5 rounded-lg shadow-sm transition-all flex items-center gap-2 h-10 hover:scale-[1.02]"
            >
              <Link href="/sites/new">
                <Plus className="size-4" />
                İlk sitenizi ekleyin
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