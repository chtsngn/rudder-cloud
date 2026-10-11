/**
 * Yeni site sihirbazının depo taraması (v1.5.0): deponun kökündeki birkaç
 * küçük dosyadan (compose, Dockerfile, package.json, framework ayarı,
 * .env.example) nasıl çalıştırılacağını çıkarır ve kartlar olarak önerir.
 * Karar kullanıcınındır — tarama yalnızca öneri ve önceden doldurulmuş
 * ayarlar üretir. Saf mantık: dosya listesi ve okuyucu dışarıdan gelir (bkz.
 * src/lib/git.ts `cloneForScan`, POST /api/sites/scan).
 *
 * Yalnız depo KÖKÜ taranır; monorepo alt uygulamaları kapsam dışı (ipucu verilir).
 */

export type ScanCardId = "compose" | "dockerfile" | "static" | "proxy"

export interface ScanCard {
  id: ScanCardId
  available: boolean
  recommended: boolean
}

export interface ScanHint {
  code:
    | "compose-port-public"
    | "compose-no-port"
    | "node-server"
    | "python-app"
    | "next-server"
    | "env-example"
    | "monorepo"
    | "nothing-found"
  detail?: string
}

export interface RepoScan {
  /** Bulunan sinyaller, teknik ve dilden bağımsız (ör. "docker-compose.yml: app, db"). */
  signals: string[]
  cards: ScanCard[]
  hints: ScanHint[]
  suggestions: {
    /** Compose'un yayınladığı (host) port — Uygulama hedefi. */
    port: number | null
    composeFile: string | null
    composeServices: string[]
    /** Dockerfile `EXPOSE` portu (konteyner içi). */
    containerPort: number | null
    /** Statik yayın klasörü, depo köküne göre ("" = kök). */
    publishDir: string
    buildCommand: string
    spa: boolean
    /** .env.example içeriği (≤ 16 KB) — sihirbaz .env için ön doldurur. */
    envExample: string | null
    envExampleFile: string | null
  }
}

export interface RepoFile {
  path: string
  size: number
}

const COMPOSE_FILES = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]
const ENV_EXAMPLE_FILES = [".env.example", ".env.sample", ".env.template", ".env.dist"]
const MAX_READ_BYTES = 256 * 1024
const MAX_ENV_EXAMPLE_BYTES = 16 * 1024
const DB_SERVICE_RE = /(^|[-_])(db|database|postgres|postgresql|mysql|mariadb|redis|mongo|mongodb|cache|queue|rabbitmq|minio|mail|smtp|greenmail)([-_]|$)/i
const DB_IMAGE_RE = /\b(postgres|mysql|mariadb|redis|mongo|valkey|rabbitmq|minio|greenmail|mailhog|memcached)\b/i
const SPA_ROUTER_DEPS = ["react-router", "react-router-dom", "@tanstack/react-router", "vue-router", "svelte-routing", "@solidjs/router", "wouter"]
const NODE_SERVER_DEPS = ["express", "fastify", "@nestjs/core", "koa", "hono", "@hapi/hapi", "@adonisjs/core", "socket.io"]

interface PortMapping {
  service: string
  hostIp: string | null
  hostPort: number
  containerPort: number
}

/**
 * Compose dosyasından servis adları ve kısa sözdizimli port eşlemeleri
 * (`"127.0.0.1:3000:3000"`, `- 8080:80`). YAML ayrıştırıcı yerine satır
 * taraması: amaç öneri, tam doğruluk değil; uzun sözdizimi `published:` da okunur.
 */
export function parseCompose(text: string): { services: string[]; dbServices: Set<string>; ports: PortMapping[] } {
  const lines = text.replace(/\r/g, "").split("\n")
  const services: string[] = []
  const dbServices = new Set<string>()
  const ports: PortMapping[] = []
  const start = lines.findIndex((l) => /^services:\s*(#.*)?$/.test(l))
  if (start === -1) return { services, dbServices, ports }

  let serviceIndent: number | null = null
  let current = ""
  let longHostIp: string | null = null
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    if (/^\S/.test(line)) break // sonraki üst düzey anahtar
    if (!line.trim() || line.trim().startsWith("#")) continue
    const indent = line.length - line.trimStart().length
    const key = line.match(/^\s*([A-Za-z0-9._-]+):\s*(#.*)?$/)
    if (key && (serviceIndent === null || indent === serviceIndent)) {
      serviceIndent ??= indent
      current = key[1]
      services.push(current)
      if (DB_SERVICE_RE.test(current)) dbServices.add(current)
      continue
    }
    if (!current) continue
    const image = line.match(/^\s*image:\s*["']?([^"'\s#]+)/)
    if (image && DB_IMAGE_RE.test(image[1])) dbServices.add(current)

    const short = line.match(
      /^\s*-\s*["']?(?:(\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-fA-F:]+\]|localhost):)?(\d{1,5})(?:-\d{1,5})?:(\d{1,5})(?:-\d{1,5})?(?:\/(?:tcp|udp))?["']?\s*(#.*)?$/
    )
    if (short) {
      ports.push({ service: current, hostIp: short[1] ?? null, hostPort: Number(short[2]), containerPort: Number(short[3]) })
      continue
    }
    const hostIp = line.match(/^\s*-?\s*host_ip:\s*["']?([^"'\s#]+)/)
    if (hostIp) longHostIp = hostIp[1]
    const published = line.match(/^\s*-?\s*published:\s*["']?(\d{1,5})/)
    if (published) {
      ports.push({ service: current, hostIp: longHostIp, hostPort: Number(published[1]), containerPort: 0 })
      longHostIp = null
    }
  }
  return { services, dbServices, ports }
}

function pickAppPort(parsed: ReturnType<typeof parseCompose>): PortMapping | null {
  const valid = parsed.ports.filter((p) => p.hostPort >= 1 && p.hostPort <= 65535)
  return valid.find((p) => !parsed.dbServices.has(p.service)) ?? valid[0] ?? null
}

function packageManager(files: Set<string>): { name: string; install: string; run: (script: string) => string } {
  if (files.has("pnpm-lock.yaml")) {
    return { name: "pnpm", install: "corepack pnpm install --frozen-lockfile", run: (s) => `corepack pnpm run ${s}` }
  }
  if (files.has("yarn.lock")) return { name: "yarn", install: "corepack yarn install --immutable", run: (s) => `corepack yarn ${s}` }
  if (files.has("bun.lockb") || files.has("bun.lock")) return { name: "bun", install: "bun install --frozen-lockfile", run: (s) => `bun run ${s}` }
  if (files.has("package-lock.json")) return { name: "npm", install: "npm ci", run: (s) => `npm run ${s}` }
  return { name: "npm", install: "npm install", run: (s) => `npm run ${s}` }
}

export async function scanRepo(list: RepoFile[], read: (path: string) => Promise<string | null>): Promise<RepoScan> {
  const rootFiles = new Map(list.filter((f) => !f.path.includes("/")).map((f) => [f.path, f.size]))
  const has = (name: string) => rootFiles.has(name)
  const readSmall = async (name: string, max = MAX_READ_BYTES) => {
    const size = rootFiles.get(name)
    return size !== undefined && size <= max ? read(name) : null
  }

  const signals: string[] = []
  const hints: ScanHint[] = []
  const suggestions: RepoScan["suggestions"] = {
    port: null,
    composeFile: null,
    composeServices: [],
    containerPort: null,
    publishDir: "",
    buildCommand: "",
    spa: false,
    envExample: null,
    envExampleFile: null,
  }

  // ── Docker Compose ──
  const composeFile = COMPOSE_FILES.find(has) ?? null
  if (composeFile) {
    suggestions.composeFile = composeFile
    const text = await readSmall(composeFile)
    if (text) {
      const parsed = parseCompose(text)
      suggestions.composeServices = parsed.services
      const app = pickAppPort(parsed)
      signals.push(`${composeFile}: ${parsed.services.join(", ") || "?"}`)
      if (app) {
        suggestions.port = app.hostPort
        signals.push(`${app.service} → ${app.hostIp ? `${app.hostIp}:` : ""}${app.hostPort}${app.containerPort ? `:${app.containerPort}` : ""}`)
        const loopback = app.hostIp === "127.0.0.1" || app.hostIp === "localhost" || app.hostIp === "[::1]"
        if (!loopback) hints.push({ code: "compose-port-public", detail: String(app.hostPort) })
      } else {
        hints.push({ code: "compose-no-port" })
      }
    } else {
      signals.push(composeFile)
    }
  }

  // ── Dockerfile ──
  const hasDockerfile = has("Dockerfile")
  if (hasDockerfile) {
    const text = await readSmall("Dockerfile")
    const expose = text?.match(/^\s*EXPOSE\s+(\d{1,5})/im)
    if (expose) suggestions.containerPort = Number(expose[1])
    signals.push(`Dockerfile${suggestions.containerPort ? ` (EXPOSE ${suggestions.containerPort})` : ""}`)
  }

  // ── .env.example ──
  const envFile = ENV_EXAMPLE_FILES.find(has) ?? null
  if (envFile) {
    const text = await readSmall(envFile, MAX_ENV_EXAMPLE_BYTES)
    if (text !== null) {
      suggestions.envExample = text
      suggestions.envExampleFile = envFile
    }
    signals.push(envFile)
    hints.push({ code: "env-example", detail: envFile })
  }

  // ── package.json / statik çıktı ──
  let staticDetected = false
  if (has("package.json")) {
    const text = await readSmall("package.json")
    let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string>; workspaces?: unknown } | null = null
    try {
      pkg = text ? JSON.parse(text) : null
    } catch {
      pkg = null
    }
    const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) }
    const dep = (name: string) => name in deps
    const scripts = pkg?.scripts ?? {}
    const pm = packageManager(new Set(rootFiles.keys()))
    const build = (script = "build") => `${pm.install} && ${pm.run(script)}`
    const version = (name: string) => (deps[name] ? `${name} ${deps[name].replace(/^[\^~]/, "")}` : name)
    if (pkg?.workspaces || has("pnpm-workspace.yaml") || has("turbo.json") || has("nx.json")) hints.push({ code: "monorepo" })

    const spaRouter = SPA_ROUTER_DEPS.some(dep)
    if (dep("next")) {
      const configName = ["next.config.js", "next.config.mjs", "next.config.ts", "next.config.cjs"].find(has)
      const config = configName ? await readSmall(configName) : null
      const exportsStatic = !!config && /output\s*:\s*["']export["']/.test(config)
      signals.push(`${version("next")}${exportsStatic ? " (output: export)" : ""}`)
      if (exportsStatic) {
        staticDetected = true
        Object.assign(suggestions, { publishDir: "out", buildCommand: build(), spa: false })
      } else if (!composeFile && !hasDockerfile) {
        hints.push({ code: "next-server" })
      }
    } else if (dep("nuxt")) {
      signals.push(version("nuxt"))
      if (scripts.generate) {
        staticDetected = true
        Object.assign(suggestions, { publishDir: ".output/public", buildCommand: build("generate"), spa: false })
      }
    } else if (dep("@sveltejs/kit")) {
      signals.push(version("@sveltejs/kit"))
      if (dep("@sveltejs/adapter-static")) {
        staticDetected = true
        Object.assign(suggestions, { publishDir: "build", buildCommand: build(), spa: false })
      }
    } else if (dep("astro")) {
      signals.push(version("astro"))
      if (!dep("@astrojs/node")) {
        staticDetected = true
        Object.assign(suggestions, { publishDir: "dist", buildCommand: build(), spa: false })
      }
    } else if (dep("gatsby")) {
      signals.push(version("gatsby"))
      staticDetected = true
      Object.assign(suggestions, { publishDir: "public", buildCommand: build(), spa: false })
    } else if (dep("react-scripts")) {
      signals.push(version("react-scripts"))
      staticDetected = true
      Object.assign(suggestions, { publishDir: "build", buildCommand: build(), spa: spaRouter })
    } else if (dep("vite") && !NODE_SERVER_DEPS.some(dep)) {
      signals.push(version("vite"))
      staticDetected = true
      Object.assign(suggestions, { publishDir: "dist", buildCommand: build(), spa: spaRouter })
    } else if (NODE_SERVER_DEPS.some(dep)) {
      signals.push(NODE_SERVER_DEPS.filter(dep).map(version).join(", "))
      if (!composeFile && !hasDockerfile) hints.push({ code: "node-server" })
    } else {
      signals.push("package.json")
    }
    if (pm.name !== "npm" || has("package-lock.json")) signals.push(pm.name)
  } else if (has("index.html")) {
    staticDetected = true
    signals.push("index.html")
  }

  if (!composeFile && !hasDockerfile && (has("requirements.txt") || has("pyproject.toml") || has("Pipfile"))) {
    signals.push("Python")
    hints.push({ code: "python-app" })
  }
  if (signals.length === 0) hints.push({ code: "nothing-found" })

  const recommended: ScanCardId | null = composeFile
    ? "compose"
    : hasDockerfile
      ? "dockerfile"
      : staticDetected
        ? "static"
        : null
  const cards: ScanCard[] = (["compose", "dockerfile", "static", "proxy"] as ScanCardId[]).map((id) => ({
    id,
    available: id === "compose" ? !!composeFile : id === "dockerfile" ? hasDockerfile : true,
    recommended: id === recommended,
  }))

  return { signals, cards, hints, suggestions }
}
