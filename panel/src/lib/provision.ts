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
const WORDPRESS_TIMEOUT_MS = 120_000 // WordPress indirme daha uzun sürebilir
const SSL_TIMEOUT_MS = 60_000 // certbot ağ erişimi gerektirir

// ------------------------------------------------------------
// Doğrulama — scripts/provision-site.sh'daki regex'lerin TS karşılığı
// ------------------------------------------------------------
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/
const USERNAME_RE = /^[a-z][a-z0-9_-]{0,31}$/
const DB_IDENT_RE = /^[A-Za-z0-9_]{1,64}$/
const DB_PASSWORD_RE = /^[A-Za-z0-9!@#%^*_+=.-]{8,64}$/
const START_CMD_RE = /^[A-Za-z0-9_./:@%=, $-]{1,200}$/
const ABS_PATH_RE = /^\/[A-Za-z0-9_./-]+$/
const PHP_VERSION_RE = /^[0-9]{1,2}\.[0-9]{1,2}$/
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

export function isValidPhpVersion(version: string): boolean {
  return typeof version === "string" && PHP_VERSION_RE.test(version)
}

export function isValidUpstreamUrl(url: string): boolean {
  return typeof url === "string" && url.length <= 2048 && UPSTREAM_URL_RE.test(url)
}

export function isValidLinuxUsername(user: string): boolean {
  return typeof user === "string" && USERNAME_RE.test(user)
}

export function isValidDbIdentifier(value: string): boolean {
  return typeof value === "string" && DB_IDENT_RE.test(value)
}

export function isValidDbPassword(value: string): boolean {
  return typeof value === "string" && DB_PASSWORD_RE.test(value)
}

export function isValidStartCommand(value: string): boolean {
  return typeof value === "string" && START_CMD_RE.test(value)
}

export function isValidAbsolutePath(value: string): boolean {
  return typeof value === "string" && ABS_PATH_RE.test(value) && !value.includes("..")
}

export function isValidSiteRoot(value: string): boolean {
  return isValidAbsolutePath(value) && value.startsWith("/var/www/")
}

/** `example.com` -> `example-com`, the same transform `provision-site.sh` uses for systemd unit names. */
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
}

export interface CreateVhostPhpParams {
  domain: string
  type: "PHP"
  www: boolean
  phpVersion: string
  siteRoot: string
  linuxUser?: string
}

export interface CreateVhostWordpressParams {
  domain: string
  type: "WORDPRESS"
  www: boolean
  phpVersion: string
  siteRoot: string
  dbName: string
  dbUser: string
  dbPassword: string
  linuxUser?: string
}

export interface CreateVhostNodePythonParams {
  domain: string
  type: "NODEJS" | "PYTHON"
  www: boolean
  port: number
}

export interface CreateVhostReverseProxyParams {
  domain: string
  type: "REVERSE_PROXY"
  www: boolean
  upstreamUrl: string
}

export type CreateVhostParams =
  | CreateVhostStaticParams
  | CreateVhostPhpParams
  | CreateVhostWordpressParams
  | CreateVhostNodePythonParams
  | CreateVhostReverseProxyParams

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
      ])
      return
    }
    case "PHP": {
      if (!isValidPhpVersion(params.phpVersion)) {
        throw new ProvisionError(`Geçersiz PHP sürümü: ${params.phpVersion}`)
      }
      if (!isValidSiteRoot(params.siteRoot)) {
        throw new ProvisionError(`Geçersiz site kök dizini: ${params.siteRoot}`)
      }
      if (params.linuxUser && !isValidLinuxUsername(params.linuxUser)) {
        throw new ProvisionError(`Geçersiz linux kullanıcı adı: ${params.linuxUser}`)
      }
      await runProvisionScript([
        "create-vhost",
        params.domain,
        "PHP",
        www,
        params.phpVersion,
        params.siteRoot,
        params.linuxUser ?? "",
      ])
      return
    }
    case "WORDPRESS": {
      if (!isValidPhpVersion(params.phpVersion)) {
        throw new ProvisionError(`Geçersiz PHP sürümü: ${params.phpVersion}`)
      }
      if (!isValidSiteRoot(params.siteRoot)) {
        throw new ProvisionError(`Geçersiz site kök dizini: ${params.siteRoot}`)
      }
      if (!isValidDbIdentifier(params.dbName)) {
        throw new ProvisionError(`Geçersiz veritabanı adı: ${params.dbName}`)
      }
      if (!isValidDbIdentifier(params.dbUser)) {
        throw new ProvisionError(`Geçersiz veritabanı kullanıcısı: ${params.dbUser}`)
      }
      if (!isValidDbPassword(params.dbPassword)) {
        throw new ProvisionError("Geçersiz veritabanı şifresi (8-64 karakter olmalı).")
      }
      if (params.linuxUser && !isValidLinuxUsername(params.linuxUser)) {
        throw new ProvisionError(`Geçersiz linux kullanıcı adı: ${params.linuxUser}`)
      }
      await runProvisionScript(
        [
          "create-vhost",
          params.domain,
          "WORDPRESS",
          www,
          params.phpVersion,
          params.siteRoot,
          params.dbName,
          params.dbUser,
          params.dbPassword,
          params.linuxUser ?? "",
        ],
        WORDPRESS_TIMEOUT_MS
      )
      return
    }
    case "NODEJS":
    case "PYTHON": {
      if (!isValidPort(params.port)) {
        throw new ProvisionError(`Geçersiz port: ${params.port}`)
      }
      await runProvisionScript([
        "create-vhost",
        params.domain,
        params.type,
        www,
        String(params.port),
      ])
      return
    }
    case "REVERSE_PROXY": {
      if (!isValidUpstreamUrl(params.upstreamUrl)) {
        throw new ProvisionError(`Geçersiz upstream adresi: ${params.upstreamUrl}`)
      }
      await runProvisionScript([
        "create-vhost",
        params.domain,
        "REVERSE_PROXY",
        www,
        params.upstreamUrl,
      ])
      return
    }
  }
}

export async function removeVhost(domain: string): Promise<void> {
  requireDomain(domain)
  await runProvisionScript(["remove-vhost", domain])
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
// systemd servis yönetimi (nodejs / python)
// ------------------------------------------------------------
export async function createService(params: {
  domain: string
  workingDir: string
  startCommand: string
  port: number
}): Promise<void> {
  requireDomain(params.domain)
  if (!isValidAbsolutePath(params.workingDir)) {
    throw new ProvisionError(`Geçersiz çalışma dizini: ${params.workingDir}`)
  }
  if (!isValidStartCommand(params.startCommand)) {
    throw new ProvisionError(`Geçersiz başlatma komutu: ${params.startCommand}`)
  }
  if (!isValidPort(params.port)) {
    throw new ProvisionError(`Geçersiz port: ${params.port}`)
  }
  await runProvisionScript([
    "create-service",
    params.domain,
    params.workingDir,
    params.startCommand,
    String(params.port),
  ])
}

export async function removeService(domain: string): Promise<void> {
  requireDomain(domain)
  await runProvisionScript(["remove-service", domain])
}

export type ServiceAction = "start" | "stop" | "restart"

export async function serviceAction(domain: string, action: ServiceAction): Promise<void> {
  requireDomain(domain)
  if (action !== "start" && action !== "stop" && action !== "restart") {
    throw new ProvisionError(`Geçersiz eylem: ${action}`)
  }
  await runProvisionScript(["service-action", domain, action])
}

export async function serviceStatus(domain: string): Promise<string> {
  requireDomain(domain)
  const { stdout } = await runProvisionScript(["service-status", domain])
  return stdout.trim() || "unknown"
}

export async function serviceLogs(domain: string, lines: number): Promise<string> {
  requireDomain(domain)
  const safeLines = Number.isInteger(lines) && lines >= 1 && lines <= 2000 ? lines : 200
  const { stdout } = await runProvisionScript(["service-logs", domain, String(safeLines)])
  return stdout
}

// ------------------------------------------------------------
// WordPress veritabanı
// ------------------------------------------------------------
export async function createWpDb(params: {
  domain: string
  dbName: string
  dbUser: string
  dbPassword: string
}): Promise<void> {
  requireDomain(params.domain)
  if (!isValidDbIdentifier(params.dbName)) {
    throw new ProvisionError(`Geçersiz veritabanı adı: ${params.dbName}`)
  }
  if (!isValidDbIdentifier(params.dbUser)) {
    throw new ProvisionError(`Geçersiz veritabanı kullanıcısı: ${params.dbUser}`)
  }
  if (!isValidDbPassword(params.dbPassword)) {
    throw new ProvisionError("Geçersiz veritabanı şifresi (8-64 karakter olmalı).")
  }
  await runProvisionScript(
    ["create-wp-db", params.domain, params.dbName, params.dbUser, params.dbPassword],
    WORDPRESS_TIMEOUT_MS
  )
}
