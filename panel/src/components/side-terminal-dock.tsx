"use client"

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { usePathname } from "next/navigation"
import {
  Terminal as TerminalIcon,
  Sparkles,
} from "lucide-react"

import { useTerminalDock } from "@/components/terminal-dock-context"
import { cn } from "@/lib/utils"

const TerminalView = dynamic(
  () => import("@/components/terminal-view").then((m) => m.TerminalView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-[#0a0d14] text-xs font-mono text-emerald-400">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
          Terminal ortamı yükleniyor...
        </div>
      </div>
    ),
  }
)

export function SideTerminalDock() {
  const pathname = usePathname()
  const {
    isOpen,
    openDock,
    closeDock,
    width,
    setWidth,
    isMinimized,
    setIsMinimized,
    isDragging,
    setIsDragging,
  } = useTerminalDock()

  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)

  // Resizing mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    dragStartX.current = e.clientX
    dragStartWidth.current = width
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const delta = dragStartX.current - e.clientX
      const newWidth = dragStartWidth.current + delta
      setWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging, setWidth, setIsDragging])

  // /terminal sayfasındayken dock'u gizle
  const isTerminalPage = pathname === "/terminal"
  if (isTerminalPage) {
    return null
  }

  // Terminal tekrar açıldığında ekran boyutunu yeniden ayarla
  useEffect(() => {
    if (isOpen && !isMinimized) {
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event("resize"))
      }, 120)
      return () => clearTimeout(timer)
    }
  }, [isOpen, isMinimized])

  return (
    <>
      {/* ═══ 1. SAĞA TUTTURULMUŞ DOCK PANELİ (SOLU OVAL / YELKEN KAVİSLİ & ALTIN/LACİVERT ÇERÇEVELİ) ═══ */}
      {/* Oturumun ve komut geçmişinin kaybolmaması için küçültüldüğünde unmount edilmez, CSS ile gizlenir */}
      {isOpen && (
        <aside
          style={{ width: `${width}px` }}
          aria-hidden={isMinimized}
          className={cn(
            "fixed right-0 top-0 bottom-0 z-40 flex flex-col bg-[#050811] border-l-2 border-[#c8a87c]/70 dark:border-[#2a4687]/80 rounded-l-[28px] max-w-full shadow-[-20px_0_60px_rgba(0,0,0,0.65)] p-3 overflow-hidden transition-all duration-300",
            isMinimized
              ? "translate-x-full opacity-0 pointer-events-none invisible"
              : "translate-x-0 opacity-100 pointer-events-auto visible",
            isDragging && "select-none transition-none"
          )}
        >
          {/* Sol Kenar Sürükleme Tutamacı (Nautical Helm Grip Handle) */}
          <div
            onMouseDown={handleMouseDown}
            title="Genişliği ayarlamak için sürükleyin"
            className="group absolute -left-2.5 top-0 bottom-0 w-5 cursor-col-resize z-50 flex items-center justify-center hover:bg-[#c8a87c]/20 dark:hover:bg-[#162752]/40 transition-colors"
          >
            <div className="h-16 w-2.5 rounded-full bg-[#580619] dark:bg-[#162752] border border-[#c8a87c] dark:border-[#2a4687] group-hover:border-[#dfc9a0] dark:group-hover:border-blue-300 group-hover:scale-110 transition-all shadow-[0_0_12px_rgba(200,168,124,0.4)] dark:shadow-[0_0_12px_rgba(22,39,82,0.6)] flex flex-col items-center justify-center gap-1">
              <span className="size-0.5 rounded-full bg-[#dfc9a0] dark:text-white" />
              <span className="size-0.5 rounded-full bg-[#dfc9a0] dark:text-white" />
              <span className="size-0.5 rounded-full bg-[#dfc9a0] dark:text-white" />
            </div>
          </div>

          {/* Terminal Gövdesi (isDocked=true ile tekil, kompakt ve lüks pencere başlığı) */}
          <div className="flex-1 min-h-0 overflow-hidden rounded-2xl">
            <TerminalView
              isDocked={true}
              onClose={closeDock}
              onMinimize={() => setIsMinimized(true)}
            />
          </div>
        </aside>
      )}

      {/* ═══ 2. KÜÇÜLTÜLMÜŞ / SABİT LÜKS BORDO/KOYU LACİVERT TERMİNAL BUTONU ═══ */}
      {(!isOpen || isMinimized) && (
        <div className="fixed bottom-8 right-8 z-40 group animate-in fade-in slide-in-from-bottom-3 duration-200">
          {/* Hover Kısayol Tooltipi */}
          <div className="absolute -top-9.5 right-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-200 -translate-y-1 group-hover:translate-y-0 whitespace-nowrap z-50">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900 text-white text-[11px] font-mono shadow-xl border border-slate-700/80 backdrop-blur-xs">
              <span className="text-[#dfc9a0] dark:text-blue-300">Terminal</span>
              <kbd className="text-[10px] text-slate-400 bg-black/50 px-1.5 py-0.5 rounded border border-slate-700">Ctrl+`</kbd>
            </span>
          </div>

          <button
            type="button"
            onClick={openDock}
            aria-label="Terminal Konsolunu Aç"
            className="relative size-12 rounded-2xl border border-[#c8a87c]/60 dark:border-[#2a4687]/70 bg-[#2b040d] dark:bg-[#162752] hover:bg-[#420614] dark:hover:bg-[#1e346b] text-[#dfc9a0] dark:text-white shadow-[0_8px_24px_rgba(43,4,13,0.5)] dark:shadow-[0_8px_24px_rgba(22,39,82,0.5)] hover:border-[#dfc9a0] dark:hover:border-[#385db3] flex items-center justify-center transition-all cursor-pointer hover:scale-105 active:scale-95"
          >
            {/* Terminal Prompt Icon */}
            <TerminalIcon className="size-5 text-inherit" />
          </button>
        </div>
      )}
    </>
  )
}