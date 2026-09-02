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

// Progress bar — görsele birebir: düşük=metalik gümüş, yüksek=koyu kırmızıdan parlak kırmızıya
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
  const isHigh = safeVal >= 75
  const dotColor = isHigh ? "bg-red-500" : "bg-emerald-400"

  return (
    <div className="flex items-center gap-2.5 w-full">
      {/* Icon + Label — tam görseldeki gibi solda */}
      <div className="flex items-center gap-1.5 w-14 shrink-0">
        <Icon className="size-3.5 text-zinc-500 shrink-0" />
        <span className="text-[12px] font-medium text-zinc-300">{label}</span>
      </div>

      {/* Track: görseldeki koyu derin oluk */}
      <div
        className="relative flex-1 h-[10px] rounded-full overflow-hidden"
        style={{ background: "#111318", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.8)" }}
      >
        {/* Fill — görseldekiyle aynı: gri metalik veya kırmızı parlayan */}
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700",
            isHigh
              ? "bg-gradient-to-r from-[#3d0a0a] via-[#b91c1c] to-[#ef4444]"
              : "bg-gradient-to-r from-[#3a3d48] via-[#6b7280] to-[#9ca3af]"
          )}
          style={{
            width: `${safeVal}%`,
            boxShadow: isHigh
              ? "0 0 10px rgba(239,68,68,0.6), 0 0 20px rgba(239,68,68,0.25)"
              : "0 0 6px rgba(156,163,175,0.3)",
          }}
        />
      </div>

      {/* Dot + % */}
      <div className="flex items-center gap-1.5 w-12 shrink-0 justify-end">
        <span
          className={cn("size-[7px] rounded-full shrink-0", dotColor)}
          style={{ boxShadow: isHigh ? "0 0 5px #ef4444" : "0 0 5px #34d399" }}
        />
        <span className="font-mono text-[12px] font-bold text-zinc-200">{safeVal}%</span>
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
        // sessizce geç
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
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ─── Başlık ─── */}
      <div>
        <h1 className="font-heading text-[22px] font-bold tracking-tight text-white">
          Anasayfa
        </h1>
        <p className="text-[12px] text-zinc-500 mt-0.5">
          Sunucunuzun genel durumu ve siteleriniz.
        </p>
      </div>

      {/* ─── Metrik + Sunucu Bilgisi Kartı ─── */}
      {/* Görseldeki gibi: tek geniş koyu yuvarlak köşeli kart */}
      <div
        className="rounded-2xl border border-white/[0.06] p-5"
        style={{ background: "#1e2026" }}
      >
        <div className="flex flex-col lg:flex-row gap-6 items-stretch">
          {/* Sol: 2x2 metrik grid */}
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-5 items-center">
            <MetricProgressBar icon={Cpu} label="CPU" value={stats?.cpu.usedPercent} />
            <MetricProgressBar icon={HardDrive} label="Disk" value={stats?.disk.usedPercent} />
            <MetricProgressBar icon={MemoryStick} label="RAM" value={stats?.mem.usedPercent} />
            <MetricProgressBar icon={Activity} label="Yük" value={loadPercentage} />
          </div>

          {/* Dikey ayırıcı — yalnızca geniş ekranda */}
          <div className="hidden lg:block w-px bg-white/[0.06] self-stretch" />

          {/* Sağ: Sunucu Bilgisi kutusu — görseldeki gibi daha koyu iç kutu */}
          <div
            className="lg:w-64 shrink-0 rounded-xl border border-white/[0.06] p-4"
            style={{ background: "#171920" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Server className="size-3.5 text-zinc-500" />
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">
                Sunucu Bilgisi
              </span>
            </div>
            <div className="space-y-2">
              {serverInfo.map((info) => (
                <div key={info.label} className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] text-zinc-500 shrink-0">{info.label}</span>
                  <span className="font-mono text-[11px] font-semibold text-zinc-200 text-right truncate">
                    {info.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Siteleriniz ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-[17px] font-bold text-white tracking-tight">
            Siteleriniz
          </h2>
          {/* + YENİ butonu — görseldekiyle aynı: sağ üstte sade ghost pill */}
          <Button
            asChild
            size="sm"
            className="h-8 px-4 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] text-zinc-300 hover:text-white text-[11px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5"
          >
            <Link href="/sites/new">
              <Plus className="size-3.5" />
              YENİ
            </Link>
          </Button>
        </div>

        {sites === null ? (
          /* Yükleniyor iskelet */
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-xl border border-white/[0.05]"
                style={{ background: "#1e2026" }}
              />
            ))}
          </div>
        ) : sites.length === 0 ? (
          /* Boş durum — görseldekiyle birebir: devre desenli koyu alan + kırmızı buton */
          <div
            className="relative rounded-2xl border border-white/[0.06] bg-circuit-overlay overflow-hidden min-h-[200px] flex flex-col items-center justify-center text-center gap-4 py-12"
            style={{ background: "#1a1c22" }}
          >
            <p className="text-[12px] text-zinc-500 relative z-10">
              Henüz bir site eklenmedi.
            </p>
            <Button
              asChild
              className="relative z-10 h-9 px-5 rounded-lg text-[12px] font-bold text-white flex items-center gap-2 transition-all hover:scale-[1.03]"
              style={{
                background: "linear-gradient(135deg, #5a0a12 0%, #991b1b 50%, #7f1d1d 100%)",
                border: "1px solid rgba(239,68,68,0.5)",
                boxShadow: "0 0 18px rgba(239,68,68,0.35)",
              }}
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
