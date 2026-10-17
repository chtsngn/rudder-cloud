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
  createVhost,
  defaultSiteRoot,
  isValidDeployCommand,
  isValidEmail,
  isValidLinuxUsername,
  isValidPort,
  isValidSiteRoot,
  isValidUpstreamUrl,
  ProvisionError,
  requestSsl,
} from "@/lib/provision"
import { writeTextFile } from "@/lib/site-fs"
import { normalizePublishDir } from "@/lib/site-paths"

const VALID_TYPES = new Set<string>(Object.values(SiteType))
const VALID_PROCESS_MANAGERS = new Set(["DOCKER_COMPOSE", "PM2", "CUSTOM_SCRIPT", "NONE"])

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
 * olabiliyordu). v1.4.0: yalnızca iki tür — Statik ve Uygulama (REVERSE_PROXY).
 */
type ProvisionPlan =
  | { type: "STATIC"; siteRoot: string; linuxUser: string; publishDir: string; spa: boolean }
  | {
      type: "REVERSE_PROXY"
      upstreamUrl: string
      workingDir: string
      linuxUser: string
      /** Repo bağlanmadan Docker Compose seçildiyse: örnek compose bu portu yayınlar. */
      composePort: number | null
    }

function buildPlan(
  type: string,
  domain: string,
  cfg: Record<string, unknown>,
  bootstrapCompose: boolean
): { plan: ProvisionPlan } | { error: string } {
  switch (type) {
    case "STATIC": {
      const siteRoot = toStr(cfg.siteRoot) || defaultSiteRoot(domain)
      if (!isValidSiteRoot(siteRoot)) return { error: "Geçerli bir site kök dizini gereklidir (/var/www/... altında)." }
      // Dedicated kullanıcı her zaman var (elle ad verilmezse otomatik
      // `site_<slug>`) — dosyalar root'ta kalmasın, MEMBER terminali mümkün olsun.
      const linuxUser = toStr(cfg.linuxUser) || autoLinuxUserFor(domain)
      if (!isValidLinuxUsername(linuxUser)) {
        return { error: "Geçersiz linux kullanıcı adı (küçük harfle başlamalı, en fazla 32 karakter)." }
      }
      // Yalnızca depo bağlanırsa kullanılır (bkz. src/lib/static-publish.ts).
      const publishDir = normalizePublishDir(cfg.publishDir)
      if (publishDir === null) return { error: "Geçersiz yayın klasörü (depo köküne göre göreli yol, ör. dist)." }
      return { plan: { type: "STATIC", siteRoot, linuxUser, publishDir, spa: toBool(cfg.spa) } }
    }
    case "REVERSE_PROXY": {
      // Hedef: tam adres (`upstreamUrl`) ya da yalnız yerel port (`port` ->
      // http://127.0.0.1:<port>). Docker Compose'daki uygulama genelde ikincisi.
      const port = toPort(cfg.port)
      if (port !== null && !isValidPort(port)) return { error: "Geçerli bir port numarası gereklidir (1-65535)." }
      const upstreamUrl = toStr(cfg.upstreamUrl) || (port ? `http://127.0.0.1:${port}` : "")
      if (!upstreamUrl || !isValidUpstreamUrl(upstreamUrl)) {
        return {
          error: "Geçerli bir port ya da hedef adres gereklidir (http:// veya https:// ile, örn. http://127.0.0.1:4000).",
        }
      }
      const localPort = sitePortOf({ type: "REVERSE_PROXY", config: { upstreamUrl } })
      if (bootstrapCompose && !localPort) {
        return { error: "Örnek Docker Compose için hedef bu sunucuda bir port olmalı (http://127.0.0.1:<port>)." }
      }
      return {
        plan: {
          type: "REVERSE_PROXY",
          upstreamUrl,
          workingDir: defaultSiteRoot(domain),
          linuxUser: autoLinuxUserFor(domain),
          composePort: bootstrapCompose ? localPort : null,
        },
      }
    }
    default:
      return { error: "Geçerli bir site türü gereklidir (Statik ya da Uygulama)." }
  }
}

/** Kalıcı `config` — yalnızca planın doğrulanmış alanları (+ www/sslEmail). */
function configFromPlan(plan: ProvisionPlan, www: boolean, sslEmail: string): Record<string, unknown> {
  const base: Record<string, unknown> = { www }
  if (sslEmail) base.sslEmail = sslEmail
  switch (plan.type) {
    case "STATIC":
      return {
        ...base,
        siteRoot: plan.siteRoot,
        linuxUser: plan.linuxUser,
        ...(plan.publishDir ? { publishDir: plan.publishDir } : {}),
        ...(plan.spa ? { spa: true } : {}),
      }
    case "REVERSE_PROXY":
      return { ...base, upstreamUrl: plan.upstreamUrl, workingDir: plan.workingDir, linuxUser: plan.linuxUser }
  }
}

/**
 * Port denetimi. Hedef port başka bir site kaydında da varsa yalnız uyarı:
 * birden çok site aynı uygulamaya yönlenebilir (ör. iki alan adı tek OSRM).
 * Sert hata yalnız Rudder bu portta yeni bir compose başlatacakken port o an
 * dinleniyorsa — konteyner bağlanamaz.
 */
async function checkPorts(plan: ProvisionPlan, domain: string): Promise<{ error: string | null; warnings: string[] }> {
  const warnings: string[] = []
  if (plan.type !== "REVERSE_PROXY") return { error: null, warnings }
  const port = sitePortOf({ type: "REVERSE_PROXY", config: { upstreamUrl: plan.upstreamUrl } })
  if (!port) return { error: null, warnings }

  if (plan.composePort && (await isPortListening(port))) {
    return {
      error: `Port ${port} sunucuda şu an başka bir süreç tarafından dinleniyor — Portlar sayfasından boş bir port seçin.`,
      warnings,
    }
  }

  const others = await prisma.site.findMany({ select: { domain: true, type: true, config: true } })
  const sharing = others.filter((s) => s.domain !== domain && sitePortOf(s) === port).map((s) => `"${s.domain}"`)
  if (sharing.length > 0) {
    warnings.push(
      plan.composePort
        ? `Port ${port} ${sharing.join(", ")} kaydında da var — iki uygulama aynı anda bu portu dinleyemez.`
        : `Port ${port} ${sharing.join(", ")} ile ortak — bu siteler aynı uygulamaya yönlenecek.`
    )
  }
  return { error: null, warnings }
}

const MAX_ENV_FILE_BYTES = 64 * 1024

/**
 * Sihirbazın Dockerfile kartı (v1.5.0): depoda compose yoksa Rudder site
 * klasörüne küçük bir compose yazar — image depodaki Dockerfile'dan derlenir,
 * yalnız 127.0.0.1'de yayınlanır. Depo sonra kendi compose dosyasını eklerse
 * pull onu getirir (`git reset --hard` izlenmeyen dosyanın üzerine yazar).
 */
function dockerfileComposeYaml(hostPort: number, containerPort: number, withEnv: boolean): string {
  return [
    "# Rudder: depodaki Dockerfile için üretildi (yeni site sihirbazı).",
    "services:",
    "  app:",
    "    build: .",
    "    ports:",
    `      - "127.0.0.1:${hostPort}:${containerPort}"`,
    ...(withEnv ? ["    env_file: .env"] : []),
    "    restart: unless-stopped",
    "",
  ].join("\n")
}

async function runProvisioning(domain: string, www: boolean, plan: ProvisionPlan): Promise<void> {
  switch (plan.type) {
    case "STATIC":
      await createVhost({ domain, type: "STATIC", www, siteRoot: plan.siteRoot, linuxUser: plan.linuxUser, spa: plan.spa })
      break
    case "REVERSE_PROXY":
      await createVhost({
        domain,
        type: "REVERSE_PROXY",
        www,
        upstreamUrl: plan.upstreamUrl,
        linuxUser: plan.linuxUser,
        composePort: plan.composePort ?? undefined,
      })
      break
  }
}

/**
 * Site satırını PROVISIONING durumunda oluşturur, gerçek provisioning'i
 * (`scripts/provision-site.sh` üzerinden nginx/kullanıcı/compose) senkron çalıştırır
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

  const { domain, type, sslEnabled, config, deployCommand, processManager, skipDockerBootstrap, envFile, dockerfileCompose } = (body ?? {}) as {
    domain?: unknown
    type?: unknown
    sslEnabled?: unknown
    config?: unknown
    deployCommand?: unknown
    processManager?: unknown
    skipDockerBootstrap?: unknown
    /** Uygulama: site klasörüne yazılacak ilk `.env` içeriği (sihirbaz, .env.example'dan). */
    envFile?: unknown
    /** Uygulama: depoda yalnız Dockerfile varsa Rudder'ın yazacağı compose için konteyner portu. */
    dockerfileCompose?: unknown
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

  // Uygulama + Docker Compose + repo yok: örnek compose ile hemen ayağa kalksın.
  // Repo seçildiyse (`skipDockerBootstrap`) gerçek compose klonlanacak.
  const wantsCompose = type === "REVERSE_PROXY" && (processManager === undefined || processManager === "DOCKER_COMPOSE")
  const planResult = buildPlan(type, domainValue, cfg, wantsCompose && !toBool(skipDockerBootstrap))
  if ("error" in planResult) {
    return NextResponse.json({ error: planResult.error }, { status: 400 })
  }
  const { plan } = planResult

  const deployCommandValue = toStr(deployCommand)
  if (deployCommandValue && !isValidDeployCommand(deployCommandValue)) {
    return NextResponse.json({ error: "Deploy komutu en fazla 500 karakter olabilir." }, { status: 400 })
  }
  // Statik sitede süreç yok; Uygulama'da varsayılan Docker Compose.
  let processManagerValue = plan.type === "STATIC" ? "NONE" : "DOCKER_COMPOSE"
  if (plan.type === "REVERSE_PROXY" && typeof processManager === "string" && processManager) {
    if (!VALID_PROCESS_MANAGERS.has(processManager)) {
      return NextResponse.json({ error: "Geçersiz process manager." }, { status: 400 })
    }
    processManagerValue = processManager
  }

  const envFileValue = typeof envFile === "string" && envFile.length > 0 ? envFile : null
  if (envFileValue !== null && (plan.type !== "REVERSE_PROXY" || Buffer.byteLength(envFileValue) > MAX_ENV_FILE_BYTES || envFileValue.includes("\0"))) {
    return NextResponse.json({ error: "Geçersiz .env içeriği (yalnız Uygulama, en fazla 64 KB)." }, { status: 400 })
  }
  let composeContainerPort: number | null = null
  if (dockerfileCompose && typeof dockerfileCompose === "object") {
    const port = toPort((dockerfileCompose as Record<string, unknown>).containerPort)
    const hostPort = plan.type === "REVERSE_PROXY" ? sitePortOf({ type: plan.type, config: { upstreamUrl: plan.upstreamUrl } }) : null
    if (plan.type !== "REVERSE_PROXY" || !port || !isValidPort(port) || !hostPort) {
      return NextResponse.json({ error: "Dockerfile compose'u için geçerli bir konteyner portu ve yerel hedef port gereklidir." }, { status: 400 })
    }
    composeContainerPort = port
  }

  const portCheck = await checkPorts(plan, domainValue)
  if (portCheck.error) {
    return NextResponse.json({ error: portCheck.error }, { status: 409 })
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
        processManager: processManagerValue as "DOCKER_COMPOSE" | "PM2" | "CUSTOM_SCRIPT" | "NONE",
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

  // Sihirbazın hazırladığı dosyalar: depo klonlanmadan ÖNCE yazılır (ilk klon
  // var olan dosyalara dokunmaz). Başarısızlık siteyi bozmaz, uyarı olarak döner.
  const setupWarnings: string[] = [...portCheck.warnings]
  if (status === "ACTIVE" && plan.type === "REVERSE_PROXY" && (envFileValue !== null || composeContainerPort)) {
    const siteLike = { domain: domainValue, type: plan.type, config: initialConfig }
    try {
      if (envFileValue !== null) await writeTextFile(siteLike, ".env", envFileValue)
      if (composeContainerPort) {
        const hostPort = sitePortOf({ type: plan.type, config: { upstreamUrl: plan.upstreamUrl } })!
        await writeTextFile(siteLike, "docker-compose.yml", dockerfileComposeYaml(hostPort, composeContainerPort, envFileValue !== null))
      }
    } catch (error) {
      setupWarnings.push(`Başlangıç dosyaları yazılamadı: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

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

  return NextResponse.json({ ...updated, setupWarnings }, { status: 201 })
}
