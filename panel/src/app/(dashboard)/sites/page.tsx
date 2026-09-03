"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  Globe,
  Plus,
  RotateCw,
  Search,
  Filter,
  Layers,
  Code2,
  Server,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  PauseCircle,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SiteCard } from "@/components/site-card"
import type { Site, SiteType } from "@/lib/mock-data"
import { apiSiteToUiSite, type ApiSite } from "@/lib/site-adapter"
import { CustomSelect } from "@/components/ui/custom-select"
import { useTranslation } from "@/components/language-provider"
import { cn } from "@/lib/utils"

export default function SitesListPage() {
  const { t } = useTranslation()
  const [sites, setSites] = useState<Site[] | null>(null)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [refreshing, setRefreshing] = useState(false)

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
    loadSites()
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadSites()
    setTimeout(() => setRefreshing(false), 500)
  }

  const filteredSites = (sites ?? []).filter((s) => {
    const matchesSearch = s.domain.toLowerCase().includes(search.toLowerCase())
    const matchesType = typeFilter === "all" || s.type === typeFilter
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "running" && (s.status === "running" || s.status === "active")) ||
      (statusFilter === "stopped" && s.status === "stopped") ||
      (statusFilter === "error" && s.status === "error")
    return matchesSearch && matchesType && matchesStatus
  })

  const runningCount = (sites ?? []).filter((s) => s.status === "running" || s.status === "active").length
  const stoppedCount = (sites ?? []).filter((s) => s.status === "stopped").length
  const errorCount = (sites ?? []).filter((s) => s.status === "error").length

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      {/* ═══ 1. ÜST BAŞLIK & AKSİYONLAR ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-2xl md:text-3xl font-extrabold tracking-tight text-[#580619] dark:text-slate-100">
              {t("sites.title")}
            </h1>
            {sites !== null && (
              <span className="rounded-full bg-[#580619]/10 dark:bg-[#101c38] border border-[#580619]/20 dark:border-[#1e3568]/50 px-3 py-0.5 text-xs font-bold text-[#580619] dark:text-blue-300 font-mono">
                {sites.length} {t("dashboard.totalSites")}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-sans">
            {t("sites.subtitle")}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRefresh}
            title={t("common.refresh")}
            className="size-9 rounded-xl border border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#090e1f] text-slate-600 dark:text-slate-300 hover:text-[#580619] dark:hover:text-blue-300 hover:border-[#c8a87c] dark:hover:border-[#2a4687] shadow-sm flex items-center justify-center transition-all cursor-pointer active:scale-95"
          >
            <RotateCw className={cn("size-4", refreshing && "animate-spin text-[#580619] dark:text-blue-300")} />
          </button>

          <Button
            asChild
            className="bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white font-semibold text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2 h-10 border border-[#c8a87c]/40 dark:border-[#2a4687]/60 hover:border-[#c8a87c] dark:hover:border-[#385db3] hover:scale-[1.02] cursor-pointer"
          >
            <Link href="/sites/new">
              <Plus className="size-4 text-inherit" />
              {t("sites.newSite")}
            </Link>
          </Button>
        </div>
      </div>

      {/* ═══ 2. METRİK & ÖZET ŞERİDİ ═══ */}
      {sites && sites.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-center gap-3.5 p-4 rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] shadow-xs">
            <div className="size-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                {t("sites.statusActive")}
              </span>
              <span className="font-mono text-xl font-extrabold text-slate-900 dark:text-slate-100">
                {runningCount}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3.5 p-4 rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] shadow-xs">
            <div className="size-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300">
              <PauseCircle className="size-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                {t("sites.statusStopped")}
              </span>
              <span className="font-mono text-xl font-extrabold text-slate-900 dark:text-slate-100">
                {stoppedCount}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3.5 p-4 rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] shadow-xs">
            <div className="size-10 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200/80 dark:border-red-800/60 flex items-center justify-center text-red-600 dark:text-red-400">
              <AlertCircle className="size-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                {t("sites.statusFailed")}
              </span>
              <span className="font-mono text-xl font-extrabold text-slate-900 dark:text-slate-100">
                {errorCount}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 3. ARAMA VE FİLTRELEME ÇUBUĞU ═══ */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3.5 p-3 rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] shadow-xs">
        {/* Arama Kutusu */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("sites.searchPlaceholder")}
            className="pl-9.5 h-10 rounded-xl border-slate-200 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 font-mono text-xs focus-visible:ring-[#580619]/20 dark:focus-visible:ring-blue-500/20"
          />
        </div>

        {/* Filtre Dropdownları */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <CustomSelect
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: "all", label: t("sites.allTypes") },
              { value: "wordpress", label: "WordPress" },
              { value: "nodejs", label: "Node.js" },
              { value: "python", label: "Python" },
              { value: "php", label: "PHP" },
              { value: "proxy", label: "Proxy" },
              { value: "static", label: "Static" },
            ]}
            className="min-w-[130px]"
          />

          <CustomSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: t("common.all") },
              { value: "running", label: t("sites.statusActive") },
              { value: "stopped", label: t("sites.statusStopped") },
              { value: "error", label: t("sites.statusFailed") },
            ]}
            className="min-w-[130px]"
          />
        </div>
      </div>

      {/* ═══ 4. SİTELER IZGARASI (GRID) ═══ */}
      <div>
        {sites === null ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-44 animate-pulse rounded-2xl border border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#090e1f]"
              />
            ))}
          </div>
        ) : sites.length === 0 ? (
          /* Boş Durum */
          <div className="rounded-3xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-12 shadow-sm flex flex-col items-center justify-center text-center">
            <div className="size-18 rounded-2xl bg-[#580619]/5 dark:bg-[#101c38] border-2 border-[#c8a87c]/40 dark:border-[#1e3568]/50 flex items-center justify-center p-3.5 mb-4 shadow-inner">
              <Image
                src="/rudder-helm-transparent.png"
                alt="Rudder"
                width={48}
                height={48}
                className="object-contain"
              />
            </div>
            <h3 className="font-heading text-xl font-extrabold text-slate-800 dark:text-slate-100 mb-2">
              {t("dashboard.noSitesYet")}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-6 font-sans">
              Sunucunuzda yeni bir WordPress, Node.js, Python veya statik web sitesi yayına alın.
            </p>
            <Button
              asChild
              className="bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white font-bold text-xs uppercase tracking-wider px-6 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2 h-11 border border-[#c8a87c]/50 dark:border-[#2a4687]/60"
            >
              <Link href="/sites/new">
                <Plus className="size-4 text-inherit" />
                {t("dashboard.createFirstSite")}
              </Link>
            </Button>
          </div>
        ) : filteredSites.length === 0 ? (
          /* Filtre Sonucu Boş */
          <div className="rounded-2xl border border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-10 text-center text-xs text-slate-500 dark:text-slate-400">
            Arama veya filtre kriterlerinize uygun site bulunamadı.
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredSites.map((site) => (
              <SiteCard key={site.id} site={site} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}