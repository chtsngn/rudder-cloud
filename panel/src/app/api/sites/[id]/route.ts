import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import { removeDeployKey } from "@/lib/deploy-keys"
import { isValidGitBranch, isValidRepoUrl } from "@/lib/git"
import { canManageSite, isSuperAdmin } from "@/lib/permissions"
import { isPortListening, sitePortOf } from "@/lib/ports"
import { prisma } from "@/lib/prisma"
import {
  cleanupSite,
  defaultSiteRoot,
  isValidAbsolutePath,
  isValidDeployCommand,
  isValidPm2Name,
  isValidUpstreamUrl,
  ProvisionError,
  removeVhost,
  updateStaticRouting,
  updateUpstream,
} from "@/lib/provision"
import { normalizePublishDir, resolveSiteWorkdir } from "@/lib/site-paths"

interface RouteParams {
  params: Promise<{ id: string }>
}


export async function GET(_request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }

  const { id } = await params
  const site = await prisma.site.findUnique({ where: { id } })
  if (!site) {
    return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 })
  }
  if (!(await canManageSite(session.userId, site, "VIEW"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }
  return NextResponse.json(site)
}

const VALID_PROCESS_MANAGERS = new Set(["DOCKER_COMPOSE", "PM2", "CUSTOM_SCRIPT", "NONE"])

/**
 * Yürütmeyle ilgili alanlar SADECE SUPER_ADMIN (2026-09-15): `panel`
 * kullanıcısının root kabuğa sudo'su olduğu için panel olarak çalışan her
 * komut (özel betik, deploy komutu) fiilen root
 * yetkisindedir — EDIT_FILES'lı bir MEMBER dosya yöneticisiyle betik yazıp
 * bunlardan birine bağlayarak root'a çıkabilirdi.
 */
const ADMIN_ONLY_FIELDS = ["processManager", "customRestartCommand", "deployCommand", "pm2ProcessName"]

/**
 * `PATCH /api/sites/[id]` — git/deploy/restart ayarları, Uygulama hedefi,
 * Statik yayın klasörü ve SPA modu. Yalnızca gönderilen alanlar değişir;
 * site tipi/domain burada DEĞİŞTİRİLEMEZ.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }

  const { id } = await params
  const site = await prisma.site.findUnique({ where: { id } })
  if (!site) {
    return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 })
  }
  if (!(await canManageSite(session.userId, site, "EDIT_FILES"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 })
  }
  const input = (body ?? {}) as Record<string, unknown>

  const touchesAdminField = ADMIN_ONLY_FIELDS.some((f) => f in input)
  const admin = await isSuperAdmin(session.userId)
  if (touchesAdminField && !admin) {
    return NextResponse.json(
      { error: "Süreç yöneticisi ve deploy/restart komutları yalnızca süper admin tarafından değiştirilebilir." },
      { status: 403 }
    )
  }

  const data: Record<string, unknown> = {}
  const changed: string[] = []
  const warnings: string[] = []
  const currentConfig = (site.config ?? {}) as Record<string, unknown>
  let nextConfig: Record<string, unknown> | null = null

  if ("repoUrl" in input) {
    const value = input.repoUrl
    if (value === null || value === "") {
      data.repoUrl = null
    } else if (typeof value === "string" && isValidRepoUrl(value.trim())) {
      data.repoUrl = value.trim()
    } else {
      return NextResponse.json(
        { error: "Geçersiz repo adresi (https://host/owner/repo.git, git@host:owner/repo.git ya da ssh://... bekleniyor)." },
        { status: 400 }
      )
    }
    changed.push("repoUrl")
  }

  if ("gitBranch" in input) {
    const value = input.gitBranch
    if (typeof value !== "string" || !isValidGitBranch(value)) {
      return NextResponse.json({ error: "Geçersiz git branch." }, { status: 400 })
    }
    data.gitBranch = value
    changed.push("gitBranch")
  }

  if ("autoPullEnabled" in input) {
    data.autoPullEnabled = Boolean(input.autoPullEnabled)
    changed.push("autoPullEnabled")
  }

  if ("autoPullIntervalSeconds" in input) {
    const value = input.autoPullIntervalSeconds
    const n = typeof value === "number" ? value : Number.NaN
    if (!Number.isInteger(n) || n < 5 || n > 86400) {
      return NextResponse.json({ error: "Otomatik pull aralığı 5-86400 saniye arasında olmalı." }, { status: 400 })
    }
    data.autoPullIntervalSeconds = n
    changed.push("autoPullIntervalSeconds")
  }

  if ("processManager" in input) {
    const value = input.processManager
    if (typeof value !== "string" || !VALID_PROCESS_MANAGERS.has(value)) {
      return NextResponse.json({ error: "Geçersiz process manager." }, { status: 400 })
    }
    if (site.type === "STATIC" && value !== "NONE") {
      return NextResponse.json({ error: "Statik sitede süreç yöneticisi yok." }, { status: 400 })
    }
    data.processManager = value
    changed.push("processManager")
  }

  if ("customRestartCommand" in input) {
    const value = input.customRestartCommand
    if (value === null || value === "") {
      data.customRestartCommand = null
    } else if (typeof value === "string" && isValidAbsolutePath(value)) {
      data.customRestartCommand = value
    } else {
      return NextResponse.json({ error: "Özel restart komutu geçerli bir mutlak yol olmalı." }, { status: 400 })
    }
    changed.push("customRestartCommand")
  }

  if ("deployCommand" in input) {
    const value = input.deployCommand
    if (value === null || value === "" || (typeof value === "string" && value.trim() === "")) {
      data.deployCommand = null
    } else if (typeof value === "string" && isValidDeployCommand(value.trim())) {
      data.deployCommand = value.trim()
    } else {
      return NextResponse.json({ error: "Deploy komutu en fazla 500 karakter olabilir." }, { status: 400 })
    }
    changed.push("deployCommand")
  }

  if ("pm2ProcessName" in input) {
    const value = input.pm2ProcessName
    if (value === null || value === "" || (typeof value === "string" && value.trim() === "")) {
      data.pm2ProcessName = null
    } else if (typeof value === "string" && isValidPm2Name(value.trim())) {
      data.pm2ProcessName = value.trim()
    } else {
      return NextResponse.json({ error: "Geçersiz PM2 süreç adı (harf/rakam/._- en fazla 64 karakter)." }, { status: 400 })
    }
    changed.push("pm2ProcessName")
  }

  /**
   * Yayın klasörü — yalnızca STATIC: derlemeden sonra depodaki hangi klasörün
   * `public`'e aynalanacağı (bkz. src/lib/static-publish.ts). Bir sonraki
   * deploy'da uygulanır.
   */
  if ("publishDir" in input) {
    if (site.type !== "STATIC") {
      return NextResponse.json({ error: "Yayın klasörü yalnızca statik siteler için ayarlanabilir." }, { status: 400 })
    }
    const value = normalizePublishDir(input.publishDir)
    if (value === null) {
      return NextResponse.json(
        { error: "Geçersiz yayın klasörü (depo köküne göre göreli yol, ör. dist ya da apps/web/out; .. kullanılamaz)." },
        { status: 400 }
      )
    }
    nextConfig = { ...(nextConfig ?? currentConfig), publishDir: value }
    changed.push("publishDir")
  }

  /**
   * Hedef adres (upstream) — yalnızca REVERSE_PROXY. Nginx tarafı
   * `updateUpstream` ile (SSL'i bozmadan) güncellenir.
   */
  if ("upstreamUrl" in input) {
    if (site.type !== "REVERSE_PROXY") {
      return NextResponse.json({ error: "Hedef adres yalnızca ters proxy siteleri için değiştirilebilir." }, { status: 400 })
    }
    const value = input.upstreamUrl
    if (typeof value !== "string" || !isValidUpstreamUrl(value.trim())) {
      return NextResponse.json({ error: "Geçersiz hedef adres." }, { status: 400 })
    }
    // Birden çok site aynı uygulamaya yönlenebilir (ör. iki alan adı tek OSRM):
    // ortak port engel değil, yalnız uyarı. Üye ise yalnız kendi yönettiği
    // sitelerin uygulamasına yönlendirebilir — yoksa erişimi olmayan bir
    // uygulamayı kendi alan adından yayınlayabilirdi.
    const newPort = sitePortOf({ type: site.type, config: { upstreamUrl: value.trim() } })
    if (newPort && newPort !== sitePortOf(site)) {
      const others = await prisma.site.findMany({ where: { id: { not: id } }, select: { id: true, domain: true, type: true, config: true } })
      const sharing = others.filter((s) => sitePortOf(s) === newPort)
      if (!admin) {
        for (const other of sharing) {
          if (!(await canManageSite(session.userId, other, "EDIT_FILES"))) {
            return NextResponse.json(
              { error: `Port ${newPort} "${other.domain}" sitesinin; yönetmediğiniz bir sitenin uygulamasına yönlendiremezsiniz.` },
              { status: 403 }
            )
          }
        }
      }
      if (sharing.length > 0) {
        const domains = sharing.map((s) => `"${s.domain}"`).join(", ")
        warnings.push(`Port ${newPort} ${domains} ile ortak — bu siteler aynı uygulamaya yönlenecek.`)
      }
    }
    try {
      await updateUpstream(site.domain, value.trim())
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof ProvisionError ? error.message : "Hedef adres güncellenemedi." },
        { status: 500 }
      )
    }
    nextConfig = { ...(nextConfig ?? currentConfig), upstreamUrl: value.trim() }
    changed.push("upstreamUrl")
  }

  /**
   * SPA modu — yalnızca STATIC: bulunamayan yol index.html'e düşer. Vhost'un
   * yalnızca `location /` satırı değişir (SSL bloğu korunur).
   */
  if ("spa" in input) {
    if (site.type !== "STATIC") {
      return NextResponse.json({ error: "SPA modu yalnızca statik siteler için ayarlanabilir." }, { status: 400 })
    }
    const spa = input.spa === true
    try {
      await updateStaticRouting(site.domain, spa)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof ProvisionError ? error.message : "Yönlendirme güncellenemedi." },
        { status: 500 }
      )
    }
    nextConfig = { ...(nextConfig ?? currentConfig), spa }
    changed.push("spa")
  }

  if (nextConfig) data.config = nextConfig as Prisma.InputJsonValue

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Güncellenecek bir alan gönderilmedi." }, { status: 400 })
  }

  const updated = await prisma.site.update({ where: { id }, data })
  void logAudit({
    userId: session.userId,
    action: "SITE_SETTINGS_UPDATE",
    targetType: "Site",
    targetId: id,
    detail: `${site.domain}: ${changed.join(", ")}`,
  })
  return NextResponse.json(warnings.length > 0 ? { ...updated, warnings } : updated)
}

/**
 * Siteyi siler. Nginx vhost her zaman; ayrıca (2026-09-15) compose
 * konteynerleri her zaman durdurulur (portu tutmasın), deploy key silinir. Klasör ve dedicated
 * kullanıcı YALNIZCA `?removeFolder=true` / `?removeUser=true` ile — veri
 * silme kullanıcının açık kararı. Adımlar best-effort: biri başarısız olsa
 * bile DB satırı silinir (bozuk bir kayıt her zaman listeden kaldırılabilmeli).
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  const { id } = await params
  const site = await prisma.site.findUnique({ where: { id } })
  if (!site) {
    return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 })
  }

  const url = new URL(request.url)
  const removeFolder = url.searchParams.get("removeFolder") === "true"
  const removeUser = url.searchParams.get("removeUser") === "true"
  const warnings: string[] = []

  try {
    await removeVhost(site.domain)
  } catch (error) {
    warnings.push(`Nginx vhost kaldırılamadı: ${error instanceof Error ? error.message : String(error)}`)
  }

  const cfg = (site.config ?? {}) as Record<string, unknown>
  const cleanupDir = site.type === "STATIC"
    ? (typeof cfg.siteRoot === "string" && cfg.siteRoot ? cfg.siteRoot : defaultSiteRoot(site.domain))
    : (resolveSiteWorkdir(site) ?? defaultSiteRoot(site.domain))
  try {
    await cleanupSite({
      domain: site.domain,
      workdir: cleanupDir,
      linuxUser: typeof cfg.linuxUser === "string" ? cfg.linuxUser : null,
      removeFolder,
      removeUser,
    })
  } catch (error) {
    warnings.push(`Temizlik tamamlanamadı: ${error instanceof Error ? error.message : String(error)}`)
  }

  await removeDeployKey(site.domain).catch(() => {})

  try {
    await prisma.site.delete({ where: { id } })
  } catch {
    return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 })
  }
  await logAudit({
    userId: session.userId,
    action: "SITE_DELETE",
    targetType: "Site",
    targetId: id,
    detail: `${site.domain}${removeFolder ? " +klasör" : ""}${removeUser ? " +kullanıcı" : ""}${warnings.length ? ` (uyarı: ${warnings.join("; ")})` : ""}`,
  })
  return NextResponse.json({ ok: true, warnings })
}
