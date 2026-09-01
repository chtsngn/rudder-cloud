"use client"

import "@xterm/xterm/css/xterm.css"

import { useEffect, useRef, useState } from "react"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import { Loader2, RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"

type ConnectionState = "connecting" | "connected" | "closed" | "error"

/**
 * xterm.js + WebSocket üzerinden `panel` kullanıcısının kendi kabuğuna
 * bağlanır (bkz. server.mjs, `/api/terminal/socket`). Tarayıcı-özel API'ler
 * (WebSocket, `document`) kullandığı için bu bileşen yalnızca
 * `next/dynamic({ ssr: false })` ile yükleniyor — Monaco editörle (Aşama C)
 * aynı desen.
 *
 * KASITLI kapsam dışı bırakma: bağlantı koptuğunda (ağ sorunu, sekme
 * uyandı vb.) kabuk süreci sunucu tarafında ÖLDÜRÜLÜR (bkz. server.mjs
 * `ws.on("close", cleanup)`) — sekme geçmişi/çalışan komut KORUNMAZ.
 * tmux/screen benzeri kalıcı oturum çoğullama bu aşamanın kapsamı dışında
 * tutuldu (bkz. docs/ARCHITECTURE.md → Aşama F).
 */
export function TerminalView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<ConnectionState>("connecting")
  const [exitMessage, setExitMessage] = useState<string | null>(null)
  const [reconnectKey, setReconnectKey] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    setState("connecting")
    setExitMessage(null)

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "var(--font-mono, ui-monospace, monospace)",
      theme: { background: "#0a0a0a" },
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)
    fitAddon.fit()

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
    const ws = new WebSocket(`${proto}//${window.location.host}/api/terminal/socket`)

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
      } catch {
        // beklenmeyen çerçeve — yok say
      }
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
        fitAddon.fit()
        sendResize()
      }, 100)
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
    }
  }, [reconnectKey])

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {state === "connecting" && (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Bağlanıyor...
            </>
          )}
          {state === "connected" && (
            <>
              <span className="size-2 rounded-full bg-success" />
              Bağlı — <span className="font-mono">panel</span> kullanıcısı
            </>
          )}
          {(state === "closed" || state === "error") && (
            <>
              <span className="size-2 rounded-full bg-destructive" />
              {exitMessage ?? "Bağlantı kesildi."}
            </>
          )}
        </div>
        {(state === "closed" || state === "error") && (
          <Button variant="outline" size="sm" onClick={() => setReconnectKey((k) => k + 1)}>
            <RotateCw className="size-3.5" />
            Yeniden Bağlan
          </Button>
        )}
      </div>
      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-[#0a0a0a] p-2"
      />
    </div>
  )
}
