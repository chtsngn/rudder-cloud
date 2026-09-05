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

// Yalnızca PANEL_DIR/.env dosyasından okunmuş değerleri process.env'e
// ekler, systemd'nin EnvironmentFile= ile zaten set ettiklerinin ÜZERİNE
// yazmaz — üretimde gereksiz ama zararsız, yerel `npm run dev` (systemd
// olmadan doğrudan `node server.mjs`) için gerekli.
import "dotenv/config"

import { PrismaPg } from "@prisma/adapter-pg"
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

// Nginx'in websocket tüneli için varsayılan ~60sn'lik boşta-kalma zaman
// aşımından KISA (bkz. install.sh → proxy_read_timeout/proxy_send_timeout):
// terminal hiç kullanılmasa bile bu aralıkla ping/pong trafiği akar, Nginx
// bağlantıyı ölü sanıp kapatmaz. Bu, PanelSettings.terminalIdleTimeoutSeconds
// ayarından TAMAMEN BAĞIMSIZ — o yalnızca gerçek kullanıcı girdisine dayalı,
// isteğe bağlı bir güvenlik zaman aşımı (bkz. aşağıdaki heartbeatInterval).
const HEARTBEAT_INTERVAL_MS = 20_000

// `src/lib/prisma.ts`'teki dev-mode hot-reload singleton'ı bu dosyaya
// uygulanmıyor (server.mjs zaten yalnızca process başlangıcında BİR KEZ
// çalışıyor, HMR'a tabi değil) — bu yüzden burada ayrı, basit bir örnek
// yeterli. Prisma 7: bağlantı artık @prisma/adapter-pg üzerinden (bkz.
// src/lib/prisma.ts'teki aynı gerekçe).
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

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

/**
 * Web terminali ROOT olarak çalışır (bkz. doctor.sh → "Panel sudoers" adım 2
 * — panel kullanıcısına yalnızca bu amaçla şifresiz `sudo /bin/bash`/`/bin/sh`
 * izni verilir). `-n` (non-interactive): sudoers izni eksik/bozuksa
 * parolayı SESSİZCE bekleyip pty'yi asılı bırakmak yerine hemen hata ile
 * döner — `panel` kullanıcısının zaten bir parolası yok (`adduser
 * --disabled-password`), bu yüzden parola tabanlı sudo bu hesapta hiçbir
 * zaman çalışamaz, NOPASSWD tek yoldur. Terminal SADECE SUPER_ADMIN'e açık
 * olduğundan (bkz. isAuthorizedTerminalRequest) bu root erişimi doğrudan
 * panelin en yetkili insan operatörüne devrediliyor.
 */
function resolveTerminalCommand() {
  return { command: "sudo", args: ["-n", resolveShell()] }
}

/**
 * Ayarlar ekranındaki (Aşama: terminal boşta-kalma zaman aşımı) değeri her
 * kontrolde TAZE okur — sabit önbellek yok, çünkü değer değiştirildiğinde
 * ZATEN AÇIK olan terminal oturumlarına da anında yansımalı (`src/lib/permissions.ts`'in
 * rolü her istekte taze okuması disipliniyle aynı, bkz. docs/ARCHITECTURE.md
 * Aşama G). DB'ye erişilemezse (best-effort) NULL (sınırsız) döner — geçici
 * bir DB hıçkırığı asla açık bir terminali beklenmedik şekilde kapatmamalı.
 */
async function getTerminalIdleTimeoutSeconds() {
  try {
    const settings = await prisma.panelSettings.findUnique({
      where: { id: "panel" },
      select: { terminalIdleTimeoutSeconds: true },
    })
    return settings?.terminalIdleTimeoutSeconds ?? null
  } catch {
    return null
  }
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
  ws.isAlive = true
  ws.lastActivityAt = Date.now()
  ws.on("pong", () => {
    ws.isAlive = true
  })

  let ptyProcess
  try {
    const { command, args } = resolveTerminalCommand()
    ptyProcess = pty.spawn(command, args, {
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
      ws.lastActivityAt = Date.now()
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

/**
 * Tek bir interval iki ayrı görevi yürütür: (1) her açık bağlantıya ping
 * göndererek Nginx'in websocket tünelini "boşta" sanıp kapatmasını engeller
 * (bkz. HEARTBEAT_INTERVAL_MS notu) — bir önceki ping'e pong dönmemiş
 * (muhtemelen kopmuş) bağlantılar burada temizlenir; (2) yapılandırılmışsa
 * (bkz. getTerminalIdleTimeoutSeconds) kullanıcı girdisi olmadan geçen süre
 * eşiği aştıysa oturumu AÇIKÇA bir mesajla kapatır.
 */
const heartbeatInterval = setInterval(async () => {
  if (wss.clients.size === 0) return

  const idleTimeoutSeconds = await getTerminalIdleTimeoutSeconds()
  const now = Date.now()

  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate()
      continue
    }

    if (idleTimeoutSeconds && now - ws.lastActivityAt >= idleTimeoutSeconds * 1000) {
      const durationLabel =
        idleTimeoutSeconds % 60 === 0
          ? `${idleTimeoutSeconds / 60} dakika`
          : `${idleTimeoutSeconds} saniye`
      if (ws.readyState === ws.OPEN) {
        ws.send(
          JSON.stringify({
            type: "exit",
            code: null,
            message: `Oturum ${durationLabel} hareketsizlik nedeniyle otomatik kapatıldı (Ayarlar → Terminal).`,
          })
        )
      }
      ws.close()
      continue
    }

    ws.isAlive = false
    ws.ping()
  }
}, HEARTBEAT_INTERVAL_MS)

function shutdown() {
  clearInterval(heartbeatInterval)
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
