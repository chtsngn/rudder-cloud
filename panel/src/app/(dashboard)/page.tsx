"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Cpu, HardDrive, MemoryStick, Plus, Server } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SiteCard } from "@/components/site-card"
import { StatMeter } from "@/components/stat-meter"
import type { Site } from "@/lib/mock-data"
import { apiSiteToUiSite, type ApiSite } from "@/lib/site-adapter"

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
        // Bir sonraki periyodik denemede tekrar çekilecek; sessizce geç.
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

  const serverStats = [
    { label: "CPU Kullanımı", value: stats?.cpu.usedPercent, icon: Cpu },
    { label: "RAM Kullanımı", value: stats?.mem.usedPercent, icon: MemoryStick },
    { label: "Disk Kullanımı", value: stats?.disk.usedPercent, icon: HardDrive },
  ]

  const serverInfo = [
    { label: "Sunucu adı", value: stats?.host.hostname ?? "—" },
    { label: "İşletim sistemi", value: stats?.host.platform ?? "—" },
    { label: "Çalışma süresi", value: stats ? formatUptime(stats.host.uptimeSeconds) : "—" },
    { label: "IP adresi", value: stats?.host.ip ?? "—" },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Anasayfa
        </h1>
        <p className="text-sm text-muted-foreground">
          Sunucunuzun genel durumu ve siteleriniz.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {serverStats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <stat.icon className="size-4" />
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stat.value === undefined ? (
                <div className="h-10 animate-pulse rounded-md bg-muted" />
              ) : (
                <StatMeter value={stat.value} />
              )}
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Server className="size-4" />
              Sunucu Bilgisi
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {serverInfo.map((info) => (
              <div
                key={info.label}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-muted-foreground">{info.label}</span>
                <span className="font-mono text-foreground">{info.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            Siteleriniz
          </h2>
          <Button asChild>
            <Link href="/sites/new">
              <Plus className="size-4" />
              YENİ
            </Link>
          </Button>
        </div>

        {sites === null ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-card" />
            ))}
          </div>
        ) : sites.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                Henüz bir site eklenmedi.
              </p>
              <Button asChild size="sm">
                <Link href="/sites/new">
                  <Plus className="size-4" />
                  İlk sitenizi ekleyin
                </Link>
              </Button>
            </CardContent>
          </Card>
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
