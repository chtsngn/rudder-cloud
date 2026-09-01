/**
 * "Otomatik veritabanı algılama" (Aşama D) — sitenin kök dizinindeki
 * `.env*` dosyalarını tarayıp yaygın konvansiyonlardan (DATABASE_URL,
 * Laravel-tarzı DB_*, MONGO_URI) bağlantı bilgisi çıkarmaya çalışır.
 * Emin olamadığında (bilinmeyen bir motor/desen) SESSİZCE YANLIŞ TAHMİN
 * ETMEZ — `null` döner, kullanıcı arayüzü "otomatik algılanamadı" gösterir.
 */
import { readTextFile, SiteFsError } from "@/lib/site-fs"
import type { SiteLike } from "@/lib/site-paths"

export type DbEngine = "postgres" | "mysql" | "mongo"

export interface DetectedDatabase {
  engine: DbEngine
  host?: string
  port?: number
  database?: string
  user?: string
  password?: string
  /** Yalnızca mongo: mongodump doğrudan --uri kabul ettiği için tam bağlantı string'i saklanır. */
  connectionUri?: string
  /** Kullanıcıya gösterilecek: hangi dosyadan/değişkenden bulundu. */
  source: string
}

const ENV_CANDIDATES = [".env", ".env.production", ".env.local"]

function parseEnvContent(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key) result[key] = value
  }
  return result
}

function engineFromUrlProtocol(protocol: string): DbEngine | null {
  if (protocol === "postgres:" || protocol === "postgresql:") return "postgres"
  if (protocol === "mysql:") return "mysql"
  if (protocol === "mongodb:" || protocol === "mongodb+srv:") return "mongo"
  return null
}

function defaultPort(engine: DbEngine): number {
  if (engine === "postgres") return 5432
  if (engine === "mysql") return 3306
  return 27017
}

function fromDatabaseUrl(value: string, sourceLabel: string): DetectedDatabase | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  const engine = engineFromUrlProtocol(url.protocol)
  if (!engine) return null

  if (engine === "mongo") {
    return { engine, connectionUri: value, source: sourceLabel }
  }

  return {
    engine,
    host: url.hostname || "localhost",
    port: url.port ? Number(url.port) : defaultPort(engine),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")) || undefined,
    user: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    source: sourceLabel,
  }
}

function fromWpConfig(content: string, sourceLabel: string): DetectedDatabase | null {
  const match = (constant: string): string | undefined => {
    const re = new RegExp(
      `define\\s*\\(\\s*['"]${constant}['"]\\s*,\\s*['"]([^'"]*)['"]`,
      "i"
    )
    return content.match(re)?.[1]
  }

  const database = match("DB_NAME")
  const user = match("DB_USER")
  if (!database || !user) return null // wp-config.php'ye benzemiyor — WordPress kurulumu değil ya da eksik

  const rawHost = match("DB_HOST") || "localhost"
  // WordPress DB_HOST bazen "host:port" ya da "host:/path/to/socket.sock" biçiminde olabilir.
  const [host, portPart] = rawHost.split(":")
  const port = portPart && /^\d+$/.test(portPart) ? Number(portPart) : undefined

  return {
    engine: "mysql",
    host: host || "localhost",
    port: port ?? 3306,
    database,
    user,
    password: match("DB_PASSWORD"),
    source: sourceLabel,
  }
}

function fromLaravelStyle(env: Record<string, string>, sourceLabel: string): DetectedDatabase | null {
  const connection = env.DB_CONNECTION?.toLowerCase()
  if (!connection) return null
  let engine: DbEngine | null = null
  if (connection === "pgsql" || connection === "postgres" || connection === "postgresql") engine = "postgres"
  else if (connection === "mysql" || connection === "mariadb") engine = "mysql"
  else if (connection === "mongodb") engine = "mongo"
  if (!engine) return null

  return {
    engine,
    host: env.DB_HOST || "localhost",
    port: env.DB_PORT ? Number(env.DB_PORT) : defaultPort(engine),
    database: env.DB_DATABASE || undefined,
    user: env.DB_USERNAME || undefined,
    password: env.DB_PASSWORD || undefined,
    source: sourceLabel,
  }
}

/**
 * Sitenin `.env` (veya `.env.production`/`.env.local`) dosyasından ya da —
 * bunlar yoksa — WordPress'in `wp-config.php`'sinden veritabanı bağlantısını
 * algılamayı dener. WordPress kimlik bilgilerini `.env` DEĞİL doğrudan PHP
 * `define()` sabitleriyle `wp-config.php` içinde tuttuğu için bu ayrı bir
 * yol olarak gerekiyor — panelin WORDPRESS site tipini gerçekten kapsaması
 * için şart.
 */
export async function detectSiteDatabase(site: SiteLike): Promise<DetectedDatabase | null> {
  for (const fileName of ENV_CANDIDATES) {
    let content: string
    try {
      const result = await readTextFile(site, fileName)
      content = result.content
    } catch (error) {
      if (error instanceof SiteFsError && (error.status === 404 || error.status === 400)) continue
      throw error
    }

    const env = parseEnvContent(content)
    const sourceLabel = `${fileName}`

    if (env.DATABASE_URL) {
      const fromUrl = fromDatabaseUrl(env.DATABASE_URL, `${sourceLabel} → DATABASE_URL`)
      if (fromUrl) return fromUrl
    }
    if (env.MONGO_URI || env.MONGODB_URI) {
      const raw = env.MONGO_URI || env.MONGODB_URI
      return { engine: "mongo", connectionUri: raw, source: `${sourceLabel} → ${env.MONGO_URI ? "MONGO_URI" : "MONGODB_URI"}` }
    }
    const laravel = fromLaravelStyle(env, `${sourceLabel} → DB_CONNECTION/DB_*`)
    if (laravel) return laravel
  }

  try {
    const { content } = await readTextFile(site, "wp-config.php")
    const wp = fromWpConfig(content, "wp-config.php")
    if (wp) return wp
  } catch (error) {
    if (!(error instanceof SiteFsError && (error.status === 404 || error.status === 400))) throw error
  }

  return null
}
