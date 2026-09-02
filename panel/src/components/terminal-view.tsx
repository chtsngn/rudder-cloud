"use client"

import "@xterm/xterm/css/xterm.css"

import { useEffect, useRef, useState } from "react"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import {
  Loader2,
  RotateCw,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Eraser,
  Terminal as TerminalIcon,
  Sparkles,
  Command,
  ChevronRight,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ConnectionState = "connecting" | "connected" | "closed" | "error"

const QUICK_COMMANDS = [
  { label: "htop", cmd: "htop", desc: "Sistem Kaynakları" },
  { label: "docker ps", cmd: "docker ps", desc: "Konteynerler" },
  { label: "nginx -t", cmd: "nginx -t", desc: "Nginx Sözdizim Testi" },
  { label: "df -h", cmd: "df -h", desc: "Disk Kullanımı" },
  { label: "free -m", cmd: "free -m", desc: "Bellek Durumu" },
  { label: "uptime", cmd: "uptime", desc: "Çalışma Süresi" },
  { label: "journalctl", cmd: "journalctl -n 50 --no-pager", desc: "Son Loglar" },
  { label: "clear", cmd: "clear", desc: "Ekranı Temizle" },
]

export function TerminalView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const [state, setState] = useState<ConnectionState>("connecting")
  const [exitMessage, setExitMessage] = useState<string | null>(null)
  const [reconnectKey, setReconnectKey] = useState(0)
  const [fontSize, setFontSize] = useState(13)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    setState("connecting")
    setExitMessage(null)

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: fontSize,
      fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, Menlo, Monaco, Consolas, monospace",
      lineHeight: 1.25,
      letterSpacing: 0,
      theme: {
        background: "#0a0d14",
        foreground: "#e2e8f0",
        cursor: "#dfc9a0",
        cursorAccent: "#0a0d14",
        selectionBackground: "rgba(200, 168, 124, 0.35)",
        black: "#1e293b",
        red: "#f87171",
        green: "#4ade80",
        yellow: "#fbbf24",
        blue: "#60a5fa",
        magenta: "#c084fc",
        cyan: "#38bdf8",
        white: "#f8fafc",
        brightBlack: "#475569",
        brightRed: "#ef4444",
        brightGreen: "#22c55e",
        brightYellow: "#f59e0b",
        brightBlue: "#3b82f6",
        brightMagenta: "#a855f7",
        brightCyan: "#06b6d4",
        brightWhite: "#ffffff",
      },
    })
    termRef.current = term

    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    term.loadAddon(fitAddon)
    term.open(container)

    // Açılış banner yazısı
    term.writeln("\x1b[38;2;223;201;160m⛵ Rudder Cloud • Sunucu Web Terminali\x1b[0m")
    term.writeln("\x1b[90mBağlantı kuruluyor, lütfen bekleyin...\x1b[0m\r\n")

    setTimeout(() => {
      try {
        fitAddon.fit()
      } catch {}
    }, 50)

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
    const ws = new WebSocket(`${proto}//${window.location.host}/api/terminal/socket`)
    wsRef.current = ws

    function sendResize() {
      if (ws.readyState !== WebSocket.OPEN) return
      ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }))
    }

    ws.onopen = () => {
      setState("connected")
      fitAddon.fit()
      sendResize()
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as
          | { type: "data"; data: string }
          | { type: "exit"; code: number | null; message?: string }
        if (msg.type === "data") {
          term.write(msg.data)
        } else if (msg.type === "exit") {
          setState("closed")
          setExitMessage(msg.message ?? `Oturum sonlandı (kod: ${msg.code ?? "?"}).`)
        }
      } catch {}
    }

    ws.onclose = () => {
      setState((s) => (s === "connected" || s === "connecting" ? "closed" : s))
    }
    ws.onerror = () => {
      setState("error")
    }

    const dataDisposable = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }))
      }
    })

    let resizeTimer: ReturnType<typeof setTimeout> | undefined
    function handleWindowResize() {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        try {
          fitAddon.fit()
          sendResize()
        } catch {}
      }, 80)
    }
    window.addEventListener("resize", handleWindowResize)

    const resizeObserver = new ResizeObserver(handleWindowResize)
    resizeObserver.observe(container)

    return () => {
      clearTimeout(resizeTimer)
      window.removeEventListener("resize", handleWindowResize)
      resizeObserver.disconnect()
      dataDisposable.dispose()
      ws.close()
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
      wsRef.current = null
    }
  }, [reconnectKey])

  // Yazı boyutunu dinamik güncelleme
  const handleZoom = (delta: number) => {
    const newSize = Math.max(11, Math.min(22, fontSize + delta))
    setFontSize(newSize)
    if (termRef.current && fitAddonRef.current) {
      termRef.current.options.fontSize = newSize
      setTimeout(() => {
        try {
          fitAddonRef.current?.fit()
          if (wsRef.current?.readyState === WebSocket.OPEN && termRef.current) {
            wsRef.current.send(
              JSON.stringify({
                type: "resize",
                cols: termRef.current.cols,
                rows: termRef.current.rows,
              })
            )
          }
        } catch {}
      }, 50)
    }
  }

  // Hızlı komut gönderme
  const handleQuickCommand = (cmd: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "input", data: cmd + "\r" }))
      termRef.current?.focus()
    }
  }

  // Ekranı temizleme
  const handleClear = () => {
    termRef.current?.clear()
    termRef.current?.focus()
  }

  // Tam ekran toggle
  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev)
    setTimeout(() => {
      try {
        fitAddonRef.current?.fit()
      } catch {}
    }, 150)
  }

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "flex flex-col gap-3 transition-all",
        isFullscreen
          ? "fixed inset-0 z-50 bg-slate-950/95 p-4 backdrop-blur-md h-screen w-screen"
          : "h-full"
      )}
    >
      {/* ═══ 1. WORKSTATION PENCERE KASASI ═══ */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-700/60 bg-[#0a0d14] shadow-[0_12px_36px_rgba(0,0,0,0.35)]">
        {/* Başlık Çubuğu (Workstation Titlebar) */}
        <div className="flex items-center justify-between border-b border-slate-800/80 bg-[#111622] px-4 py-2.5 select-none">
          {/* Sol: macOS Trafik Işıkları & Host Etiketi */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-[#ff5f56] border border-[#e0443e] block" />
              <span className="size-3 rounded-full bg-[#ffbd2e] border border-[#dea123] block" />
              <span className="size-3 rounded-full bg-[#27c93f] border border-[#1aab29] block" />
            </div>

            <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-[#dfc9a0]">
              <TerminalIcon className="size-3.5 text-[#c8a87c]" />
              <span>root@rudder-cloud:~ (bash)</span>
            </div>
          </div>

          {/* Orta: Canlı Bağlantı Durumu */}
          <div className="hidden sm:flex items-center gap-2">
            {state === "connecting" && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-mono font-bold text-amber-400">
                <Loader2 className="size-3 animate-spin text-amber-400" />
                Bağlanıyor...
              </span>
            )}
            {state === "connected" && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-mono font-bold text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.8)]" />
                Bağlantı Aktif (Online)
              </span>
            )}
            {(state === "closed" || state === "error") && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/30 px-2.5 py-0.5 text-[11px] font-mono font-bold text-red-400">
                <span className="size-1.5 rounded-full bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
                {exitMessage ?? "Bağlantı Kesildi"}
              </span>
            )}
          </div>

          {/* Sağ: Terminal Kontrol Araçları */}
          <div className="flex items-center gap-1.5">
            {/* Yazı Boyutu */}
            <div className="flex items-center bg-slate-900/90 rounded-lg border border-slate-700/60 p-0.5">
              <button
                type="button"
                onClick={() => handleZoom(-1)}
                title="Yazıyı Küçült"
                className="size-6 flex items-center justify-center text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
              >
                <ZoomOut className="size-3.5" />
              </button>
              <span className="font-mono text-[10px] text-slate-300 px-1.5">{fontSize}px</span>
              <button
                type="button"
                onClick={() => handleZoom(1)}
                title="Yazıyı Büyüt"
                className="size-6 flex items-center justify-center text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
              >
                <ZoomIn className="size-3.5" />
              </button>
            </div>

            {/* Ekranı Temizle */}
            <button
              type="button"
              onClick={handleClear}
              title="Konsolu Temizle"
              className="size-7 flex items-center justify-center rounded-lg border border-slate-700/60 bg-slate-900/90 text-slate-400 hover:text-white hover:border-slate-600 transition-all cursor-pointer"
            >
              <Eraser className="size-3.5" />
            </button>

            {/* Yeniden Bağlan Butonu */}
            <button
              type="button"
              onClick={() => setReconnectKey((k) => k + 1)}
              title="Yeniden Bağlan"
              className={cn(
                "h-7 px-2.5 flex items-center gap-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer",
                state === "closed" || state === "error"
                  ? "bg-[#580619] border-[#c8a87c] text-white hover:bg-[#720a22] shadow-sm animate-pulse"
                  : "border-slate-700/60 bg-slate-900/90 text-slate-400 hover:text-white hover:border-slate-600"
              )}
            >
              <RotateCw className={cn("size-3.5", state === "connecting" && "animate-spin")} />
              <span className="hidden md:inline">Yeniden Bağlan</span>
            </button>

            {/* Tam Ekran */}
            <button
              type="button"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Tam Ekrandan Çık" : "Tam Ekran Yap"}
              className="size-7 flex items-center justify-center rounded-lg border border-slate-700/60 bg-slate-900/90 text-slate-400 hover:text-white hover:border-slate-600 transition-all cursor-pointer"
            >
              {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </button>
          </div>
        </div>

        {/* ── 2. XTERM EKRAN ALANI ── */}
        <div
          ref={containerRef}
          className="min-h-0 flex-1 overflow-hidden p-3 focus:outline-none"
          onClick={() => termRef.current?.focus()}
        />
      </div>

      {/* ═══ 2. HIZLI KOMUT ÇİPLERİ (QUICK SNIPPETS) ═══ */}
      {!isFullscreen && (
        <div className="flex items-center gap-2 overflow-x-auto py-1 text-xs">
          <div className="flex items-center gap-1 text-slate-500 font-bold text-[11px] shrink-0 uppercase tracking-wider pl-1">
            <Command className="size-3 text-[#c8a87c]" />
            <span>Hızlı Komutlar:</span>
          </div>

          <div className="flex items-center gap-1.5">
            {QUICK_COMMANDS.map((qc) => (
              <button
                key={qc.cmd}
                type="button"
                onClick={() => handleQuickCommand(qc.cmd)}
                title={qc.desc}
                className="group inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-mono text-[11px] font-bold text-slate-700 shadow-2xs hover:border-[#c8a87c] hover:bg-[#580619]/5 hover:text-[#580619] transition-all cursor-pointer active:scale-95"
              >
                <ChevronRight className="size-3 text-slate-400 group-hover:text-[#c8a87c]" />
                {qc.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

