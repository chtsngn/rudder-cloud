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

  // /terminal sayfasındayken dock'u gizle
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
            "fixed right-0 top-0 bottom-0 z-40 flex flex-col bg-[#0a0d14] border-l border-slate-700/80 shadow-[-16px_0_40px_rgba(0,0,0,0.5)] transition-[width] duration-75 p-2",
            isDragging && "select-none transition-none"
          )}
        >
          {/* Sol Kenar Sürükleme Tutamacı (Resize Drag Handle) */}
          <div
            onMouseDown={handleMouseDown}
            title="Genişliği ayarlamak için sürükleyin"
            className="group absolute -left-2 top-0 bottom-0 w-4 cursor-col-resize z-50 flex items-center justify-center hover:bg-[#c8a87c]/30 transition-colors"
          >
            <div className="h-12 w-1 rounded-full bg-slate-600 group-hover:bg-[#dfc9a0] transition-colors shadow-sm" />
          </div>

          {/* Terminal Gövdesi (isDocked=true ile tekil, kompakt ve lüks pencere başlığı) */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <TerminalView
              isDocked={true}
              onClose={closeDock}
              onMinimize={() => setIsMinimized(true)}
            />
          </div>
        </aside>
      )}

      {/* ═══ 2. KÜÇÜLTÜLMÜŞ / SABİT KAPTAN KONSOLU BUTONU ═══ */}
      {(!isOpen || isMinimized) && (
        <div className="fixed bottom-5 right-5 z-40 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <button
            type="button"
            onClick={openDock}
            title="Kaptan Terminalini Aç (Ctrl + `)"
            className="group relative inline-flex items-center gap-2.5 rounded-full border border-[#c8a87c]/60 bg-gradient-to-r from-[#580619] via-[#720a22] to-[#580619] px-4 py-2.5 text-xs font-bold text-white shadow-[0_8px_25px_rgba(88,6,25,0.45)] hover:shadow-[0_12px_35px_rgba(200,168,124,0.4)] hover:border-[#dfc9a0] transition-all cursor-pointer hover:scale-105 active:scale-95"
          >
            <div className="size-6 rounded-full bg-black/40 flex items-center justify-center text-[#dfc9a0] border border-[#c8a87c]/40 group-hover:rotate-12 transition-transform">
              <TerminalIcon className="size-3.5 text-[#dfc9a0]" />
            </div>
            <span className="font-heading tracking-wider font-extrabold text-[11px] text-white">
              KONSOLU AÇ
            </span>
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
            <kbd className="hidden sm:inline bg-black/50 text-[10px] font-mono px-2 py-0.5 rounded-full text-[#dfc9a0] border border-[#c8a87c]/40 shadow-inner">
              Ctrl+`
            </kbd>
          </button>
        </div>
      )}
    </>
  )
}