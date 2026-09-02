"use client"

import Link from "next/link"
import {
  ArrowUpRight,
  Globe,
  Play,
  RotateCw,
  Square,
  ExternalLink,
  ShieldCheck,
  Settings2,
  Layers,
  Code2,
  Server,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { SITE_TYPES, type Site, type SiteType } from "@/lib/mock-data"

const STATUS_CONFIG: Record<
  Site["status"],
  { label: string; dot: string; badge: string }
> = {
  active: {
    label: "Aktif",
    dot: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
  },
  running: {
    label: "Çalışıyor",
    dot: "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
  },
  stopped: {
    label: "Durduruldu",
    dot: "bg-slate-400",
    badge: "bg-slate-100 text-slate-600 border-slate-200",
  },
  provisioning: {
    label: "Kuruluyor",
    dot: "bg-amber-500 animate-pulse",
    badge: "bg-amber-50 text-amber-700 border-amber-200/80",
  },
  error: {
    label: "Hata",
    dot: "bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]",
    badge: "bg-red-50 text-red-700 border-red-200/80",
  },
}

function getTypeIcon(type: SiteType) {
  switch (type) {
    case "wordpress":
    case "php":
      return Globe
    case "nodejs":
      return Code2
    case "python":
      return Layers
    case "proxy":
      return Server
    default:
      return Globe
  }
}

export function SiteCard({ site }: { site: Site }) {
  const typeInfo =
    SITE_TYPES.find((t) => t.type === site.type) ?? {
      type: site.type,
      label: site.type.toUpperCase(),
      abbr: site.type.slice(0, 2).toUpperCase(),
      description: "",
      managed: false,
    }

  const status = STATUS_CONFIG[site.status] ?? STATUS_CONFIG.stopped
  const TypeIcon = getTypeIcon(site.type)

  return (
    <div className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-5 shadow-[0_4px_16px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)] transition-all duration-300 hover:border-[#c8a87c] dark:hover:border-[#2a4687] hover:shadow-[0_8px_24px_rgba(200,168,124,0.12)] dark:hover:shadow-[0_8px_24px_rgba(22,39,82,0.3)] overflow-hidden">
      {/* Üst Vurgu Çizgisi */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#580619]/20 dark:via-[#2a4687]/50 to-transparent group-hover:via-[#c8a87c] dark:group-hover:via-[#385db3] transition-all duration-500" />

      {/* ── 1. ÜST BAŞLIK & ROZETLER ── */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-4">
          {/* Framework / Tip Rozeti */}
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-xl bg-[#580619]/5 dark:bg-[#101c38] border border-[#c8a87c]/30 dark:border-[#1e3568]/50 flex items-center justify-center text-[#580619] dark:text-blue-300 font-mono text-xs font-black shadow-sm group-hover:bg-[#580619] dark:group-hover:bg-[#162752] group-hover:text-white dark:group-hover:text-white transition-colors">
              {typeInfo.abbr}
            </div>
            <div>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block leading-tight">
                {typeInfo.label}
              </span>
              <span className="text-[10.5px] text-slate-400 dark:text-slate-500 font-mono">
                {typeInfo.managed ? "systemd servisi" : "Nginx web sitesi"}
              </span>
            </div>
          </div>

          {/* Canlı Durum Rozeti */}
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border shadow-2xs",
              status.badge
            )}
          >
            <span className={cn("size-1.5 rounded-full", status.dot)} />
            {status.label}
          </span>
        </div>

        {/* ── 2. DOMAIN & BİLGİ ALANI ── */}
        <div className="mb-5">
          <Link
            href={`/sites/${site.id}`}
            className="group/link flex items-center gap-1.5 text-base font-bold font-mono text-slate-900 dark:text-slate-100 hover:text-[#580619] dark:hover:text-blue-300 transition-colors"
          >
            <span className="truncate">{site.domain}</span>
            <ArrowUpRight className="size-4 text-slate-400 group-hover/link:text-[#580619] dark:group-hover/link:text-blue-300 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 transition-all shrink-0" />
          </Link>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
            {typeInfo.description || "Yönetilen web sitesi."}
          </p>
        </div>
      </div>

      {/* ── 3. ALT AKSİYON & KONTROL ÇUBUĞU ── */}
      <div className="pt-3.5 border-t border-slate-100 dark:border-[#16223f] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 font-mono">
          <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>Nginx Aktif</span>
        </div>

        <div className="flex items-center gap-1.5">
          {typeInfo.managed && (
            <div className="flex items-center gap-1 mr-1">
              <Button
                size="icon"
                variant="outline"
                className="size-7 rounded-lg text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#16223f] hover:text-[#580619] dark:hover:text-blue-300 hover:border-[#c8a87c] dark:hover:border-[#2a4687] dark:hover:bg-[#111f40]"
                title="Yeniden Başlat"
              >
                <RotateCw className="size-3" />
              </Button>
            </div>
          )}

          <Button
            asChild
            size="sm"
            className="h-7.5 px-3 rounded-lg bg-slate-50 dark:bg-[#060a17] hover:bg-[#580619] dark:hover:bg-[#162752] text-slate-700 dark:text-slate-200 hover:text-white dark:hover:text-white border border-slate-200 dark:border-[#16223f] hover:border-[#580619] dark:hover:border-[#2a4687] text-xs font-semibold shadow-2xs transition-all flex items-center gap-1.5"
          >
            <Link href={`/sites/${site.id}`}>
              <Settings2 className="size-3.5" />
              Yönet
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}