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

  return (
    <>
      {/* ═══ 1. SAĞA TUTTURULMUŞ DOCK PANELİ (SOLU OVAL / YELKEN KAVİSLİ & ALTIN ÇERÇEVELİ) ═══ */}
      {isOpen && !isMinimized && (
        <aside
          style={{ width: `${width}px` }}
          className={cn(
            "fixed right-0 top-0 bottom-0 z-40 flex flex-col bg-[#0a0d14] border-l-2 border-[#c8a87c]/70 rounded-l-[28px] shadow-[-20px_0_60px_rgba(0,0,0,0.65)] transition-[width] duration-75 p-3 overflow-hidden",
            isDragging && "select-none transition-none"
          )}
        >
          {/* Sol Kenar Sürükleme Tutamacı (Nautical Helm Grip Handle) */}
          <div
            onMouseDown={handleMouseDown}
            title="Genişliği ayarlamak için sürükleyin"
            className="group absolute -left-2.5 top-0 bottom-0 w-5 cursor-col-resize z-50 flex items-center justify-center hover:bg-[#c8a87c]/20 transition-colors"
          >
            <div className="h-16 w-2.5 rounded-full bg-[#580619] border border-[#c8a87c] group-hover:border-[#dfc9a0] group-hover:scale-110 transition-all shadow-[0_0_12px_rgba(200,168,124,0.4)] flex flex-col items-center justify-center gap-1">
              <span className="size-0.5 rounded-full bg-[#dfc9a0]" />
              <span className="size-0.5 rounded-full bg-[#dfc9a0]" />
              <span className="size-0.5 rounded-full bg-[#dfc9a0]" />
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

      {/* ═══ 2. KÜÇÜLTÜLMÜŞ / SABİT LÜKS BORDO & ALTIN TERMİNAL BUTONU (NO TEXT) ═══ */}
      {(!isOpen || isMinimized) && (
        <div className="fixed bottom-5 right-5 z-40 group animate-in fade-in slide-in-from-bottom-3 duration-200">
          {/* Hover Kısayol Tooltipi */}
          <div className="absolute -top-9 left-1/2 -translate-x-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-200 -translate-y-1 group-hover:translate-y-0 whitespace-nowrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900/95 text-white text-[11px] font-mono shadow-xl border border-slate-700/80 backdrop-blur-xs">
              <span className="text-[#dfc9a0]">Terminal</span>
              <kbd className="text-[10px] text-slate-400 bg-black/50 px-1 py-0.5 rounded">Ctrl+`</kbd>
            </span>
          </div>

          <button
            type="button"
            onClick={openDock}
            title="Terminal Konsolunu Aç (Ctrl + `)"
            className="relative size-11 rounded-2xl border border-[#c8a87c]/60 bg-[#2b040d] hover:bg-[#420614] text-[#dfc9a0] shadow-[0_6px_20px_rgba(43,4,13,0.45)] hover:shadow-[0_8px_25px_rgba(200,168,124,0.35)] hover:border-[#dfc9a0] flex items-center justify-center transition-all cursor-pointer hover:scale-105 active:scale-95"
          >
            {/* Terminal Prompt Icon */}
            <TerminalIcon className="size-4.5 text-[#dfc9a0]" />

            {/* Subtle Warm Gold Indicator Dot */}
            <span className="absolute -top-1 -right-1 flex size-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#c8a87c] opacity-60" />
              <span className="relative inline-flex rounded-full size-2.5 bg-[#c8a87c] border-2 border-[#2b040d]" />
            </span>
          </button>
        </div>
      )}
    </>
  )
}