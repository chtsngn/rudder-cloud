"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { useRouter, usePathname } from "next/navigation"
import {
  X,
  Minus,
  Maximize2,
  Terminal as TerminalIcon,
  RotateCw,
  Sparkles,
  ChevronRight,
  Command,
  GripVertical,
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
          Terminal oturumu bağlanıyor...
        </div>
      </div>
    ),
  }
)

export function SideTerminalDock() {
  const router = useRouter()
  const pathname = usePathname()
  const {
    isOpen,
    setIsOpen,
    toggleDock,
    openDock,
    closeDock,
    width,
    setWidth,
    isMinimized,
    setIsMinimized,
  } = useTerminalDock()

  const [isDragging, setIsDragging] = useState(false)
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
  }, [isDragging, setWidth])

  // Fullscreen sayfaya geçiş (/terminal)
  const handleExpandToPage = () => {
    closeDock()
    router.push("/terminal")
  }

  // /terminal sayfasındayken dock'u gizle veya devreden çıkar
  const isTerminalPage = pathname === "/terminal"

  if (isTerminalPage) {
    return null
  }

  return (
    <>
      {/* ═══ 1. SAĞA TUTTURULMUŞ DOCK PANELİ ═══ */}
      {isOpen && !isMinimized && (
        <aside
          style={{ width: `${width}px` }}
          className={cn(
            "fixed right-0 top-0 bottom-0 z-40 flex flex-col bg-[#0a0d14] border-l border-slate-700/80 shadow-[-12px_0_36px_rgba(0,0,0,0.35)] transition-[width] duration-75",
            isDragging && "select-none transition-none"
          )}
        >
          {/* Sol Kenar Sürükleme Tutamacı (Resize Drag Handle) */}
          <div
            onMouseDown={handleMouseDown}
            title="Genişliği ayarlamak için sürükleyin"
            className="group absolute -left-1.5 top-0 bottom-0 w-3 cursor-col-resize z-50 flex items-center justify-center hover:bg-[#c8a87c]/30 transition-colors"
          >
            <div className="h-10 w-1 rounded-full bg-slate-600 group-hover:bg-[#c8a87c] transition-colors" />
          </div>

          {/* Dock Üst Başlık Çubuğu */}
          <div className="flex items-center justify-between border-b border-slate-800/90 bg-[#111622] px-3.5 py-2.5 select-none shrink-0">
            {/* Sol: macOS Trafik Noktaları & Başlık */}
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={closeDock}
                  title="Pencereyi Kapat"
                  className="size-3 rounded-full bg-[#ff5f56] border border-[#e0443e] block hover:opacity-80 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => setIsMinimized(true)}
                  title="Aşağı Simge Durumuna Küçült"
                  className="size-3 rounded-full bg-[#ffbd2e] border border-[#dea123] block hover:opacity-80 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={handleExpandToPage}
                  title="Tam Sayfaya Geç (/terminal)"
                  className="size-3 rounded-full bg-[#27c93f] border border-[#1aab29] block hover:opacity-80 cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-[#dfc9a0]">
                <TerminalIcon className="size-3.5 text-[#c8a87c]" />
                <span className="truncate max-w-[160px] sm:max-w-none">
                  root@rudder-cloud:~
                </span>
              </div>
            </div>

            {/* Sağ: Eylem Butonları */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleExpandToPage}
                title="Tam Sayfa Olarak Aç"
                className="size-7 flex items-center justify-center rounded-lg border border-slate-700/60 bg-slate-900/90 text-slate-400 hover:text-white hover:border-slate-600 transition-all cursor-pointer"
              >
                <Maximize2 className="size-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                title="Simge Durumuna Küçült"
                className="size-7 flex items-center justify-center rounded-lg border border-slate-700/60 bg-slate-900/90 text-slate-400 hover:text-white hover:border-slate-600 transition-all cursor-pointer"
              >
                <Minus className="size-3.5" />
              </button>

              <button
                type="button"
                onClick={closeDock}
                title="Terminali Kapat"
                className="size-7 flex items-center justify-center rounded-lg border border-slate-700/60 bg-slate-900/90 text-slate-400 hover:text-red-400 hover:border-red-500/50 transition-all cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Terminal Gövdesi */}
          <div className="flex-1 min-h-0 overflow-hidden p-2 bg-[#0a0d14]">
            <TerminalView />
          </div>
        </aside>
      )}

      {/* ═══ 2. KÜÇÜLTÜLMÜŞ DURUM / SABİT LAUNCHER BUTONU ═══ */}
      {(!isOpen || isMinimized) && (
        <div className="fixed bottom-5 right-5 z-40 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <button
            type="button"
            onClick={openDock}
            title="Sağ Terminal Penceresini Aç (Ctrl + `)"
            className="group inline-flex items-center gap-2 rounded-2xl border border-[#c8a87c]/60 bg-[#580619] px-4 py-2.5 text-xs font-bold text-white shadow-xl hover:bg-[#720a22] hover:border-[#c8a87c] transition-all cursor-pointer hover:scale-105 active:scale-95"
          >
            <div className="size-6 rounded-lg bg-black/30 flex items-center justify-center text-[#dfc9a0] border border-[#c8a87c]/30">
              <TerminalIcon className="size-3.5 text-[#dfc9a0]" />
            </div>
            <span className="font-heading tracking-wide">Terminali Aç</span>
            <kbd className="hidden sm:inline bg-black/40 text-[10px] font-mono px-1.5 py-0.5 rounded text-[#dfc9a0] border border-[#c8a87c]/30">
              Ctrl+`
            </kbd>
          </button>
        </div>
      )}
    </>
  )
}