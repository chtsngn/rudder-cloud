"use client"

import dynamic from "next/dynamic"
import { Terminal as TerminalIcon } from "lucide-react"

// xterm.js tarayıcı-özel API'ler kullanıyor (WebSocket, `document`) — Monaco
// editörle (Aşama C) aynı desen: `ssr: false` ile yalnızca istemcide yüklenir.
const TerminalView = dynamic(
  () => import("@/components/terminal-view").then((m) => m.TerminalView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[70vh] items-center justify-center rounded-lg border border-border text-sm text-muted-foreground">
        Terminal yükleniyor...
      </div>
    ),
  }
)

export default function TerminalPage() {
  return (
    <div className="flex h-full flex-col space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-semibold text-foreground">
          <TerminalIcon className="size-5" />
          Sunucu Terminali
        </h1>
        <p className="text-sm text-destructive">
          Bu kabuk <span className="font-semibold">root</span> yetkisiyle çalışır — burada
          çalıştırılan her komut tüm sunucuyu etkileyebilir. Sekme kapatılır veya bağlantı koparsa
          çalışan kabuk süreci sonlandırılır.
        </p>
      </div>
      <div className="h-[70vh]">
        <TerminalView />
      </div>
    </div>
  )
}
