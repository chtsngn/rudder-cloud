"use client"

import "@xterm/xterm/css/xterm.css"

import { useEffect, useRef, useState, useMemo } from "react"
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
  Plus,
  Trash2,
  Search,
  BookOpen,
  X,
  CornerDownLeft,
  Copy,
  Layers,
  Server,
  Activity,
  Shield,
  Check,
  Pin,
  PinOff,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTheme } from "@/components/theme-provider"
import { useTranslation } from "@/components/language-provider"
import { cn } from "@/lib/utils"

type ConnectionState = "connecting" | "connected" | "closed" | "error"

export interface QuickCommandItem {
  id: string
  label: string
  cmd: string
  desc?: string
  category: "custom" | "system" | "docker" | "nginx" | "network"
  isCustom?: boolean
  isPinned?: boolean
}

const DEFAULT_PRESETS: QuickCommandItem[] = [
  { id: "htop", label: "htop", cmd: "htop", desc: "Sistem Kaynakları & İşlem İzleme", category: "system" },
  { id: "docker-ps", label: "docker ps", cmd: "docker ps", desc: "Aktif Docker Konteynerleri", category: "docker" },
  { id: "nginx-t", label: "nginx -t", cmd: "nginx -t", desc: "Nginx Sözdizim Testi", category: "nginx" },
  { id: "df-h", label: "df -h", cmd: "df -h", desc: "Disk Kullanım Oranları", category: "system" },
  { id: "free-m", label: "free -m", cmd: "free -m -h", desc: "Bellek (RAM & Swap) Durumu", category: "system" },
  { id: "uptime", label: "uptime", cmd: "uptime", desc: "Sistem Çalışma Süresi & Yükü", category: "system" },
  { id: "journalctl", label: "journalctl", cmd: "journalctl -n 50 --no-pager", desc: "Son Sistem Günlükleri", category: "system" },
  { id: "clear", label: "clear", cmd: "clear", desc: "Konsol Ekranını Temizle", category: "system" },
]

const LIBRARY_PRESETS: QuickCommandItem[] = [
  // Docker
  { id: "d-stats", label: "docker stats", cmd: "docker stats --no-stream", desc: "Konteyner CPU/RAM tüketim özeti", category: "docker" },
  { id: "d-logs", label: "docker logs", cmd: "docker logs --tail 100 -f <container_name>", desc: "Konteyner canlı log akışı", category: "docker" },
  { id: "d-prune", label: "docker prune", cmd: "docker system prune -f", desc: "Kullanılmayan imaj ve önbellekleri temizle", category: "docker" },
  { id: "d-compose-restart", label: "docker compose restart", cmd: "docker compose restart", desc: "Compose servislerini yeniden başlat", category: "docker" },
  // Nginx
  { id: "nginx-reload", label: "nginx reload", cmd: "systemctl reload nginx", desc: "Nginx yapılandırmasını kesintisiz uygula", category: "nginx" },
  { id: "nginx-logs", label: "nginx error logs", cmd: "tail -n 50 /var/log/nginx/error.log", desc: "Son Nginx hata kayıtları", category: "nginx" },
  { id: "certbot-renew", label: "certbot dry-run", cmd: "certbot renew --dry-run", desc: "SSL sertifika yenileme simülasyonu", category: "nginx" },
  // Ağ & Portlar
  { id: "ss-ports", label: "ss listening ports", cmd: "ss -tulpn", desc: "Dinlenen tüm TCP/UDP portları", category: "network" },
  { id: "ufw-status", label: "ufw status", cmd: "ufw status verbose", desc: "Güvenlik duvarı kuralları", category: "network" },
  { id: "curl-ip", label: "external ip", cmd: "curl -s https://ifconfig.me", desc: "Sunucunun harici IP adresini öğren", category: "network" },
  { id: "ping-test", label: "ping gateway", cmd: "ping -c 4 1.1.1.1", desc: "İnternet bağlantı gecikme testi", category: "network" },
]

const STORAGE_KEY = "rudder:terminal:custom-commands"
const USAGE_STORAGE_KEY = "rudder:terminal:command-usage"

export interface TerminalViewProps {
  isDocked?: boolean
  onClose?: () => void
  onMinimize?: () => void
}

export function TerminalView({ isDocked = false, onClose, onMinimize }: TerminalViewProps) {
  const { theme } = useTheme()
  const { t, lang } = useTranslation()
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

  // Özel Komutlar & Kullanım Sayıları
  const [customCommands, setCustomCommands] = useState<QuickCommandItem[]>([])
  const [commandUsage, setCommandUsage] = useState<Record<string, number>>({})
  
  // Modallar
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isLibraryOpen, setIsLibraryOpen] = useState(false)
  const [isPaletteOpen, setIsPaletteOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState("")
  const [paletteSelectedIndex, setPaletteSelectedIndex] = useState(0)

  // Kitaplık Arama & Kategori
  const [librarySearchQuery, setLibrarySearchQuery] = useState("")
  const [libraryCategory, setLibraryCategory] = useState<string>("all")

  // Yeni Komut Ekleme Form Alanları
  const [newLabel, setNewLabel] = useState("")
  const [newCmd, setNewCmd] = useState("")
  const [newDesc, setNewDesc] = useState("")
  const [newIsPinned, setNewIsPinned] = useState(false)

  // Kopyalandı geribildirimi
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // localStorage'dan özel komutları ve kullanım sıklıklarını oku
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        setCustomCommands(JSON.parse(saved))
      }
      const savedUsage = localStorage.getItem(USAGE_STORAGE_KEY)
      if (savedUsage) {
        setCommandUsage(JSON.parse(savedUsage))
      }
    } catch {}
  }, [])

  // Özel komutları kaydet
  const saveCustomCommands = (items: QuickCommandItem[]) => {
    setCustomCommands(items)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {}
  }

  // Yeni özel komut ekle
  const handleAddCommand = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newLabel.trim() || !newCmd.trim()) return

    const item: QuickCommandItem = {
      id: `custom-${Date.now()}`,
      label: newLabel.trim(),
      cmd: newCmd.trim(),
      desc: newDesc.trim() || undefined,
      category: "custom",
      isCustom: true,
      isPinned: newIsPinned,
    }

    const updated = [...customCommands, item]
    saveCustomCommands(updated)
    setNewLabel("")
    setNewCmd("")
    setNewDesc("")
    setNewIsPinned(false)
    setIsAddModalOpen(false)
  }

  // Özel komut sabitleme durumunu değiştir (Pin / Unpin)
  const togglePinCommand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const updated = customCommands.map((c) =>
      c.id === id ? { ...c, isPinned: !c.isPinned } : c
    )
    saveCustomCommands(updated)
  }

  // Özel komut sil
  const handleDeleteCustomCommand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const updated = customCommands.filter((c) => c.id !== id)
    saveCustomCommands(updated)
  }

  // Kitaplıktan hızlı bara sabitle
  const handlePinFromLibrary = (item: QuickCommandItem) => {
    const existing = customCommands.find((c) => c.cmd === item.cmd)
    if (existing) {
      togglePinCommand(existing.id, { stopPropagation: () => {} } as React.MouseEvent)
    } else {
      const newCustom: QuickCommandItem = {
        id: `lib-pinned-${Date.now()}`,
        label: item.label,
        cmd: item.cmd,
        desc: item.desc,
        category: "custom",
        isCustom: true,
        isPinned: true,
      }
      saveCustomCommands([...customCommands, newCustom])
    }
  }

  // Tüm komutlar (Presets + Custom + Library)
  const allCommands = useMemo(() => {
    return [...customCommands, ...DEFAULT_PRESETS, ...LIBRARY_PRESETS]
  }, [customCommands])

  // Hızlı Komut Barı Sıralaması:
  // 1. Sabitlenmiş Komutlar (isPinned = true)
  // 2. En Sık Kullanılan Komutlar (kullanım sıklığına göre azalan)
  const sortedQuickCommands = useMemo(() => {
    const all = [...customCommands, ...DEFAULT_PRESETS]
    return all.sort((a, b) => {
      const aPinned = a.isPinned ? 1 : 0
      const bPinned = b.isPinned ? 1 : 0
      if (aPinned !== bPinned) return bPinned - aPinned

      const aCount = commandUsage[a.id] || 0
      const bCount = commandUsage[b.id] || 0
      return bCount - aCount
    })
  }, [customCommands, commandUsage])

  // Filtrelenmiş Kitaplık Komutları
  const filteredLibraryCommands = useMemo(() => {
    return LIBRARY_PRESETS.filter((item) => {
      if (libraryCategory !== "all" && item.category !== libraryCategory) return false
      if (librarySearchQuery.trim()) {
        const q = librarySearchQuery.toLowerCase()
        return (
          item.label.toLowerCase().includes(q) ||
          item.cmd.toLowerCase().includes(q) ||
          (item.desc && item.desc.toLowerCase().includes(q))
        )
      }
      return true
    })
  }, [libraryCategory, librarySearchQuery])

  // Palette için filtrelenmiş komutlar
  const filteredPaletteCommands = useMemo(() => {
    if (!paletteQuery.trim()) return allCommands
    const q = paletteQuery.toLowerCase()
    return allCommands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.cmd.toLowerCase().includes(q) ||
        (c.desc && c.desc.toLowerCase().includes(q))
    )
  }, [allCommands, paletteQuery])

  // Palette klavye kısayolu (Ctrl + K / Cmd + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setIsPaletteOpen((prev) => !prev)
        setPaletteQuery("")
        setPaletteSelectedIndex(0)
      } else if (e.key === "Escape") {
        if (isPaletteOpen) {
          setIsPaletteOpen(false)
        } else if (isFullscreen) {
          setIsFullscreen(false)
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isPaletteOpen, isFullscreen])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    setState("connecting")
    setExitMessage(null)

    const isDark =
      (typeof window !== "undefined" &&
        (document.documentElement.classList.contains("dark") ||
          document.documentElement.getAttribute("data-theme") === "dark" ||
          localStorage.getItem("rudder:theme") === "dark")) ||
      theme === "dark"

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: fontSize,
      fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, Menlo, Monaco, Consolas, monospace",
      lineHeight: 1.25,
      letterSpacing: 0,
      theme: {
        background: isDark ? "#040711" : "#0a0d14",
        foreground: "#e2e8f0",
        cursor: isDark ? "#60a5fa" : "#dfc9a0",
        cursorAccent: isDark ? "#040711" : "#0a0d14",
        selectionBackground: isDark ? "rgba(37, 99, 235, 0.35)" : "rgba(200, 168, 124, 0.35)",
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

    if (isDark) {
      term.writeln(`\x1b[38;2;147;197;253m${t("terminal.bannerTitle")}\x1b[0m`)
    } else {
      term.writeln(`\x1b[38;2;223;201;160m${t("terminal.bannerTitle")}\x1b[0m`)
    }
    term.writeln(`\x1b[90m${t("terminal.bannerConnecting")}\x1b[0m\r\n`)

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

  // Tema değiştiğinde açık olan terminal renklerini dinamik güncelle
  useEffect(() => {
    if (!termRef.current) return
    const isDark =
      (typeof window !== "undefined" &&
        (document.documentElement.classList.contains("dark") ||
          document.documentElement.getAttribute("data-theme") === "dark" ||
          localStorage.getItem("rudder:theme") === "dark")) ||
      theme === "dark"

    termRef.current.options.theme = {
      background: isDark ? "#040711" : "#0a0d14",
      foreground: "#e2e8f0",
      cursor: isDark ? "#60a5fa" : "#dfc9a0",
      cursorAccent: isDark ? "#040711" : "#0a0d14",
      selectionBackground: isDark ? "rgba(37, 99, 235, 0.35)" : "rgba(200, 168, 124, 0.35)",
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
    }
  }, [theme])

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

  // Komut çalıştırma (Execute with Enter + Usage count update)
  const handleExecuteCommand = (cmd: string, commandId?: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "input", data: cmd + "\r" }))
      termRef.current?.focus()

      const targetId = commandId || allCommands.find((c) => c.cmd === cmd)?.id
      if (targetId) {
        setCommandUsage((prev) => {
          const updated = { ...prev, [targetId]: (prev[targetId] || 0) + 1 }
          try {
            localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(updated))
          } catch {}
          return updated
        })
      }
    }
  }

  // Komutu terminale yapıştırma (Paste without Enter)
  const handlePasteCommand = (cmd: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "input", data: cmd }))
      termRef.current?.focus()
    }
  }

  // Ekranı temizleme
  const handleClear = () => {
    termRef.current?.clear()
    termRef.current?.focus()
  }

  // Tam ekran toggle (sayfa değiştirmeden modal fullscreen yapar)
  const toggleFullscreen = () => {
    setIsFullscreen((prev) => {
      const next = !prev
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
      }, 120)
      return next
    })
  }

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "flex flex-col gap-2.5 transition-all relative w-full h-full",
        isFullscreen &&
          "fixed inset-0 z-50 bg-[#0a0d14] p-4 h-screen w-screen backdrop-blur-md"
      )}
    >
      {/* ═══ 1. WORKSTATION PENCERE KASASI ═══ */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800 dark:border-[#16223f] bg-[#0a0d14] dark:bg-[#040711] shadow-[0_12px_36px_rgba(0,0,0,0.4)]">
        {/* Başlık Çubuğu (Workstation Titlebar) */}
        <div className="flex items-center justify-between border-b border-slate-800/90 dark:border-[#16223f] bg-[#111622] dark:bg-[#090e1f] px-3.5 py-2 select-none shrink-0 min-h-[42px]">
          {/* Sol: macOS Trafik Işıkları & Host Etiketi */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onClose || (() => {})}
                title={isDocked ? "Terminal Penceresini Kapat" : "Kapat"}
                className={cn(
                  "size-3 rounded-full bg-[#ff5f56] border border-[#e0443e] block",
                  isDocked ? "hover:opacity-80 cursor-pointer" : "cursor-default"
                )}
              />
              <button
                type="button"
                onClick={onMinimize || (() => {})}
                title={isDocked ? "Simge Durumuna Küçült" : "Küçült"}
                className={cn(
                  "size-3 rounded-full bg-[#ffbd2e] border border-[#dea123] block",
                  isDocked ? "hover:opacity-80 cursor-pointer" : "cursor-default"
                )}
              />
              <button
                type="button"
                onClick={toggleFullscreen}
                title={isFullscreen ? "Pencereyi Küçült" : "Tam Ekran Yap"}
                className="size-3 rounded-full bg-[#27c93f] border border-[#1aab29] block hover:opacity-80 cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-[#dfc9a0] dark:text-slate-200">
              <TerminalIcon className="size-3.5 text-[#c8a87c] dark:text-blue-300 shrink-0" />
              <span className="truncate max-w-[140px] sm:max-w-none text-slate-200 dark:text-slate-100 font-bold">
                root@rudder-cloud:~
              </span>
            </div>
          </div>

          {/* Orta: Canlı Durum Noktası */}
          <div className="flex items-center gap-1.5 shrink-0 px-1">
            {state === "connected" && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 dark:border-emerald-500/40 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.8)]" />
                <span className="hidden sm:inline">{t("terminal.connected")}</span>
              </span>
            )}
            {state === "connecting" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-mono text-amber-400">
                <Loader2 className="size-2.5 animate-spin" />
              </span>
            )}
            {(state === "closed" || state === "error") && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 dark:bg-rose-950/40 border border-rose-500/30 dark:border-rose-900/60 px-2 py-0.5 text-[10px] font-mono text-rose-400">
                <span className="size-1.5 rounded-full bg-rose-400" />
                <span className="hidden sm:inline">{t("terminal.disconnected")}</span>
              </span>
            )}
          </div>

          {/* Sağ: Terminal Kontrol Araçları */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Komut Paleti Butonu */}
            <button
              type="button"
              onClick={() => {
                setIsPaletteOpen(true)
                setPaletteQuery("")
              }}
              title={t("terminal.commandPalette")}
              className="h-6.5 px-2 flex items-center gap-1 rounded-md border border-slate-700/60 dark:border-[#16223f] bg-slate-900/90 dark:bg-[#060a17] text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-blue-300 hover:border-[#c8a87c] dark:hover:border-[#2a4687] transition-all cursor-pointer text-xs"
            >
              <Command className="size-3 text-[#c8a87c] dark:text-blue-300" />
              <kbd className="text-[9px] font-mono text-slate-400">Ctrl+K</kbd>
            </button>

            {/* Yazı Boyutu */}
            <div className="hidden xs:flex items-center bg-slate-900/90 dark:bg-[#060a17] rounded-md border border-slate-700/60 dark:border-[#16223f] p-0.5">
              <button
                type="button"
                onClick={() => handleZoom(-1)}
                title={t("terminal.zoomOut")}
                className="size-5 flex items-center justify-center text-slate-400 hover:text-white dark:hover:text-slate-200 rounded transition-colors cursor-pointer"
              >
                <ZoomOut className="size-3" />
              </button>
              <span className="font-mono text-[9px] text-slate-300 px-1">{fontSize}px</span>
              <button
                type="button"
                onClick={() => handleZoom(1)}
                title={t("terminal.zoomIn")}
                className="size-5 flex items-center justify-center text-slate-400 hover:text-white dark:hover:text-slate-200 rounded transition-colors cursor-pointer"
              >
                <ZoomIn className="size-3" />
              </button>
            </div>

            {/* Ekranı Temizle */}
            <button
              type="button"
              onClick={handleClear}
              title={t("terminal.clear")}
              className="size-6.5 flex items-center justify-center rounded-md border border-slate-700/60 dark:border-[#16223f] bg-slate-900/90 dark:bg-[#060a17] text-slate-400 hover:text-white dark:hover:text-slate-200 hover:border-slate-600 dark:hover:border-[#2a4687] transition-all cursor-pointer"
            >
              <Eraser className="size-3" />
            </button>

            {/* Yeniden Bağlan Butonu */}
            <button
              type="button"
              onClick={() => setReconnectKey((k) => k + 1)}
              title={t("terminal.reconnect")}
              className={cn(
                "size-6.5 flex items-center justify-center rounded-md border text-xs font-semibold transition-all cursor-pointer",
                state === "closed" || state === "error"
                  ? "bg-[#580619] dark:bg-[#162752] border-[#c8a87c] dark:border-[#2a4687] text-white dark:text-blue-200 hover:bg-[#720a22] dark:hover:bg-[#1e346b] animate-pulse shadow-xs"
                  : "border-slate-700/60 dark:border-[#16223f] bg-slate-900/90 dark:bg-[#060a17] text-slate-400 hover:text-white dark:hover:text-slate-200 hover:border-slate-600 dark:hover:border-[#2a4687]"
              )}
            >
              <RotateCw className={cn("size-3", state === "connecting" && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* ── 2. XTERM EKRAN ALANI ── */}
        <div
          ref={containerRef}
          className="min-h-0 flex-1 overflow-hidden p-2.5 focus:outline-none"
          onClick={() => termRef.current?.focus()}
        />
      </div>

      {/* ═══ 2. HIZLI KOMUT ÇİPLERİ & YÖNETİM BAR (TAM OVAL / ROUNDED-FULL KART TASARIMI) ═══ */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto py-1.5 px-3 bg-[#0d121f]/95 dark:bg-[#070b17]/95 border border-slate-700/80 dark:border-[#16223f] rounded-full shadow-lg text-xs shrink-0 scrollbar-none">
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Komut Ekle Butonu */}
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#c8a87c]/80 dark:border-[#2a4687]/60 bg-[#580619] dark:bg-[#162752] px-3 py-1.5 font-bold text-[11px] text-white shadow-xs hover:bg-[#720a22] dark:hover:bg-[#1e346b] hover:border-[#dfc9a0] dark:hover:border-[#385db3] transition-all cursor-pointer shrink-0 active:scale-95"
          >
            <Plus className="size-3.5 text-[#dfc9a0] dark:text-white" />
            {t("terminal.addCommand")}
          </button>

          {/* Kitaplık Butonu */}
          <button
            type="button"
            onClick={() => {
              setIsLibraryOpen(true)
              setLibrarySearchQuery("")
              setLibraryCategory("all")
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/80 dark:border-[#2a4687]/50 bg-[#161d2d] dark:bg-[#0e1730] px-3 py-1.5 font-bold text-[11px] text-[#dfc9a0] dark:text-blue-300 shadow-2xs hover:border-[#c8a87c] dark:hover:border-[#2a4687] hover:text-white hover:bg-[#1f283d] dark:hover:bg-[#142145] transition-all cursor-pointer shrink-0 active:scale-95"
          >
            <BookOpen className="size-3.5 text-[#c8a87c] dark:text-blue-300" />
            Komut Kitaplığı
          </button>
        </div>

        {/* Aktif Komut Çipleri (Sabitlenenler ve En Sık Kullanılanlar Önde) */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
          {sortedQuickCommands.map((qc) => {
            const isCustom = qc.isCustom
            const isPinned = qc.isPinned

            return (
              <div
                key={qc.id}
                className={cn(
                  "group relative inline-flex items-center rounded-full border transition-all shrink-0",
                  isPinned
                    ? "border-[#c8a87c] dark:border-[#2a4687]/60 bg-[#580619]/50 dark:bg-[#162752]/40 text-[#dfc9a0] dark:text-blue-200 hover:bg-[#580619]/70 dark:hover:bg-[#162752]/70 pl-2.5 pr-1.5 py-1 text-[11px] font-mono font-bold shadow-xs"
                    : isCustom
                    ? "border-slate-700/80 dark:border-[#16223f] bg-[#161d2d] dark:bg-[#0c1326] text-slate-300 hover:text-white hover:border-[#c8a87c] dark:hover:border-[#2a4687] pl-2.5 pr-1.5 py-1 text-[11px] font-mono font-semibold"
                    : "border-slate-700/80 dark:border-[#16223f] bg-[#111622] dark:bg-[#080d1a] hover:bg-[#1a2336] dark:hover:bg-[#0f172e] text-slate-300 hover:text-white hover:border-[#c8a87c] dark:hover:border-[#2a4687] px-3 py-1.5 text-[11px] font-mono font-semibold cursor-pointer"
                )}
              >
                <button
                  type="button"
                  onClick={() => handleExecuteCommand(qc.cmd, qc.id)}
                  title={`${qc.desc || qc.label} (${commandUsage[qc.id] || 0} kez çalıştırıldı)`}
                  className="flex items-center gap-1.5 cursor-pointer pr-0.5 active:scale-95"
                >
                  {isPinned ? (
                    <Pin className="size-3 text-[#dfc9a0] dark:text-blue-300 shrink-0 fill-[#dfc9a0] dark:fill-blue-300" />
                  ) : (
                    <ChevronRight className="size-3 text-slate-500 group-hover:text-[#c8a87c] dark:group-hover:text-blue-300 transition-colors" />
                  )}
                  <span>{qc.label}</span>
                </button>

                {/* Özel komutlar için Sabitleme & Silme İkonları */}
                {isCustom && (
                  <div className="flex items-center gap-0.5 ml-1">
                    <button
                      type="button"
                      onClick={(e) => togglePinCommand(qc.id, e)}
                      title={isPinned ? "Sabitlemeyi Kaldır" : "Hızlı Bar'a Sabitle"}
                      className={cn(
                        "size-4 rounded-full flex items-center justify-center transition-colors cursor-pointer",
                        isPinned
                          ? "text-[#dfc9a0] dark:text-blue-300 hover:text-white"
                          : "text-slate-500 hover:text-[#dfc9a0] dark:hover:text-blue-300"
                      )}
                    >
                      <Pin className={cn("size-2.5", isPinned && "fill-current")} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteCustomCommand(qc.id, e)}
                      title="Özel komutu sil"
                      className="size-4 rounded-full flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-950/50 transition-colors cursor-pointer"
                    >
                      <X className="size-2.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ═══ 3. ÖZEL KOMUT EKLEME MODALI (SABİTLEME SEÇENEKLİ) ═══ */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#16223f] pb-3">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-xl bg-[#580619]/10 dark:bg-[#101c38] text-[#580619] dark:text-blue-300 flex items-center justify-center">
                  <Plus className="size-4" />
                </div>
                <h3 className="font-heading font-bold text-base text-slate-900 dark:text-slate-100">
                  Özel Hızlı Komut Ekle
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="size-7 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleAddCommand} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="cmd-label" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Komut Başlığı / Kısa Adı
                </Label>
                <Input
                  id="cmd-label"
                  placeholder="Örn: PM2 Restart, Git Pull, Nginx Test"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="h-10 rounded-xl font-medium text-xs bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cmd-text" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Çalıştırılacak Bash / Terminal Komutu
                </Label>
                <Input
                  id="cmd-text"
                  placeholder="Örn: pm2 restart all veya cd /var/www && git pull"
                  value={newCmd}
                  onChange={(e) => setNewCmd(e.target.value)}
                  className="h-10 rounded-xl font-mono text-xs bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cmd-desc" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Açıklama (İsteğe bağlı)
                </Label>
                <Input
                  id="cmd-desc"
                  placeholder="Örn: Projeyi günceller ve sunucuyu yeniden başlatır"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="h-10 rounded-xl text-xs bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100"
                />
              </div>

              {/* Sabitleme Seçeneği */}
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-[#060a17] border border-slate-200/80 dark:border-[#16223f]">
                <input
                  type="checkbox"
                  id="cmd-pin"
                  checked={newIsPinned}
                  onChange={(e) => setNewIsPinned(e.target.checked)}
                  className="size-4 rounded accent-[#580619] dark:accent-[#162752] cursor-pointer"
                />
                <Label htmlFor="cmd-pin" className="text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer flex items-center gap-1.5 select-none">
                  <Pin className="size-3.5 text-[#580619] dark:text-blue-300 shrink-0" />
                  <span>Hızlı Bar'a Sabitle (Her zaman en önde dursun)</span>
                </Label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-[#16223f]">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddModalOpen(false)}
                  className="h-9 px-4 rounded-xl text-xs font-semibold dark:border-[#16223f] dark:text-slate-300 dark:hover:bg-[#111f40]"
                >
                  İptal
                </Button>
                <Button
                  type="submit"
                  className="bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white h-9 px-5 rounded-xl text-xs font-semibold border border-[#c8a87c]/40 dark:border-[#2a4687]/60 cursor-pointer"
                >
                  Komutu Kaydet
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ 4. KOMUT KİTAPLIĞI MODALI (ARAMA & SABİTLEME & DENGELİ LÜKS TASARIM) ═══ */}
      {isLibraryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#090e1f] shadow-2xl animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
            {/* Başlık */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#16223f] p-5 bg-slate-50/60 dark:bg-[#060a17] shrink-0">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-2xl bg-[#580619]/10 dark:bg-[#101c38] text-[#580619] dark:text-blue-300 border border-[#c8a87c]/30 dark:border-[#1e3568]/50 flex items-center justify-center shadow-2xs">
                  <BookOpen className="size-5 text-[#580619] dark:text-blue-300" />
                </div>
                <div>
                  <h3 className="font-heading font-extrabold text-lg text-slate-900 dark:text-slate-100">
                    Sunucu Komut Kitaplığı
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Sık kullanılan DevOps &amp; Sistem Yöneticisi hazır komut reçeteleri.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsLibraryOpen(false)}
                className="size-8 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Arama ve Kategori Filtresi Barı */}
            <div className="p-4 border-b border-slate-100 dark:border-[#16223f] bg-white dark:bg-[#090e1f] space-y-3 shrink-0">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <Input
                  value={librarySearchQuery}
                  onChange={(e) => setLibrarySearchQuery(e.target.value)}
                  placeholder="Kitaplıkta komut veya açıklama ara (örn: logs, prune, port, ssl)..."
                  className="pl-10 h-10 rounded-xl bg-slate-50 dark:bg-[#060a17] border-slate-200 dark:border-[#16223f] text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:bg-white dark:focus:bg-[#060a17] transition-all"
                />
                {librarySearchQuery && (
                  <button
                    onClick={() => setLibrarySearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              {/* Kategori Seçim Butonları */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                {[
                  { id: "all", label: "Tümü" },
                  { id: "docker", label: "Docker" },
                  { id: "nginx", label: "Nginx" },
                  { id: "network", label: "Ağ & Portlar" },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setLibraryCategory(cat.id)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer",
                      libraryCategory === cat.id
                        ? "bg-[#580619] dark:bg-[#162752] text-white shadow-2xs dark:border dark:border-[#2a4687]/60"
                        : "bg-slate-100 dark:bg-[#070c1a] text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-[#111f40] border border-transparent dark:border-[#16223f]"
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reçeteler Listesi */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {filteredLibraryCommands.length === 0 ? (
                <div className="py-16 text-center space-y-2">
                  <div className="size-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                    <Search className="size-5" />
                  </div>
                  <p className="font-heading font-bold text-sm text-slate-800 dark:text-slate-200">Eşleşen Komut Bulunamadı</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Farklı bir anahtar kelime ile aramayı deneyebilirsiniz.</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {filteredLibraryCommands.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col justify-between p-4 rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-slate-50/50 dark:bg-[#060a17] hover:bg-white dark:hover:bg-[#0c1429] hover:border-[#c8a87c]/80 dark:hover:border-[#2a4687] hover:shadow-xs transition-all space-y-3"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{item.label}</span>
                          <span className="text-[10px] font-bold uppercase bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md shrink-0 border border-slate-300/60 dark:border-slate-700">
                            {item.category}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">{item.desc}</p>
                        <code className="block mt-2 font-mono text-[10px] text-slate-800 dark:text-slate-200 bg-white dark:bg-[#030610] p-2 rounded-xl border border-slate-200/80 dark:border-[#16223f] select-all truncate">
                          {item.cmd}
                        </code>
                      </div>

                      <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-slate-200/60 dark:border-[#16223f]">
                        {/* Hızlı Bara Sabitle Butonu */}
                        <button
                          type="button"
                          onClick={() => handlePinFromLibrary(item)}
                          title="Hızlı Komut Barı'na Sabitle"
                          className="h-7 px-2.5 rounded-lg bg-slate-100 dark:bg-[#0e1730] hover:bg-[#580619]/10 dark:hover:bg-[#162752] text-slate-700 dark:text-slate-300 hover:text-[#580619] dark:hover:text-blue-300 text-[10px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-transparent dark:border-[#16223f]"
                        >
                          <Pin className="size-3 text-[#580619] dark:text-blue-300" />
                          <span>Sabitle</span>
                        </button>

                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              handlePasteCommand(item.cmd)
                              setIsLibraryOpen(false)
                            }}
                            className="h-7 text-[11px] px-2.5 rounded-lg border-slate-200 dark:border-[#16223f] bg-white dark:bg-[#070c1a] hover:bg-slate-100 dark:hover:bg-[#111f40] text-slate-700 dark:text-slate-200"
                          >
                            <Copy className="size-3 mr-1 text-slate-400" />
                            Yapıştır
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              handleExecuteCommand(item.cmd, item.id)
                              setIsLibraryOpen(false)
                            }}
                            className="h-7 text-[11px] px-3 rounded-lg bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white font-bold border border-[#c8a87c]/40 dark:border-[#2a4687]/60 cursor-pointer"
                          >
                            <CornerDownLeft className="size-3 mr-1 text-[#dfc9a0] dark:text-white" />
                            Çalıştır
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ 5. SPOTLIGHT KOMUT PALETİ (CTRL + K) ═══ */}
      {isPaletteOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsPaletteOpen(false)
          }}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-20 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-xl rounded-2xl border border-slate-700/80 dark:border-[#16223f] bg-[#0f141f] text-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 flex flex-col">
            {/* Arama Inputu & Kapatma Butonu */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 dark:border-[#16223f] bg-[#161c2b] dark:bg-[#070b17]">
              <Search className="size-4 text-[#c8a87c] dark:text-blue-300 shrink-0" />
              <input
                type="text"
                autoFocus
                placeholder="Komut ara (örn: docker, htop, nginx, git...)"
                value={paletteQuery}
                onChange={(e) => {
                  setPaletteQuery(e.target.value)
                  setPaletteSelectedIndex(0)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault()
                    setIsPaletteOpen(false)
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault()
                    setPaletteSelectedIndex((prev) =>
                      prev < filteredPaletteCommands.length - 1 ? prev + 1 : 0
                    )
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault()
                    setPaletteSelectedIndex((prev) =>
                      prev > 0 ? prev - 1 : filteredPaletteCommands.length - 1
                    )
                  } else if (e.key === "Enter" && filteredPaletteCommands[paletteSelectedIndex]) {
                    e.preventDefault()
                    const cmd = filteredPaletteCommands[paletteSelectedIndex]
                    if (e.shiftKey) {
                      handlePasteCommand(cmd.cmd)
                    } else {
                      handleExecuteCommand(cmd.cmd)
                    }
                    setIsPaletteOpen(false)
                  }
                }}
                className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 outline-none font-medium"
              />
              <button
                type="button"
                onClick={() => setIsPaletteOpen(false)}
                title="Pencereyi Kapat"
                className="size-7 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-700/80 dark:border-[#16223f] flex items-center justify-center transition-colors cursor-pointer shrink-0"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Komut Listesi */}
            <div className="max-h-80 overflow-y-auto p-2 space-y-1">
              {filteredPaletteCommands.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  Eşleşen komut bulunamadı.
                </div>
              ) : (
                filteredPaletteCommands.map((item, index) => {
                  const isSelected = index === paletteSelectedIndex
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        handleExecuteCommand(item.cmd)
                        setIsPaletteOpen(false)
                      }}
                      className={cn(
                        "w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-colors cursor-pointer",
                        isSelected
                          ? "bg-[#580619] dark:bg-[#162752] text-white"
                          : "text-slate-300 hover:bg-slate-800/60 dark:hover:bg-[#101c38]"
                      )}
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <TerminalIcon
                          className={cn(
                            "size-4 shrink-0",
                            isSelected ? "text-[#dfc9a0] dark:text-white" : "text-slate-500"
                          )}
                        />
                        <div className="truncate">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold">{item.label}</span>
                            {item.isCustom && (
                              <span className="text-[9px] bg-[#c8a87c]/20 dark:bg-[#101c38] text-[#dfc9a0] dark:text-blue-300 px-1.5 py-0.2 rounded font-sans uppercase border border-[#c8a87c]/30 dark:border-[#1e3568]/50">
                                Özel
                              </span>
                            )}
                          </div>
                          {item.desc && (
                            <p
                              className={cn(
                                "text-[11px] truncate",
                                isSelected ? "text-slate-200" : "text-slate-400"
                              )}
                            >
                              {item.desc}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 pl-2">
                        <span
                          className={cn(
                            "font-mono text-[10px] px-1.5 py-0.5 rounded",
                            isSelected ? "bg-black/30 text-[#dfc9a0] dark:text-white" : "bg-slate-800 dark:bg-[#070c1a] text-slate-400"
                          )}
                        >
                          Enter ↵
                        </span>
                      </div>
                    </button>
                  )
                })
              )}
            </div>

            {/* Alt Bilgi Çubuğu */}
            <div className="flex items-center justify-between border-t border-slate-800/80 bg-[#141a27] px-4 py-2 text-[11px] text-slate-400">
              <div className="flex items-center gap-3">
                <span><kbd className="font-mono bg-slate-800 px-1 rounded text-slate-300">↑↓</kbd> Gezin</span>
                <span><kbd className="font-mono bg-slate-800 px-1 rounded text-slate-300">Enter</kbd> Çalıştır</span>
                <span><kbd className="font-mono bg-slate-800 px-1 rounded text-slate-300">Shift+Enter</kbd> Yapıştır</span>
              </div>
              <span>{filteredPaletteCommands.length} komut</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


