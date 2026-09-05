"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { ShieldAlert, Terminal as TerminalIcon, Columns2, Loader2 } from "lucide-react"

import { useTerminalDock } from "@/components/terminal-dock-context"
import { useTranslation } from "@/components/language-provider"
import { useCurrentUser } from "@/hooks/use-current-user"
import { Button } from "@/components/ui/button"
import { CustomSelect } from "@/components/ui/custom-select"

// xterm.js tarayıcı-özel API'ler kullanıyor (WebSocket, `document`) — Monaco
// editörle (Aşama C) aynı desen: `ssr: false` ile yalnızca istemcide yüklenir.
const TerminalView = dynamic(
  () => import("@/components/terminal-view").then((m) => m.TerminalView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[72vh] items-center justify-center rounded-2xl border border-slate-200 bg-slate-900 text-xs font-mono text-emerald-400 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
          Terminal ortamı başlatılıyor...
        </div>
      </div>
    ),
  }
)

interface EligibleSite {
  id: string
  domain: string
  type: string
  linuxUser: string
}

/**
 * MEMBER'lar için site seçici (bkz. docs/ARCHITECTURE.md Aşama I) — SUPER_ADMIN
 * hâlâ sınırsız kök terminale doğrudan erişir, bu bileşen ONLARA hiç render
 * edilmez (bkz. TerminalPage). Gerçek yetkilendirme her zaman `server.mjs`'te
 * TAZE yapılır; bu yalnızca hangi site(ler)in seçilebileceğini gösteriyor.
 */
function MemberTerminalGate() {
  const { lang } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [sites, setSites] = useState<EligibleSite[]>([])
  const [selectedId, setSelectedId] = useState("")

  useEffect(() => {
    let cancelled = false
    fetch("/api/terminal/eligible-sites", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { unrestricted?: boolean; sites?: EligibleSite[] } | null) => {
        if (cancelled || !data) return
        setSites(data.sites ?? [])
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="flex h-[72vh] items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40">
        <Loader2 className="size-6 animate-spin text-[#580619] dark:text-blue-300" />
      </div>
    )
  }

  if (sites.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-200/80 dark:border-[#16223f] bg-amber-50/50 dark:bg-[#090e1f] p-6 text-sm text-amber-950 dark:text-slate-200 space-y-2">
        <p className="font-heading font-bold flex items-center gap-2">
          <ShieldAlert className="size-4.5 text-amber-600 dark:text-amber-400" />
          {lang === "en" ? "No terminal access available" : "Erişilebilir bir terminal yok"}
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          {lang === "en"
            ? "Terminal access requires an admin to explicitly grant you the \"Terminal\" permission on a site that has its own dedicated Linux user (WordPress, PHP, or Static sites — not Node.js/Python/Reverse Proxy/Docker, which run under the shared panel account and can't be isolated per-site)."
            : "Terminal erişimi için bir yöneticinin, kendi dedicated Linux kullanıcısı olan bir sitede (WordPress, PHP veya Statik — Node.js/Python/Ters Proxy/Docker paylaşımlı panel hesabı altında çalıştığı için site bazlı izole edilemez) size açıkça \"Terminal\" izni vermesi gerekir."}
        </p>
      </div>
    )
  }

  const selected = sites.find((s) => s.id === selectedId)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-4">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0">
          {lang === "en" ? "Site:" : "Site:"}
        </span>
        <CustomSelect
          value={selectedId}
          onChange={(val) => setSelectedId(val)}
          options={sites.map((s) => ({ value: s.id, label: `${s.domain} (${s.linuxUser})` }))}
          placeholder={lang === "en" ? "Select a site..." : "Bir site seçin..."}
          className="max-w-sm"
        />
      </div>

      {selected ? (
        <div className="h-[68vh] min-h-[460px]">
          <TerminalView key={selected.id} siteId={selected.id} promptUser={selected.linuxUser} />
        </div>
      ) : (
        <div className="flex h-[68vh] min-h-[460px] items-center justify-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400">
          {lang === "en" ? "Pick a site above to open its terminal." : "Terminalini açmak için yukarıdan bir site seçin."}
        </div>
      )}
    </div>
  )
}

export default function TerminalPage() {
  const router = useRouter()
  const { openDock } = useTerminalDock()
  const { t, lang } = useTranslation()
  const { user, loading: userLoading } = useCurrentUser()

  const handleDockToRight = () => {
    openDock()
    router.push("/")
  }

  const isSuperAdmin = user?.role === "SUPER_ADMIN"

  return (
    <div className="max-w-7xl mx-auto flex h-full flex-col space-y-6 pb-8">
      {/* ═══ 1. ÜST BAŞLIK & GÜVENLİK UYARISI ═══ */}
      <div className="space-y-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-2xl bg-[#580619]/5 dark:bg-[#101c38] border border-[#c8a87c]/30 dark:border-[#1e3568]/50 flex items-center justify-center text-[#580619] dark:text-blue-300 shadow-2xs">
              <TerminalIcon className="size-5 text-[#580619] dark:text-blue-300" />
            </div>
            <div>
              <h1 className="font-heading text-2xl md:text-3xl font-extrabold tracking-tight text-[#580619] dark:text-slate-100">
                {t("terminal.title")}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-0.5">
                {t("terminal.subtitle")}
              </p>
            </div>
          </div>

          {isSuperAdmin && (
            <button
              type="button"
              onClick={handleDockToRight}
              className="group inline-flex items-center gap-2 rounded-xl border border-[#c8a87c]/50 dark:border-[#2a4687]/60 bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] hover:border-[#dfc9a0] px-4 py-2 text-xs font-bold text-white shadow-2xs transition-all cursor-pointer hover:scale-102 active:scale-98 shrink-0"
            >
              <Columns2 className="size-4 text-inherit transition-transform group-hover:scale-110" />
              <span className="font-heading tracking-wide">{t("terminal.dockRight")}</span>
            </button>
          )}
        </div>

        {/* Güvenlik & Yetki Bilgilendirme Bandı */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-amber-200/80 dark:border-[#16223f] bg-amber-50/50 dark:bg-[#090e1f] p-4 text-xs text-amber-950 dark:text-slate-200 shadow-2xs">
          <div className="flex items-start gap-3">
            <div className="size-8 rounded-xl bg-amber-500/10 dark:bg-[#101c38] border border-amber-500/30 dark:border-[#1e3568]/50 flex items-center justify-center shrink-0 mt-0.5">
              <ShieldAlert className="size-4.5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="font-heading font-bold text-slate-900 dark:text-slate-100 text-xs">
                {isSuperAdmin
                  ? t("terminal.securityTitle")
                  : (lang === "en" ? "Site-Scoped Shell Session (No Root Access)" : "Site Kapsamlı Kabuk Oturumu (Root Erişimi Yok)")}
              </p>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed font-sans">
                {isSuperAdmin
                  ? t("terminal.securityDesc")
                  : (lang === "en"
                      ? "A shell as the dedicated Linux user of a site your admin explicitly granted you Terminal access to — no root access, no other sites."
                      : "Yöneticinin size açıkça Terminal izni verdiği bir sitenin dedicated Linux kullanıcısı olarak bir kabuk — root erişimi yok, başka hiçbir siteye erişim yok.")}
              </p>
            </div>
          </div>
          <span className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-[#101c38] border border-slate-200 dark:border-[#1e3568]/60 font-mono text-[11px] font-bold text-slate-700 dark:text-blue-300 shadow-2xs">
            /bin/bash • PTY
          </span>
        </div>
      </div>

      {/* ═══ 2. TERMİNAL PENCERESİ ═══ */}
      {userLoading ? (
        <div className="flex h-[72vh] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-[#580619] dark:text-blue-300" />
        </div>
      ) : isSuperAdmin ? (
        <div className="h-[74vh] min-h-[500px]">
          <TerminalView />
        </div>
      ) : (
        <MemberTerminalGate />
      )}
    </div>
  )
}
