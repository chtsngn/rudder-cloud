/**
 * Git'e bağlı STATIC sitenin yayın adımı: deponun (`<siteRoot>/repo`)
 * yayın klasörü (`config.publishDir`, ör. `dist`; boşsa depo kökü) nginx'in
 * sunduğu `<siteRoot>/public`'e `rsync --delete` ile aynalanır.
 *
 * Neden kopya, neden doğrudan `public`'e klon değil: `.git` ve kaynak kod hiç
 * yayına çıkmaz, derleme canlı klasörü yarım bırakmaz (`--delay-updates`
 * dosyaları sonda topluca yerine koyar) ve yayın klasörü vhost'a dokunmadan
 * değiştirilebilir.
 *
 * Panel bu klasörlere site kullanıcısının sahipliği altında ACL ile yazar
 * (bkz. provision-site.sh `apply_owned_site_access`), bu yüzden rsync sahiplik,
 * izin ve klasör zamanı AKTARMAZ: `public`'in kendisi site kullanıcısına ait,
 * onun üzerinde chmod/chgrp/utime panelde hata verirdi. Yeni dosyalar
 * `public`'in varsayılan ACL'ini (www-data okuma) devralır.
 *
 * Yayına hiç çıkmayanlar (v1.4.0): nokta dosyaları (`.git`, `.env`…;
 * `.well-known` hariç) her zaman; yayın klasörü depo köküyse (düz HTML)
 * ayrıca kaynak ve araç dosyaları (`ROOT_PUBLISH_EXCLUDES`) — CloudPanel'deki
 * "site.com/src/config.ts indirilebiliyor" açığı sınıfı. `--delete-excluded`
 * daha önce yayınlanmış böyle dosyaları da `public`'ten siler.
 */
import { execFile } from "node:child_process"
import { realpath, stat } from "node:fs/promises"
import { join, sep } from "node:path"
import { promisify } from "node:util"

import { resolveGitWorkdir, resolveSiteWorkdir, sitePublishDir, type SiteLike } from "@/lib/site-paths"

const execFileAsync = promisify(execFile)
const PUBLISH_TIMEOUT_MS = 5 * 60_000

/** Depo kökü yayınlanırken dışarıda kalanlar (rsync desenleri; `/` ile başlayan yalnız kökte). */
export const ROOT_PUBLISH_EXCLUDES = [
  "node_modules",
  "/package.json",
  "/package-lock.json",
  "/npm-shrinkwrap.json",
  "/pnpm-lock.yaml",
  "/pnpm-workspace.yaml",
  "/yarn.lock",
  "/bun.lock",
  "/bun.lockb",
  "/Dockerfile*",
  "/docker-compose*",
  "/compose.yml",
  "/compose.yaml",
  "/tsconfig*.json",
  "/*.config.js",
  "/*.config.cjs",
  "/*.config.mjs",
  "/*.config.ts",
  "*.ts",
  "*.tsx",
  "*.mts",
  "*.cts",
  "*.md",
]

export class PublishError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PublishError"
  }
}

export interface PublishResult {
  /** Depo içindeki yayın klasörü (`""` = depo kökü). */
  publishDir: string
  source: string
  target: string
}

export async function publishStaticSite(site: SiteLike): Promise<PublishResult> {
  const repoDir = resolveGitWorkdir(site)
  const target = resolveSiteWorkdir(site)
  if (site.type !== "STATIC" || !repoDir || !target) {
    throw new PublishError("Yayın adımı yalnızca statik siteler içindir.")
  }
  const publishDir = sitePublishDir(site)
  const label = publishDir || "."

  // Yayın klasörü bir symlink olup depo dışını (ör. `/`) gösteremesin.
  let source: string
  try {
    const realRepo = await realpath(repoDir)
    source = await realpath(join(repoDir, publishDir))
    if (source !== realRepo && !source.startsWith(realRepo + sep)) {
      throw new PublishError(`Yayın klasörü depo dışını gösteriyor: ${label}`)
    }
    if (!(await stat(source)).isDirectory()) {
      throw new PublishError(`Yayın klasörü bir klasör değil: ${label}`)
    }
  } catch (error) {
    if (error instanceof PublishError) throw error
    throw new PublishError(
      `Yayın klasörü bulunamadı: ${label} — derleme komutu bu klasörü üretiyor mu? (depo: ${repoDir})`
    )
  }

  try {
    await execFileAsync(
      "rsync",
      [
        "-rlt",
        // Boyut+zaman yerine içerik: aynı boyutta ve aynı saniyede değişen ya
        // da sabit zaman damgalı (tekrarlanabilir derleme) dosyalar atlanmasın.
        "--checksum",
        "--safe-links", // depo dışını gösteren / mutlak symlink'ler kopyalanmaz
        "--delete",
        "--delay-updates",
        "--omit-dir-times",
        "--no-perms",
        "--no-owner",
        "--no-group",
        "--delete-excluded",
        // `.well-known` (ACME, assetlinks…) dışındaki nokta dosyaları hiç yayınlanmaz.
        "--include=/.well-known/***",
        "--exclude=.*",
        ...(publishDir === "" ? ROOT_PUBLISH_EXCLUDES.map((p) => `--exclude=${p}`) : []),
        `${source}/`,
        `${target}/`,
      ],
      { timeout: PUBLISH_TIMEOUT_MS }
    )
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: string; killed?: boolean }
    if (err.killed) throw new PublishError("Yayınlama (rsync) zaman aşımına uğradı.")
    const detail = err.stderr?.toString().trim() || err.message
    throw new PublishError(`Yayınlama başarısız oldu: ${detail}`)
  }

  return { publishDir, source, target }
}
