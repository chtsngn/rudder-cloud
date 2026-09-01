#!/usr/bin/env node
/**
 * Özel Next.js server'ı (Aşama F — sunucu terminali).
 *
 * Neden gerekli: plain `next start`, xterm.js'in kullandığı WebSocket
 * upgrade'ini desteklemiyor — bu yüzden Next.js'in resmi "custom server"
 * deseniyle (bkz. https://nextjs.org/docs/app/guides/custom-server) kendi
 * HTTP server'ımızı kuruyoruz: normal istekleri Next'e devrediyoruz, yalnızca
 * TERMINAL_WS_PATH'e gelen upgrade isteklerini kendimiz karşılıyoruz.
 *
 * `next({ httpServer })` seçeneği KASITLI kullanıldı: Next'in kendi
 * ihtiyaçları (özellikle dev modunda HMR websocket'i) aynı server nesnesine
 * bağlanabilsin diye. Kendi 'upgrade' dinleyicimiz yalnızca TERMINAL_WS_PATH
 * ile eşleşen istekleri işliyor, eşleşmeyenlere HİÇ DOKUNMUYOR — böylece
 * Next'in kendi upgrade dinleyicisi (varsa) bozulmuyor.
 *
 * Bu dosya Next.js/TypeScript derleme zincirinden GEÇMİYOR (bkz. Next
 * dokümantasyonu: "server.js does not run through the Next.js Compiler").
 * Bu yüzden `src/lib/session.ts`'teki oturum doğrulama sabitlerinin/
 * mantığının bir alt kümesini burada KASITLI olarak tekrar ediyoruz
 * (session.ts TypeScript, bu dosya derlemesiz çalışan düz bir Node ESM
 * betiği — proje zaten `scripts/create-admin.mjs` için aynı deseni
 * kullanıyor). SESSION_COOKIE_NAME veya AUTH_SECRET okuma mantığı
 * değişirse İKİSİ DE güncellenmeli.
 */
import { existsSync } from "node:fs"
import { createServer } from "node:http"
import { homedir } from "node:os"
import { parse } from "node:url"

import { PrismaClient } from "@prisma/client"
import { jwtVerify } from "jose"
import next from "next"
import pty from "node-pty"
import { WebSocketServer } from "ws"

const dev = process.env.NODE_ENV !== "production"
const port = parseInt(process.env.PORT || "3000", 10)

const TERMINAL_WS_PATH = "/api/terminal/socket"
const SESSION_COOKIE_NAME = "panel_session" // bkz. src/lib/session.ts
const DEV_ONLY_FALLBACK_SECRET = "panel-dev-only-insecure-secret-change-me"
const MAX_WS_PAYLOAD_BYTES = 1024 * 1024 // 1 MB — büyük bir yapıştırma için bile fazlasıyla yeterli

// `src/lib/prisma.ts`'teki dev-mode hot-reload singleton'ı bu dosyaya
// uygulanmıyor (server.mjs zaten yalnızca process başlangıcında BİR KEZ
// çalışıyor, HMR'a tabi değil) — bu yüzden burada ayrı, basit bir örnek
// yeterli.
const prisma = new PrismaClient()

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET
  if (secret && secret.length > 0) {
    return new TextEncoder().encode(secret)
  }
  if (!dev) {
    throw new Error("AUTH_SECRET ortam değişkeni tanımlı değil.")
  }
  return new TextEncoder().encode(DEV_ONLY_FALLBACK_SECRET)
}

function parseCookie(header, name) {
  if (!header) return null
  for (const part of header.split(";")) {
    const idx = part.indexOf("=")
    if (idx === -1) continue
    if (part.slice(0, idx).trim() !== name) continue
    try {
      return decodeURIComponent(part.slice(idx + 1).trim())
    } catch {
      return part.slice(idx + 1).trim()
    }
  }
  return null
}

async function isAuthorizedTerminalRequest(req) {
  const token = parseCookie(req.headers.cookie, SESSION_COOKIE_NAME)
  if (!token) return false
  let userId
  try {
    const { payload } = await jwtVerify(token, getAuthSecret())
    userId = payload.userId
    if (typeof userId !== "string") return false
  } catch {
    return false
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
    // Terminal SADECE SUPER_ADMIN'e açık (bkz. yukarıdaki not) — MEMBER
    // hesapları, kendilerine site bazlı `UserSiteAccess` ile verilmiş
    // izinlerle sınırlı; ham kabuk erişimi bu modelin tamamen dışında.
    return user?.role === "SUPER_ADMIN"
  } catch (error) {
    console.error("Terminal yetki kontrolü başarısız (DB erişilemedi):", error)
    return false
  }
}

/**
 * `panel` sistem kullanıcısının `/etc/passwd`'deki shell'i KASITLI olarak
 * `/usr/sbin/nologin` (bkz. doctor.sh → `useradd --shell /usr/sbin/nologin`)
 * — SSH/login yoluyla bu hesaba oturum açılmasını engellemek için. node-pty
 * burada bir login akışı KULLANMIYOR, doğrudan bir kabuk binary'sini exec
 * ediyor — bu yüzden shell yolu `process.env.SHELL`'den veya işletim sistemi
 * kullanıcı kaydından (`os.userInfo().shell`) ASLA okunmamalı: okunsaydı
 * `/usr/sbin/nologin` dönerdi ve terminal komple bozulurdu. Ubuntu/Debian'da
 * (doctor.sh'ın hedeflediği tek OS ailesi) bash her zaman mevcuttur.
 */
function resolveShell() {
  return existsSync("/bin/bash") ? "/bin/bash" : "/bin/sh"
}

const httpServer = createServer()
const app = next({ dev, httpServer, port })
const handle = app.getRequestHandler()

httpServer.on("request", (req, res) => {
  handle(req, res)
})

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_PAYLOAD_BYTES })
const livePtys = new Set()

httpServer.on("upgrade", (req, socket, head) => {
  const { pathname } = parse(req.url || "")
  if (pathname !== TERMINAL_WS_PATH) {
    // Next.js'in kendi upgrade ihtiyaçları için dokunmuyoruz — aynı
    // `httpServer` nesnesi yukarıda `next({ httpServer })`'a verildi.
    return
  }

  isAuthorizedTerminalRequest(req)
    .then((ok) => {
      if (!ok) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n")
        socket.destroy()
        return
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req)
      })
    })
    .catch(() => {
      socket.destroy()
    })
})

wss.on("connection", (ws) => {
  let ptyProcess
  try {
    ptyProcess = pty.spawn(resolveShell(), [], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: homedir(),
      env: { ...process.env, TERM: "xterm-256color" },
    })
  } catch (error) {
    ws.send(
      JSON.stringify({
        type: "exit",
        code: null,
        message: `Kabuk başlatılamadı: ${error instanceof Error ? error.message : String(error)}`,
      })
    )
    ws.close()
    return
  }

  livePtys.add(ptyProcess)

  const dataSub = ptyProcess.onData((data) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: "data", data }))
    }
  })

  const exitSub = ptyProcess.onExit(({ exitCode }) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: "exit", code: exitCode }))
      ws.close()
    }
  })

  function cleanup() {
    livePtys.delete(ptyProcess)
    dataSub.dispose()
    exitSub.dispose()
    try {
      ptyProcess.kill()
    } catch {
      // süreç zaten sonlanmış olabilir — yok say
    }
  }

  ws.on("message", (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }
    if (msg && msg.type === "input" && typeof msg.data === "string") {
      ptyProcess.write(msg.data)
    } else if (
      msg &&
      msg.type === "resize" &&
      Number.isInteger(msg.cols) &&
      Number.isInteger(msg.rows) &&
      msg.cols > 0 &&
      msg.rows > 0 &&
      msg.cols <= 500 &&
      msg.rows <= 500
    ) {
      try {
        ptyProcess.resize(msg.cols, msg.rows)
      } catch {
        // pty zaten kapanmış olabilir — yok say
      }
    }
  })

  ws.on("close", cleanup)
  ws.on("error", cleanup)
})

function shutdown() {
  for (const p of livePtys) {
    try {
      p.kill()
    } catch {
      // yok say
    }
  }
  // `$disconnect()` teorik olarak asılı kalabilir — systemd zaten
  // TimeoutStopSec sonrası SIGKILL gönderir, ama yine de kendi güvenlik
  // ağımızı koyalım (ssh-keygen timeout bulgusuyla aynı disiplin, bkz.
  // Aşama E → docs/ARCHITECTURE.md).
  const forceExit = setTimeout(() => process.exit(0), 3000)
  forceExit.unref()
  prisma.$disconnect().finally(() => process.exit(0))
}
process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)

app.prepare().then(() => {
  httpServer.listen(port, () => {
    console.log(
      `> Sunucu Yönetim Paneli dinliyor: :${port} (${dev ? "development" : process.env.NODE_ENV})`
    )
  })
})
