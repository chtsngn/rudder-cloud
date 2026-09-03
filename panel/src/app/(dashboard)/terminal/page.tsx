"use client"

import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { ShieldAlert, Terminal as TerminalIcon, Sparkles, Columns2, ArrowRight } from "lucide-react"

import { useTerminalDock } from "@/components/terminal-dock-context"
import { useTranslation } from "@/components/language-provider"
import { Button } from "@/components/ui/button"

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

export default function TerminalPage() {
  const router = useRouter()
  const { openDock } = useTerminalDock()
  const { t } = useTranslation()

  const handleDockToRight = () => {
    openDock()
    router.push("/")
  }

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

          <button
            type="button"
            onClick={handleDockToRight}
            className="group inline-flex items-center gap-2 rounded-xl border border-[#c8a87c]/50 dark:border-[#2a4687]/60 bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] hover:border-[#dfc9a0] px-4 py-2 text-xs font-bold text-white shadow-2xs transition-all cursor-pointer hover:scale-102 active:scale-98 shrink-0"
          >
            <Columns2 className="size-4 text-[#dfc9a0] dark:text-white transition-transform group-hover:scale-110" />
            <span className="font-heading tracking-wide">{t("terminal.dockRight")}</span>
          </button>
        </div>

        {/* Güvenlik & Yetki Bilgilendirme Bandı */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-amber-200/80 dark:border-[#16223f] bg-amber-50/50 dark:bg-[#090e1f] p-4 text-xs text-amber-950 dark:text-slate-200 shadow-2xs">
          <div className="flex items-start gap-3">
            <div className="size-8 rounded-xl bg-amber-500/10 dark:bg-[#101c38] border border-amber-500/30 dark:border-[#1e3568]/50 flex items-center justify-center shrink-0 mt-0.5">
              <ShieldAlert className="size-4.5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="font-heading font-bold text-slate-900 dark:text-slate-100 text-xs">
                {t("terminal.securityTitle")}
              </p>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed font-sans">
                {t("terminal.securityDesc")}
              </p>
            </div>
          </div>
          <span className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-[#101c38] border border-slate-200 dark:border-[#1e3568]/60 font-mono text-[11px] font-bold text-slate-700 dark:text-blue-300 shadow-2xs">
            /bin/bash • PTY
          </span>
        </div>
      </div>

      {/* ═══ 2. TERMİNAL PENCERESİ ═══ */}
      <div className="h-[74vh] min-h-[500px]">
        <TerminalView />
      </div>
    </div>
  )
}

