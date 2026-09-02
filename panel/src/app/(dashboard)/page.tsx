"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Activity, Cpu, HardDrive, MemoryStick, Plus, Server } from "lucide-react"
import { SiteCard } from "@/components/site-card"
import type { Site } from "@/lib/mock-data"
import { apiSiteToUiSite, type ApiSite } from "@/lib/site-adapter"

interface SystemStats {
  cpu: { usedPercent: number; cores: number; loadAvg: number[] }
  mem: { usedPercent: number; usedGB: number; totalGB: number }
  disk: { usedPercent: number; usedGB: number; totalGB: number }
  host: { hostname: string; platform: string; uptimeSeconds: number; ip: string }
}

const POLL_MS = 5000

function uptime(s: number) {
  return `${Math.floor(s / 86400)} gun ${Math.floor((s % 86400) / 3600)} saat`
}

function MetricRow({
  icon: Icon,
  label,
  value,
}: {
  icon: any
  label: string
  value: number | undefined
}) {
  const v = Math.max(0, Math.min(100, Math.round(value ?? 0)))
  const isHigh = v >= 80
  const isMid = v >= 50 && v < 80

  /* Bar rengi: bronz metalik → koyu bordo — neon YOK */
  const fillStyle = isHigh
    ? { background: "linear-gradient(90deg, #4a0a0a 0%, #8b1a1a 100%)" }
    : isMid
    ? { background: "linear-gradient(90deg, #3a2000 0%, #7a4a10 100%)" }
    : { background: "linear-gradient(90deg, #2a1e0e 0%, #8a6a3a 100%)" }

  const dotColor = isHigh ? "#8b1a1a" : isMid ? "#7a4a10" : "#5a7a3a"

  return (
    <div className="flex items-center gap-4">
      {/* Label */}
      <div className="flex items-center gap-2 w-[72px] shrink-0">
        <Icon className="size-3.5 shrink-0" style={{ color: "#4a3520" }} />
        <span className="text-[12px] font-medium" style={{ color: "#7a6040" }}>{label}</span>
      </div>

      {/* Track */}
      <div
        className="flex-1 h-[8px] rounded-sm overflow-hidden"
        style={{ background: "#14100c" }}
      >
        <div
          className="h-full rounded-sm transition-all duration-700"
          style={{ width: `${v}%`, ...fillStyle }}
        />
      </div>

      {/* Dot + pct */}
      <div className="flex items-center gap-2 w-[52px] shrink-0 justify-end">
        <span
          className="size-[7px] rounded-full shrink-0"
          style={{ background: dotColor }}
        />
        <span className="font-mono text-[12px] font-semibold" style={{ color: "#c9a870" }}>
          {v}%
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
    const load = async () => {
      try {
        const r = await fetch("/api/system/stats", { cache: "no-store" })
        if (r.ok && !cancelled) setStats(await r.json())
      } catch { /* ignore */ }
    }
    load()
    const iv = setInterval(load, POLL_MS)
    return () => { cancelled = true; clearInterval(iv) }
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const r = await fetch("/api/sites", { cache: "no-store" })
        if (!r.ok) throw new Error("")
        const data = (await r.json()) as ApiSite[]
        if (!cancelled) setSites(data.map(apiSiteToUiSite))
      } catch { if (!cancelled) setSites([]) }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const loadPct = stats?.cpu.loadAvg?.[0]
    ? Math.min(100, Math.round((stats.cpu.loadAvg[0] / (stats.cpu.cores || 1)) * 100))
    : stats?.cpu.usedPercent ?? 0

  const serverRows = [
    { label: "Sunucu adi", value: stats?.host.hostname ?? "—" },
    { label: "Isletim sistemi", value: stats?.host.platform ?? "—" },
    { label: "Calisma suresi", value: stats ? uptime(stats.host.uptimeSeconds) : "—" },
    { label: "IP adresi", value: stats?.host.ip ?? "—" },
  ]

  /* Kart stili */
  const card = {
    background: "#1c1814",
    border: "1px solid rgba(184,149,106,0.12)",
    borderRadius: "8px",
  } as React.CSSProperties

  return (
    <div style={{ padding: "32px 36px", maxWidth: 1100 }}>
      {/* Baslik */}
      <div style={{ marginBottom: 28 }}>
        <h1
          className="font-heading"
          style={{ fontSize: 22, fontWeight: 700, color: "#e8d5b0", letterSpacing: "0.05em", marginBottom: 4 }}
        >
          Anasayfa
        </h1>
        <p style={{ fontSize: 12, color: "#4a3820" }}>
          Sunucunuzun genel durumu ve siteleriniz.
        </p>
      </div>

      {/* ─── METRIK + SUNUCU BILGISI KARTI ─── */}
      <div style={{ ...card, padding: "24px 28px", marginBottom: 28 }}>
        <div style={{ display: "flex", gap: 32, alignItems: "stretch" }}>

          {/* Sol: 4 metrik bar */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
            <MetricRow icon={Cpu} label="CPU" value={stats?.cpu.usedPercent} />
            <MetricRow icon={MemoryStick} label="RAM" value={stats?.mem.usedPercent} />
            <MetricRow icon={HardDrive} label="Disk" value={stats?.disk.usedPercent} />
            <MetricRow icon={Activity} label="Yuk" value={loadPct} />
          </div>

          {/* Dikey ayirici */}
          <div style={{ width: 1, background: "rgba(184,149,106,0.1)", alignSelf: "stretch" }} />

          {/* Sag: Sunucu bilgisi */}
          <div style={{ width: 220, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <Server style={{ width: 13, height: 13, color: "#5a4020" }} />
              <span
                className="font-heading"
                style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.15em", color: "#b8956a" }}
              >
                SUNUCU BILGISI
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {serverRows.map(row => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "#4a3820", flexShrink: 0 }}>{row.label}</span>
                  <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "#c9a870", textAlign: "right", wordBreak: "break-all" }}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─── SITELERINIZ ─── */}
      <div>
        {/* Baslik satiri */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2
            className="font-heading"
            style={{ fontSize: 17, fontWeight: 600, color: "#e8d5b0", letterSpacing: "0.04em" }}
          >
            Siteleriniz
          </h2>
          <Link
            href="/sites/new"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              height: 32,
              padding: "0 14px",
              borderRadius: 6,
              border: "1px solid rgba(184,149,106,0.22)",
              background: "rgba(184,149,106,0.05)",
              color: "#b8956a",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textDecoration: "none",
            }}
          >
            <Plus style={{ width: 12, height: 12 }} />
            YENI
          </Link>
        </div>

        {/* Icerik */}
        {sites === null ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ ...card, height: 110, opacity: 0.5 }} />
            ))}
          </div>
        ) : sites.length === 0 ? (
          <div
            style={{
              ...card,
              minHeight: 180,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
            }}
          >
            <p style={{ fontSize: 13, color: "#3a2a1a" }}>
              Henuz bir site eklenmedi.
            </p>
            <Link
              href="/sites/new"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                height: 36,
                padding: "0 20px",
                borderRadius: 6,
                background: "#4a0a14",
                border: "1px solid rgba(184,149,106,0.18)",
                color: "#e8d5b0",
                fontSize: 12,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              <Plus style={{ width: 13, height: 13 }} />
              Ilk sitenizi ekleyin
            </Link>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {sites.map(site => (
              <SiteCard key={site.id} site={site} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}