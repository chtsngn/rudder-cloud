/**
 * Wraps `scripts/provision-site.sh` — the single privileged script the
 * unprivileged `panel` system user is allowed to run via a scoped
 * `sudoers.d` entry (see `doctor.sh` and `docs/ARCHITECTURE.md` → "Güvenlik
 * Notları"). Every call here goes through `execFile("sudo", [...])` with an
 * argument array — never a shell string — so there is no injection surface
 * even as defense-in-depth on top of the script's own validation.
 *
 * All validators mirror the regexes in `scripts/provision-site.sh` exactly.
 * This module re-validates everything itself before ever shelling out: the
 * script is defense-in-depth, not the only line of defense.
 */
import { execFile } from "node:child_process"

const PROVISION_SCRIPT =
  process.env.PROVISION_SCRIPT_PATH ?? "/opt/sunucu-paneli/scripts/provision-site.sh"

const DEFAULT_TIMEOUT_MS = 30_000
const SSL_TIMEOUT_MS = 60_000 // certbot ağ erişimi gerektirir
const DOCKER_TIMEOUT_MS = 180_000 // ilk `compose up` image çekebilir
const CLEANUP_TIMEOUT_MS = 180_000 // compose down + rm -rf büyük klasörlerde sürebilir

// ------------------------------------------------------------
// Doğrulama — scripts/provision-site.sh'daki regex'lerin TS karşılığı
// ------------------------------------------------------------
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/
const USERNAME_RE = /^[a-z][a-z0-9_-]{0,31}$/
const ABS_PATH_RE = /^\/[A-Za-z0-9_./-]+$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UPSTREAM_URL_RE = /^https?:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?(\/[A-Za-z0-9._~%/-]*)?$/

export function isValidDomain(domain: string): boolean {
  return typeof domain === "string" && domain.length <= 253 && DOMAIN_RE.test(domain)
}

export function isValidEmail(email: string): boolean {
  return typeof email === "string" && EMAIL_RE.test(email)
}

export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535
}

export function isValidUpstreamUrl(url: string): boolean {
  return typeof url === "string" && url.length <= 2048 && UPSTREAM_URL_RE.test(url)
}

export function isValidLinuxUsername(user: string): boolean {
  return typeof user === "string" && USERNAME_RE.test(user)
}

export function isValidAbsolutePath(value: string): boolean {
  return typeof value === "string" && ABS_PATH_RE.test(value) && !value.includes("..")
}

export function isValidSiteRoot(value: string): boolean {
  return isValidAbsolutePath(value) && value.startsWith("/var/www/")
}

const PM2_NAME_RE = /^[A-Za-z0-9._-]{1,64}$/
export function isValidPm2Name(value: string): boolean {
  return typeof value === "string" && PM2_NAME_RE.test(value)
}

/** Deploy komutu `panel` kullanıcısı olarak `bash -lc` ile çalışır (bkz.
 * src/lib/deploy.ts) — shell sözdizimi serbest; yalnızca uzunluk ve kontrol
 * karakterleri sınırlanır. Yalnızca SUPER_ADMIN ayarlayabilir (bkz. PATCH /api/sites/[id]). */
export function isValidDeployCommand(value: string): boolean {
  return typeof value === "string" && value.length >= 1 && value.length <= 500 && !/[\0\r]/.test(value)
}

/** `example.com` -> `example-com` (PM2 süreç adı varsayılanı). */
export function domainToSlug(domain: string): string {
  return domain.replace(/\./g, "-")
}

export function defaultSiteRoot(domain: string): string {
  return `/var/www/${domain}`
}

export class ProvisionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ProvisionError"
  }
}

interface RunResult {
  stdout: string
  stderr: string
}

function runProvisionScript(args: string[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    execFile(
      "sudo",
      [PROVISION_SCRIPT, ...args],
      { timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const err = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string | null }
          if (err.killed || err.signal) {
            reject(new ProvisionError("İşlem zaman aşımına uğradı."))
            return
          }
          const detail = stderr?.toString().trim() || err.message
          reject(new ProvisionError(stripAnsi(detail) || "provision-site.sh çalıştırılamadı."))
          return
        }
        resolve({ stdout: stdout.toString(), stderr: stderr.toString() })
      }
    )
  })
}

/** Strips the ANSI color codes provision-site.sh's msg/warn/die helpers emit, for clean UI display. */
function stripAnsi(input: string): string {
  return input.replace(/\x1b\[[0-9;]*m/g, "").trim()
}

// ------------------------------------------------------------
// create-vhost
// ------------------------------------------------------------
export interface CreateVhostStaticParams {
  domain: string
  type: "STATIC"
  www: boolean
  siteRoot: string
  linuxUser?: string
  /** Bulunamayan yol index.html'e düşsün (istemci tarafı yönlendirmeli SPA). */
  spa?: boolean
}

export interface CreateVhostReverseProxyParams {
  domain: string
  type: "REVERSE_PROXY"
  www: boolean
  upstreamUrl: string
  linuxUser?: string
  /** Verilirse site klasörüne bu portu yayınlayan örnek bir docker-compose.yml
   * yazılıp ayağa kaldırılır (depo bağlanmadan Docker Compose seçildiğinde). */
  composePort?: number
}

export type CreateVhostParams = CreateVhostStaticParams | CreateVhostReverseProxyParams

function requireDomain(domain: string) {
  if (!isValidDomain(domain)) throw new ProvisionError(`Geçersiz alan adı: ${domain}`)
}

export async function createVhost(params: CreateVhostParams): Promise<void> {
  requireDomain(params.domain)
  const www = params.www ? "true" : "false"

  switch (params.type) {
    case "STATIC": {
      if (!isValidSiteRoot(params.siteRoot)) {
        throw new ProvisionError(`Geçersiz site kök dizini: ${params.siteRoot}`)
      }
      if (params.linuxUser && !isValidLinuxUsername(params.linuxUser)) {
        throw new ProvisionError(`Geçersiz linux kullanıcı adı: ${params.linuxUser}`)
      }
      await runProvisionScript([
        "create-vhost",
        params.domain,
        "STATIC",
        www,
        params.siteRoot,
        params.linuxUser ?? "",
        params.spa ? "true" : "false",
      ])
      return
    }
    case "REVERSE_PROXY": {
      if (!isValidUpstreamUrl(params.upstreamUrl)) {
        throw new ProvisionError(`Geçersiz upstream adresi: ${params.upstreamUrl}`)
      }
      if (params.linuxUser && !isValidLinuxUsername(params.linuxUser)) {
        throw new ProvisionError(`Geçersiz linux kullanıcı adı: ${params.linuxUser}`)
      }
      if (params.composePort !== undefined && !isValidPort(params.composePort)) {
        throw new ProvisionError(`Geçersiz port: ${params.composePort}`)
      }
      await runProvisionScript(
        [
          "create-vhost",
          params.domain,
          "REVERSE_PROXY",
          www,
          params.upstreamUrl,
          params.linuxUser ?? "",
          params.composePort !== undefined ? String(params.composePort) : "",
        ],
        params.composePort !== undefined ? DOCKER_TIMEOUT_MS : DEFAULT_TIMEOUT_MS
      )
      return
    }
  }
}

export async function removeVhost(domain: string): Promise<void> {
  requireDomain(domain)
  await runProvisionScript(["remove-vhost", domain])
}

/**
 * Statik sitenin yönlendirmesi (SPA modu) — vhost'un yalnızca `location /`
 * satırını değiştirir, SSL bloğunu korur (bkz. provision-site.sh
 * `cmd_update_static_routing`).
 */
export async function updateStaticRouting(domain: string, spa: boolean): Promise<void> {
  requireDomain(domain)
  await runProvisionScript(["update-static-routing", domain, spa ? "true" : "false"])
}

/**
 * Yalnızca REVERSE_PROXY sitelerde: vhost dosyasını YENİDEN OLUŞTURMADAN
 * (bkz. provision-site.sh `cmd_update_upstream` — `create-vhost`'un aksine
 * yalnızca `proxy_pass` satırını değiştirir, certbot'un eklediği SSL/443
 * bloğunu korur) hedef adresi değiştirir. CloudPanel-tarzı akışta (git ile
 * deploy edilen uygulama hangi porttan ayağa kalkarsa proxy'yi oraya
 * çekmek) bunun için kullanılır.
 */
export async function updateUpstream(domain: string, upstreamUrl: string): Promise<void> {
  requireDomain(domain)
  if (!isValidUpstreamUrl(upstreamUrl)) {
    throw new ProvisionError(`Geçersiz upstream adresi: ${upstreamUrl}`)
  }
  await runProvisionScript(["update-upstream", domain, upstreamUrl])
}

// ------------------------------------------------------------
// SSL
// ------------------------------------------------------------
export async function requestSsl(domain: string, email: string, www: boolean): Promise<void> {
  requireDomain(domain)
  if (!isValidEmail(email)) {
    throw new ProvisionError(`Geçersiz e-posta adresi: ${email}`)
  }
  await runProvisionScript(["request-ssl", domain, email, www ? "true" : "false"], SSL_TIMEOUT_MS)
}

// ------------------------------------------------------------
// Panelin kendi alan adı + SSL bağlama (settings sayfası → PanelSettings)
// ------------------------------------------------------------
export async function configurePanelDomain(domain: string): Promise<void> {
  requireDomain(domain)
  await runProvisionScript(["configure-panel-domain", domain])
}

export async function requestPanelSsl(domain: string, email: string): Promise<void> {
  requireDomain(domain)
  if (!isValidEmail(email)) {
    throw new ProvisionError(`Geçersiz e-posta adresi: ${email}`)
  }
  await runProvisionScript(["request-panel-ssl", domain, email], SSL_TIMEOUT_MS)
}

export async function removePanelDomain(): Promise<void> {
  await runProvisionScript(["remove-panel-domain"])
}

// ------------------------------------------------------------
// Uygulama sitelerinde sonradan terminal izolasyonu kurmak için — yeni site oluşturmadaki OTOMATİK
// çağrının aynısı, ama var olan (bu değişiklikten ÖNCE oluşturulmuş) bir
// site için elle/geriye dönük tetiklenebilir (bkz. /api/sites/[id]/ensure-terminal-user).
// ------------------------------------------------------------
export type SiteUserModel = "shared" | "owned"

/**
 * `model`: "shared" — Uygulama (klasör panel'de, grup erişimi); "owned" —
 * Statik (klasör kullanıcıya ait, panel/nginx ACL ile — bkz. provision-site.sh
 * cmd_ensure_site_user).
 */
export async function ensureSiteUser(
  domain: string,
  workdir: string,
  linuxUser: string,
  model: SiteUserModel = "shared"
): Promise<void> {
  requireDomain(domain)
  if (!isValidAbsolutePath(workdir)) {
    throw new ProvisionError(`Geçersiz çalışma dizini: ${workdir}`)
  }
  if (!isValidLinuxUsername(linuxUser)) {
    throw new ProvisionError(`Geçersiz linux kullanıcı adı: ${linuxUser}`)
  }
  await runProvisionScript(["ensure-site-user", domain, workdir, linuxUser, model], DEFAULT_TIMEOUT_MS * 2)
}

/**
 * Site silinirken artıkları kaldırır (2026-09-15 denetimi: eskiden yalnızca
 * vhost + systemd birimi kaldırılıyor; klasör, dedicated kullanıcı, compose
 * konteynerleri — dolayısıyla meşgul portlar — geride kalıyordu). Compose
 * konteynerleri her zaman kaldırılır; klasör ve kullanıcı
 * seçeneğe bağlı (bkz. DELETE /api/sites/[id]).
 */
export async function cleanupSite(params: {
  domain: string
  workdir: string
  linuxUser?: string | null
  removeFolder: boolean
  removeUser: boolean
}): Promise<void> {
  requireDomain(params.domain)
  if (!isValidSiteRoot(params.workdir)) {
    throw new ProvisionError(`Geçersiz çalışma dizini: ${params.workdir}`)
  }
  const user = params.linuxUser?.trim() || ""
  if (user && !isValidLinuxUsername(user)) {
    throw new ProvisionError(`Geçersiz linux kullanıcı adı: ${user}`)
  }
  await runProvisionScript(
    [
      "cleanup-site",
      params.domain,
      params.workdir,
      user || "-",
      params.removeFolder ? "true" : "false",
      params.removeUser ? "true" : "false",
    ],
    CLEANUP_TIMEOUT_MS
  )
}

/** Root'un pm2 daemon'ında bir süreç üzerinde eylem (bkz. provision-site.sh pm2-action). */
export type Pm2Action = "start" | "stop" | "restart" | "reload" | "delete" | "describe"

export async function pm2Action(domain: string, processName: string, action: Pm2Action): Promise<string> {
  requireDomain(domain)
  if (!isValidPm2Name(processName)) {
    throw new ProvisionError(`Geçersiz PM2 süreç adı: ${processName}`)
  }
  if (!["start", "stop", "restart", "reload", "delete", "describe"].includes(action)) {
    throw new ProvisionError(`Geçersiz pm2 eylemi: ${action}`)
  }
  const { stdout } = await runProvisionScript(["pm2-action", domain, processName, action], 60_000)
  return stdout
}

/** Nginx real_ip için Cloudflare IP aralıklarını yeniler (Ayarlar → Cloudflare). */
export async function refreshCloudflareIps(): Promise<void> {
  await runProvisionScript(["refresh-cloudflare-ips"], 60_000)
}

/** `site_<slug>` — sitenin otomatik üretilen dedicated kullanıcı adı
 * (Statik'te sihirbazda elle de verilebilir; terminal izolasyonunun her zaman
 * kurulu olması için boşsa bu üretilir).
 * `USERNAME_RE` ile uyumlu: küçük harfle başlar, azami 32 karakter. */
export function autoLinuxUserFor(domain: string): string {
  const slug = domain.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "site"
  return `site_${slug}`.slice(0, 32)
}
