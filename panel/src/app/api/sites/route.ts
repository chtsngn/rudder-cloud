import { NextResponse } from "next/server"
import { Prisma, SiteType } from "@prisma/client"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import { isSuperAdmin } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import {
  createService,
  createVhost,
  createWpDb,
  defaultSiteRoot,
  isValidDbIdentifier,
  isValidDbPassword,
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

/**
 * SUPER_ADMIN tüm siteleri görür. MEMBER yalnızca kendisine `VIEW` izni
 * verilmiş siteleri görür (bkz. src/lib/permissions.ts). Dashboard'daki
 * site listesi, site sihirbazı adım dışındaki HER yerde bu endpoint'ten
 * besleniyor — bu yüzden filtreleme burada tek noktadan yapılıyor.
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
  const viewableIds = new Set(
    grants.filter((g) => g.permissions.includes("VIEW")).map((g) => g.siteId)
  )
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
 * Bir sonraki adımda gerçek provisioning çağrılarını yapmak için gereken,
 * doğrulanmış, tipe özel alanları taşır. `POST` içinde DB satırı
 * oluşturulmadan ÖNCE derlenir, böylece açıkça geçersiz girdiler için
 * hiçbir satır yaratılmaz.
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
  | { type: "NODEJS" | "PYTHON"; port: number; startCommand: string; workingDir: string }
  | { type: "REVERSE_PROXY"; upstreamUrl: string }

function buildPlan(
  type: string,
  domain: string,
  cfg: Record<string, unknown>
): { plan: ProvisionPlan } | { error: string } {
  switch (type) {
    case "STATIC": {
      const siteRoot = toStr(cfg.siteRoot) || defaultSiteRoot(domain)
      const linuxUser = toStr(cfg.linuxUser)
      if (!isValidSiteRoot(siteRoot)) return { error: "Geçerli bir site kök dizini gereklidir (/var/www/... altında)." }
      if (linuxUser && !isValidLinuxUsername(linuxUser)) return { error: "Geçersiz linux kullanıcı adı." }
      return { plan: { type: "STATIC", siteRoot, linuxUser } }
    }
    case "PHP": {
      const phpVersion = toStr(cfg.phpVersion) || "8.3"
      const siteRoot = toStr(cfg.siteRoot) || defaultSiteRoot(domain)
      const linuxUser = toStr(cfg.linuxUser)
      if (!isValidPhpVersion(phpVersion)) return { error: "Geçerli bir PHP sürümü gereklidir (örn. 8.3)." }
      if (!isValidSiteRoot(siteRoot)) return { error: "Geçerli bir site kök dizini gereklidir (/var/www/... altında)." }
      if (linuxUser && !isValidLinuxUsername(linuxUser)) return { error: "Geçersiz linux kullanıcı adı." }
      return { plan: { type: "PHP", phpVersion, siteRoot, linuxUser } }
    }
    case "WORDPRESS": {
      const phpVersion = toStr(cfg.phpVersion) || "8.3"
      const siteRoot = toStr(cfg.siteRoot) || defaultSiteRoot(domain)
      const linuxUser = toStr(cfg.linuxUser)
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
      if (linuxUser && !isValidLinuxUsername(linuxUser)) return { error: "Geçersiz linux kullanıcı adı." }
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
      return { plan: { type, port, startCommand, workingDir } }
    }
    case "REVERSE_PROXY": {
      const upstreamUrl = toStr(cfg.upstreamUrl)
      if (!upstreamUrl || !isValidUpstreamUrl(upstreamUrl)) {
        return {
          error:
            "Geçerli bir hedef adres gereklidir (http:// veya https:// ile başlamalı, örn. http://127.0.0.1:4000).",
        }
      }
      return { plan: { type: "REVERSE_PROXY", upstreamUrl } }
    }
    default:
      return { error: "Geçerli bir site türü gereklidir." }
  }
}

/**
 * SADECE vhost/systemd/db oluşturmayı kapsar — SSL isteği KASITLI olarak
 * burada DEĞİL, ayrı ve bağımsız bir adımda (bkz. POST altında). Sebep: SSL
 * (certbot) alan adının DNS'inin bu sunucuya yönlendirilmiş olmasını
 * gerektirir — bu genelde site oluşturma anında henüz gerçekleşmemiş olur
 * (kullanıcı DNS'i sonradan ayarlar). Eskiden requestSsl() burada çağrılıp
 * hata fırlatırsa TÜM site FAILED işaretleniyordu — vhost'un kendisi
 * başarıyla kurulmuş olsa bile. Artık vhost/servis/db adımı bu fonksiyonun
 * sorumluluğu, SSL ayrı bir "best-effort" adım (bkz. Site.sslStatus notu).
 */
async function runProvisioning(domain: string, www: boolean, plan: ProvisionPlan): Promise<void> {
  switch (plan.type) {
    case "STATIC":
      await createVhost({
        domain,
        type: "STATIC",
        www,
        siteRoot: plan.siteRoot,
        linuxUser: plan.linuxUser || undefined,
      })
      break
    case "PHP":
      await createVhost({
        domain,
        type: "PHP",
        www,
        phpVersion: plan.phpVersion,
        siteRoot: plan.siteRoot,
        linuxUser: plan.linuxUser || undefined,
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
        linuxUser: plan.linuxUser || undefined,
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
      })
      break
    case "REVERSE_PROXY":
      await createVhost({ domain, type: "REVERSE_PROXY", www, upstreamUrl: plan.upstreamUrl })
      break
  }
}

/**
 * Site satırını PROVISIONING durumunda oluşturur, ardından gerçek
 * provisioning'i (`scripts/provision-site.sh` üzerinden nginx/systemd/
 * certbot/mysql) senkron olarak çalıştırır ve satırı ACTIVE veya FAILED
 * olarak günceller. Bu geçiş senkron/best-effort'tur (canlı log akışı bu
 * aşamada kapsam dışı) — execFile çağrıları makul zaman aşımlarıyla
 * sınırlıdır, bu yüzden istek sonsuza kadar asılı kalmaz.
 */
export async function POST(request: Request) {
  // Site oluşturma (provisioning) sistem düzeyinde işlemler yapar (nginx/
  // systemd/certbot/mysql, yeni bir linux kullanıcısı vb.) — bu yüzden
  // site-scoped bir izinle DEĞİL, doğrudan SUPER_ADMIN rolüyle korunuyor
  // (bkz. docs/ARCHITECTURE.md → Aşama G).
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

  const { domain, type, sslEnabled, config } = (body ?? {}) as {
    domain?: unknown
    type?: unknown
    sslEnabled?: unknown
    config?: unknown
  }

  const domainValue = typeof domain === "string" ? domain.trim().toLowerCase() : ""
  if (!domainValue) {
    return NextResponse.json({ error: "Alan adı gereklidir." }, { status: 400 })
  }

  if (typeof type !== "string" || !VALID_TYPES.has(type)) {
    return NextResponse.json({ error: "Geçerli bir site türü gereklidir." }, { status: 400 })
  }

  const cfg = (config && typeof config === "object" ? (config as Record<string, unknown>) : {})
  const www = toBool(cfg.www)
  const sslEnabledBool = Boolean(sslEnabled)
  const sslEmail = toStr(cfg.sslEmail)

  if (sslEnabledBool && !isValidEmail(sslEmail)) {
    return NextResponse.json({ error: "SSL için geçerli bir e-posta adresi gereklidir." }, { status: 400 })
  }

  const planResult = buildPlan(type, domainValue, cfg)
  if ("error" in planResult) {
    return NextResponse.json({ error: planResult.error }, { status: 400 })
  }
  const { plan } = planResult

  // Ham veritabanı şifresini DB satırı ilk oluşturulurken bile kalıcı
  // config'e yazmıyoruz — provisioning çöker/süreç ortada kesilirse
  // (ör. WordPress indirmesi sırasında) satırın PROVISIONING durumunda
  // düz metin şifreyle sonsuza dek kalmasını önler. `plan` içindeki
  // doğrulanmış şifre `runProvisioning`'e ayrıca, config'ten bağımsız
  // olarak geçiyor zaten.
  const initialConfig: Record<string, unknown> = { ...cfg }
  delete initialConfig.dbPassword

  let site
  try {
    site = await prisma.site.create({
      data: {
        domain: domainValue,
        type: type as SiteType,
        status: "PROVISIONING",
        sslEnabled: sslEnabledBool,
        config: initialConfig as Prisma.InputJsonValue,
      },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "Bu alan adına sahip bir site zaten var." },
        { status: 409 }
      )
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
      error instanceof ProvisionError
        ? error.message
        : "Provisioning sırasında beklenmeyen bir hata oluştu."
    console.error(`Site provisioning başarısız (${domainValue}):`, error)
  }

  // Ham veritabanı şifresini kalıcı config'te tutmuyoruz — yalnızca yukarıdaki
  // provisioning çağrısı için geçici olarak kullanıldı.
  const finalConfig: Record<string, unknown> = { ...initialConfig }
  if (status === "FAILED") {
    finalConfig.provisionError = provisionError
  }

  // SSL, vhost/servis başarıyla kurulduysa ve kullanıcı istediyse AYRI ve
  // BAĞIMSIZ bir adım olarak denenir — başarısız olsa bile site FAILED
  // olmaz (bkz. runProvisioning'in üzerindeki not). DNS henüz bu sunucuya
  // yönlendirilmemişse bu beklenen bir durumdur; kullanıcı DNS'i düzelttikten
  // sonra site detay sayfasından yeniden deneyebilir (bkz. /api/sites/[id]/ssl).
  let sslStatus: "none" | "active" | "error" = "none"
  let sslLastError: string | null = null
  if (status === "ACTIVE" && sslEnabledBool) {
    try {
      await requestSsl(domainValue, sslEmail, www)
      sslStatus = "active"
    } catch (error) {
      sslStatus = "error"
      sslLastError =
        error instanceof ProvisionError ? error.message : "SSL sertifikası alınamadı."
      console.error(`SSL isteği başarısız (${domainValue}), site yine de ACTIVE kalıyor:`, error)
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
