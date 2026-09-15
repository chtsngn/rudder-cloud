import { NextResponse } from "next/server"
import { Prisma, SiteType } from "@prisma/client"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import { checkDomainDns } from "@/lib/dns-check"
import { isSuperAdmin } from "@/lib/permissions"
import { isPortListening, sitePortOf } from "@/lib/ports"
import { prisma } from "@/lib/prisma"
import {
  autoLinuxUserFor,
  createService,
  createVhost,
  createWpDb,
  defaultSiteRoot,
  isValidAbsolutePath,
  isValidDbIdentifier,
  isValidDbPassword,
  isValidDeployCommand,
  isValidEmail,
  isValidLinuxUsername,
  isValidPhpVersion,
  isValidPort,
  isValidSiteRoot,
  isValidStartCommand,
  isValidUpstreamUrl,
  ProvisionError,
  requestSsl,
} from "@/lib/provision"

const VALID_TYPES = new Set<string>(Object.values(SiteType))
const VALID_PROCESS_MANAGERS = new Set(["SYSTEMD", "DOCKER_COMPOSE", "PM2", "CUSTOM_SCRIPT", "NONE"])

/**
 * SUPER_ADMIN tüm siteleri görür. MEMBER yalnızca kendisine `VIEW` izni
 * verilmiş siteleri görür (bkz. src/lib/permissions.ts).
 */
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }

  const sites = await prisma.site.findMany({ orderBy: { createdAt: "desc" } })
  if (await isSuperAdmin(session.userId)) {
    return NextResponse.json(sites)
  }

  const grants = await prisma.userSiteAccess.findMany({ where: { userId: session.userId } })
  const viewableIds = new Set(grants.filter((g) => g.permissions.includes("VIEW")).map((g) => g.siteId))
  return NextResponse.json(sites.filter((s) => viewableIds.has(s.id)))
}

function toBool(value: unknown): boolean {
  return value === true || value === "true"
}

function toStr(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function toPort(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? parseInt(value, 10) : NaN
  return Number.isInteger(n) ? n : null
}

/**
 * Doğrulanmış, tipe özel alanlar. `POST` içinde DB satırı oluşturulmadan ÖNCE
 * derlenir; kalıcı `config` de YALNIZCA bu alanlardan üretilir (2026-09-15:
 * eskiden istemcinin gönderdiği her anahtar olduğu gibi saklanıyordu —
 * `workingDir` gibi yol alanları doğrulanmadan dosya yöneticisi/klon kökü
 * olabiliyordu).
 */
type ProvisionPlan =
  | { type: "STATIC"; siteRoot: string; linuxUser: string }
  | { type: "PHP"; phpVersion: string; siteRoot: string; linuxUser: string }
  | {
      type: "WORDPRESS"
      phpVersion: string
      siteRoot: string
      linuxUser: string
      dbName: string
      dbUser: string
      dbPassword: string
    }
  | { type: "NODEJS" | "PYTHON"; port: number; startCommand: string; workingDir: string; linuxUser: string }
  | { type: "REVERSE_PROXY"; upstreamUrl: string; workingDir: string; linuxUser: string }
  | { type: "DOCKER"; port: number; workingDir: string; composeService: string; linuxUser: string; bootstrap: boolean }

function buildPlan(
  type: string,
  domain: string,
  cfg: Record<string, unknown>,
  skipDockerBootstrap: boolean
): { plan: ProvisionPlan } | { error: string } {
  // STATIC/PHP/WORDPRESS: dedicated kullanıcı artık her zaman var (elle ad
  // verilmezse otomatik `site_<slug>`) — dosyalar root'ta kalmasın, PHP/
  // WordPress yazabilsin, MEMBER terminali mümkün olsun (bkz. provision-site.sh
  // apply_owned_site_access).
  const ownedUser = (): string | { error: string } => {
    const linuxUser = toStr(cfg.linuxUser) || autoLinuxUserFor(domain)
    if (!isValidLinuxUsername(linuxUser)) return { error: "Geçersiz linux kullanıcı adı (küçük harfle başlamalı, en fazla 32 karakter)." }
    return linuxUser
  }

  switch (type) {
    case "STATIC": {
      const siteRoot = toStr(cfg.siteRoot) || defaultSiteRoot(domain)
      if (!isValidSiteRoot(siteRoot)) return { error: "Geçerli bir site kök dizini gereklidir (/var/www/... altında)." }
      const linuxUser = ownedUser()
      if (typeof linuxUser !== "string") return linuxUser
      return { plan: { type: "STATIC", siteRoot, linuxUser } }
    }
    case "PHP": {
      const phpVersion = toStr(cfg.phpVersion) || "8.3"
      const siteRoot = toStr(cfg.siteRoot) || defaultSiteRoot(domain)
      if (!isValidPhpVersion(phpVersion)) return { error: "Geçerli bir PHP sürümü gereklidir (örn. 8.3)." }
      if (!isValidSiteRoot(siteRoot)) return { error: "Geçerli bir site kök dizini gereklidir (/var/www/... altında)." }
      const linuxUser = ownedUser()
      if (typeof linuxUser !== "string") return linuxUser
      return { plan: { type: "PHP", phpVersion, siteRoot, linuxUser } }
    }
    case "WORDPRESS": {
      const phpVersion = toStr(cfg.phpVersion) || "8.3"
      const siteRoot = toStr(cfg.siteRoot) || defaultSiteRoot(domain)
      const dbNameDefault = domain.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 60)
      const dbName = toStr(cfg.dbName) || dbNameDefault
      const dbUser = toStr(cfg.dbUser) || `${dbNameDefault}_u`.slice(0, 64)
      const dbPassword = toStr(cfg.dbPassword)
      if (!isValidPhpVersion(phpVersion)) return { error: "Geçerli bir PHP sürümü gereklidir (örn. 8.3)." }
      if (!isValidSiteRoot(siteRoot)) return { error: "Geçerli bir site kök dizini gereklidir (/var/www/... altında)." }
      if (!isValidDbIdentifier(dbName)) return { error: "Geçerli bir veritabanı adı gereklidir." }
      if (!isValidDbIdentifier(dbUser)) return { error: "Geçerli bir veritabanı kullanıcısı gereklidir." }
      if (!dbPassword) return { error: "Veritabanı şifresi gereklidir." }
      if (!isValidDbPassword(dbPassword)) {
        return {
          error:
            "Veritabanı şifresi 8-64 karakter olmalı ve yalnızca harf/rakam ile !@#%^*_+=.- sembollerini içerebilir.",
        }
      }
      const linuxUser = ownedUser()
      if (typeof linuxUser !== "string") return linuxUser
      return { plan: { type: "WORDPRESS", phpVersion, siteRoot, linuxUser, dbName, dbUser, dbPassword } }
    }
    case "NODEJS":
    case "PYTHON": {
      const port = toPort(cfg.port)
      const startCommand = toStr(cfg.startCommand)
      const workingDir = defaultSiteRoot(domain)
      if (!port || !isValidPort(port)) return { error: "Geçerli bir port numarası gereklidir (1-65535)." }
      if (!startCommand || !isValidStartCommand(startCommand)) {
        return { error: "Geçerli bir başlatma komutu gereklidir (örn. npm run start)." }
      }
      return { plan: { type, port, startCommand, workingDir, linuxUser: autoLinuxUserFor(domain) } }
    }
    case "REVERSE_PROXY": {
      const upstreamUrl = toStr(cfg.upstreamUrl)
      if (!upstreamUrl || !isValidUpstreamUrl(upstreamUrl)) {
        return {
          error:
            "Geçerli bir hedef adres gereklidir (http:// veya https:// ile başlamalı, örn. http://127.0.0.1:4000).",
        }
      }
      return {
        plan: { type: "REVERSE_PROXY", upstreamUrl, workingDir: defaultSiteRoot(domain), linuxUser: autoLinuxUserFor(domain) },
      }
    }
    case "DOCKER": {
      const port = toPort(cfg.port)
      const workingDir = toStr(cfg.workingDir) || defaultSiteRoot(domain)
      const composeService = toStr(cfg.composeService)
      if (!port || !isValidPort(port)) return { error: "Geçerli bir port numarası gereklidir (1-65535)." }
      if (!isValidSiteRoot(workingDir)) {
        return { error: "Geçerli bir çalışma dizini gereklidir (/var/www/... altında)." }
      }
      if (composeService && !/^[A-Za-z0-9._-]{1,64}$/.test(composeService)) {
        return { error: "Geçersiz compose servis adı." }
      }
      return {
        plan: { type: "DOCKER", port, workingDir, composeService, linuxUser: autoLinuxUserFor(domain), bootstrap: !skipDockerBootstrap },
      }
    }
    default:
      return { error: "Geçerli bir site türü gereklidir." }
  }
}

/** Kalıcı `config` — yalnızca planın doğrulanmış alanları (+ www/sslEmail). Şifre ASLA yazılmaz. */
function configFromPlan(plan: ProvisionPlan, www: boolean, sslEmail: string): Record<string, unknown> {
  const base: Record<string, unknown> = { www }
  if (sslEmail) base.sslEmail = sslEmail
  switch (plan.type) {
    case "STATIC":
      return { ...base, siteRoot: plan.siteRoot, linuxUser: plan.linuxUser }
    case "PHP":
      return { ...base, phpVersion: plan.phpVersion, siteRoot: plan.siteRoot, linuxUser: plan.linuxUser }
    case "WORDPRESS":
      return {
        ...base,
        phpVersion: plan.phpVersion,
        siteRoot: plan.siteRoot,
        linuxUser: plan.linuxUser,
        dbName: plan.dbName,
        dbUser: plan.dbUser,
      }
    case "NODEJS":
    case "PYTHON":
      return { ...base, port: plan.port, startCommand: plan.startCommand, workingDir: plan.workingDir, linuxUser: plan.linuxUser }
    case "REVERSE_PROXY":
      return { ...base, upstreamUrl: plan.upstreamUrl, workingDir: plan.workingDir, linuxUser: plan.linuxUser }
    case "DOCKER":
      return {
        ...base,
        port: plan.port,
        workingDir: plan.workingDir,
        composeService: plan.composeService || undefined,
        linuxUser: plan.linuxUser,
      }
  }
}

function defaultProcessManager(plan: ProvisionPlan): "SYSTEMD" | "DOCKER_COMPOSE" | "NONE" {
  if (plan.type === "DOCKER") return "DOCKER_COMPOSE"
  if (plan.type === "REVERSE_PROXY") return "NONE"
  return "SYSTEMD"
}

/**
 * Uygulamanın KENDİSİNİN bağlanacağı portlarda (Node.js/Python/Docker)
 * çakışma sert hata: başka bir site kaydı aynı portu kullanıyorsa ya da
 * sunucuda o an biri dinliyorsa. Ters proxy'de hedef port zaten çalışan bir
 * uygulama olabilir — yalnızca başka bir site kaydıyla çakışma engellenir.
 */
async function findPortConflict(plan: ProvisionPlan, domain: string): Promise<string | null> {
  const port =
    plan.type === "NODEJS" || plan.type === "PYTHON" || plan.type === "DOCKER"
      ? plan.port
      : plan.type === "REVERSE_PROXY"
        ? sitePortOf({ type: "REVERSE_PROXY", config: { upstreamUrl: plan.upstreamUrl } })
        : null
  if (!port) return null

  const others = await prisma.site.findMany({ select: { domain: true, type: true, config: true } })
  const clash = others.find((s) => s.domain !== domain && sitePortOf(s) === port)
  if (clash) return `Port ${port} zaten "${clash.domain}" sitesi tarafından kullanılıyor.`

  if (plan.type !== "REVERSE_PROXY" && (await isPortListening(port))) {
    return `Port ${port} sunucuda şu an başka bir süreç tarafından dinleniyor — Portlar sayfasından boş bir port seçin.`
  }
  return null
}

async function runProvisioning(domain: string, www: boolean, plan: ProvisionPlan): Promise<void> {
  switch (plan.type) {
    case "STATIC":
      await createVhost({ domain, type: "STATIC", www, siteRoot: plan.siteRoot, linuxUser: plan.linuxUser })
      break
    case "PHP":
      await createVhost({
        domain,
        type: "PHP",
        www,
        phpVersion: plan.phpVersion,
        siteRoot: plan.siteRoot,
        linuxUser: plan.linuxUser,
      })
      break
    case "WORDPRESS":
      await createWpDb({ domain, dbName: plan.dbName, dbUser: plan.dbUser, dbPassword: plan.dbPassword })
      await createVhost({
        domain,
        type: "WORDPRESS",
        www,
        phpVersion: plan.phpVersion,
        siteRoot: plan.siteRoot,
        dbName: plan.dbName,
        dbUser: plan.dbUser,
        dbPassword: plan.dbPassword,
        linuxUser: plan.linuxUser,
      })
      break
    case "NODEJS":
    case "PYTHON":
      await createVhost({ domain, type: plan.type, www, port: plan.port })
      await createService({
        domain,
        workingDir: plan.workingDir,
        startCommand: plan.startCommand,
        port: plan.port,
        linuxUser: plan.linuxUser,
      })
      break
    case "REVERSE_PROXY":
      await createVhost({ domain, type: "REVERSE_PROXY", www, upstreamUrl: plan.upstreamUrl, linuxUser: plan.linuxUser })
      break
    case "DOCKER":
      await createVhost({
        domain,
        type: "DOCKER",
        www,
        port: plan.port,
        workingDir: plan.workingDir,
        composeService: plan.composeService || undefined,
        linuxUser: plan.linuxUser,
        bootstrap: plan.bootstrap,
      })
      break
  }
}

/**
 * Site satırını PROVISIONING durumunda oluşturur, gerçek provisioning'i
 * (`scripts/provision-site.sh` üzerinden nginx/systemd/mysql) senkron çalıştırır
 * ve satırı ACTIVE/FAILED yapar. SSL ayrı, best-effort bir adımdır: önce DNS
 * ön kontrolü (bkz. src/lib/dns-check.ts) — alan adı bu sunucuya (ya da
 * Cloudflare'a) bakmıyorsa certbot hiç çağrılmaz, net bir mesaj yazılır;
 * kullanıcı DNS'i düzeltince site detayından tekrar dener.
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 })
  }

  const { domain, type, sslEnabled, config, deployCommand, processManager, skipDockerBootstrap } = (body ?? {}) as {
    domain?: unknown
    type?: unknown
    sslEnabled?: unknown
    config?: unknown
    deployCommand?: unknown
    processManager?: unknown
    skipDockerBootstrap?: unknown
  }

  const domainValue = typeof domain === "string" ? domain.trim().toLowerCase() : ""
  if (!domainValue) {
    return NextResponse.json({ error: "Alan adı gereklidir." }, { status: 400 })
  }
  if (typeof type !== "string" || !VALID_TYPES.has(type)) {
    return NextResponse.json({ error: "Geçerli bir site türü gereklidir." }, { status: 400 })
  }

  const cfg = config && typeof config === "object" ? (config as Record<string, unknown>) : {}
  const www = toBool(cfg.www)
  const sslEnabledBool = Boolean(sslEnabled)
  const sslEmail = toStr(cfg.sslEmail)
  if (sslEnabledBool && !isValidEmail(sslEmail)) {
    return NextResponse.json({ error: "SSL için geçerli bir e-posta adresi gereklidir." }, { status: 400 })
  }

  const planResult = buildPlan(type, domainValue, cfg, toBool(skipDockerBootstrap))
  if ("error" in planResult) {
    return NextResponse.json({ error: planResult.error }, { status: 400 })
  }
  const { plan } = planResult

  const deployCommandValue = toStr(deployCommand)
  if (deployCommandValue && !isValidDeployCommand(deployCommandValue)) {
    return NextResponse.json({ error: "Deploy komutu en fazla 500 karakter olabilir." }, { status: 400 })
  }
  let processManagerValue = defaultProcessManager(plan) as string
  if (typeof processManager === "string" && processManager) {
    if (!VALID_PROCESS_MANAGERS.has(processManager)) {
      return NextResponse.json({ error: "Geçersiz process manager." }, { status: 400 })
    }
    if (processManager === "SYSTEMD" && plan.type !== "NODEJS" && plan.type !== "PYTHON") {
      return NextResponse.json({ error: "systemd yalnızca Node.js/Python sitelerinde kullanılabilir." }, { status: 400 })
    }
    processManagerValue = processManager
  }

  const conflict = await findPortConflict(plan, domainValue)
  if (conflict) {
    return NextResponse.json({ error: conflict }, { status: 409 })
  }

  const initialConfig = configFromPlan(plan, www, sslEmail)

  let site
  try {
    site = await prisma.site.create({
      data: {
        domain: domainValue,
        type: type as SiteType,
        status: "PROVISIONING",
        sslEnabled: sslEnabledBool,
        config: initialConfig as Prisma.InputJsonValue,
        processManager: processManagerValue as "SYSTEMD" | "DOCKER_COMPOSE" | "PM2" | "CUSTOM_SCRIPT" | "NONE",
        deployCommand: deployCommandValue || null,
      },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Bu alan adına sahip bir site zaten var." }, { status: 409 })
    }
    console.error("Site oluşturulamadı:", error)
    return NextResponse.json({ error: "Site oluşturulamadı." }, { status: 500 })
  }

  let status: "ACTIVE" | "FAILED" = "ACTIVE"
  let provisionError: string | null = null
  try {
    await runProvisioning(domainValue, www, plan)
  } catch (error) {
    status = "FAILED"
    provisionError =
      error instanceof ProvisionError ? error.message : "Provisioning sırasında beklenmeyen bir hata oluştu."
    console.error(`Site provisioning başarısız (${domainValue}):`, error)
  }

  const finalConfig: Record<string, unknown> = { ...initialConfig }
  if (status === "FAILED") finalConfig.provisionError = provisionError

  let sslStatus: "none" | "active" | "error" = "none"
  let sslLastError: string | null = null
  if (status === "ACTIVE" && sslEnabledBool) {
    const dnsCheck = await checkDomainDns(domainValue, www).catch(() => null)
    if (dnsCheck && !dnsCheck.ok) {
      sslStatus = "error"
      sslLastError = `DNS ön kontrolü: ${dnsCheck.message}`
    } else {
      try {
        await requestSsl(domainValue, sslEmail, www)
        sslStatus = "active"
      } catch (error) {
        sslStatus = "error"
        sslLastError = error instanceof ProvisionError ? error.message : "SSL sertifikası alınamadı."
        console.error(`SSL isteği başarısız (${domainValue}), site yine de ACTIVE kalıyor:`, error)
      }
    }
  }

  const updated = await prisma.site.update({
    where: { id: site.id },
    data: { status, sslStatus, sslLastError, config: finalConfig as Prisma.InputJsonValue },
  })

  await logAudit({
    userId: session.userId,
    action: "SITE_CREATE",
    targetType: "Site",
    targetId: site.id,
    detail: `${domainValue} (${type}) → ${status}`,
  })

  return NextResponse.json(updated, { status: 201 })
}
