/**
 * Bir sitenin gerçek dosyalarının sunucuda nerede yaşadığını çözer. Git pull
 * ve restart mantığının ikisi de bunu kullanır, tek bir yerde tutarlı olsun
 * diye — provision-site.sh'ın kendi konvansiyonlarıyla birebir eşleşmeli:
 *   - STATIC/PHP/WORDPRESS: nginx `root` = `<siteRoot>/public` (bkz.
 *     provision-site.sh `cmd_create_vhost`). Git'e bağlı STATIC sitede depo
 *     `public`'e DEĞİL `<siteRoot>/repo`'ya klonlanır (`resolveGitWorkdir`);
 *     derleme orada çalışır, yayın klasörü sonra `public`'e aynalanır (bkz.
 *     src/lib/static-publish.ts) — `.git` ve kaynak kod yayına çıkmaz.
 *   - NODEJS/PYTHON: systemd `WorkingDirectory` = `<workingDir>` (siteRoot'un
 *     kendisi, `/public` eki YOK — bkz. `cmd_create_service`).
 *   - REVERSE_PROXY: `cmd_create_vhost` artık her zaman `/var/www/<domain>`i
 *     `mkdir -p` ediyor (bkz. provision-site.sh REVERSE_PROXY case'i) — panelin
 *     CloudPanel-tarzı asıl kullanım şekli zaten bu: reverse-proxy site + git
 *     clone + manuel/PM2/Docker Compose ile ayağa kaldırma + proxy hedefini o
 *     porta güncelleme (bkz. provision.ts `updateUpstream`). Bu yüzden
 *     NODEJS/PYTHON ile aynı konvansiyonu kullanır (siteRoot'un kendisi).
 *   - DOCKER: `working_dir` (compose dosyasının bulunduğu dizin) — `cmd_create_vhost`
 *     bunu zaten `mkdir -p` ediyor, `config.workingDir`'de saklanıyor (bkz.
 *     `src/app/api/sites/route.ts` DOCKER planı).
 */
import { defaultSiteRoot } from "@/lib/provision"

export interface SiteLike {
  domain: string
  type: string
  config: unknown
}

function cfgString(config: unknown, key: string): string | undefined {
  if (!config || typeof config !== "object") return undefined
  const value = (config as Record<string, unknown>)[key]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

/** Sitenin gerçek dosyalarının bulunduğu mutlak dizin, ya da tanınmayan bir site türü için `null`. */
export function resolveSiteWorkdir(site: SiteLike): string | null {
  switch (site.type) {
    case "STATIC":
    case "PHP":
    case "WORDPRESS": {
      const siteRoot = cfgString(site.config, "siteRoot") ?? defaultSiteRoot(site.domain)
      return `${siteRoot}/public`
    }
    case "NODEJS":
    case "PYTHON":
    case "REVERSE_PROXY":
    case "DOCKER": {
      return cfgString(site.config, "workingDir") ?? defaultSiteRoot(site.domain)
    }
    default:
      return null
  }
}

/** Git'e bağlı STATIC sitede deponun klonlandığı klasör (`<siteRoot>/repo`). */
export const STATIC_REPO_DIRNAME = "repo"

/** STATIC/PHP/WORDPRESS sitenin kök klasörü (`public`'in üstü). */
export function resolveSiteRoot(site: SiteLike): string {
  return cfgString(site.config, "siteRoot") ?? defaultSiteRoot(site.domain)
}

/**
 * Git'in çalıştığı (klon / pull / deploy komutu) dizin. STATIC'te
 * `<siteRoot>/repo`, git destekleyen diğer tiplerde sitenin çalışma dizini.
 */
export function resolveGitWorkdir(site: SiteLike): string | null {
  if (site.type === "STATIC") return `${resolveSiteRoot(site)}/${STATIC_REPO_DIRNAME}`
  return resolveSiteWorkdir(site)
}

const PUBLISH_DIR_SEGMENT_RE = /^[A-Za-z0-9._-]+$/

/**
 * STATIC yayın klasörünü (depo köküne göre, ör. `dist`, `apps/web/out`)
 * normalize eder: depo kökü için `""` (`.`, `./`, `/` da kabul), geçersizse
 * `null`. `..` ve `.git` parçaları reddedilir; symlink kaçışını
 * static-publish.ts ayrıca realpath ile kontrol eder.
 */
export function normalizePublishDir(value: unknown): string | null {
  if (value === null || value === undefined) return ""
  if (typeof value !== "string" || value.length > 200) return null
  const trimmed = value.trim().replace(/^\.?\/+/, "").replace(/\/+$/, "")
  if (trimmed === "" || trimmed === ".") return ""
  const segments = trimmed.split("/")
  for (const seg of segments) {
    if (!PUBLISH_DIR_SEGMENT_RE.test(seg) || seg === "." || seg === ".." || seg === ".git") return null
  }
  return segments.join("/")
}

/** Sitenin kayıtlı yayın klasörü (`config.publishDir`), yoksa depo kökü (`""`). */
export function sitePublishDir(site: SiteLike): string {
  return normalizePublishDir(cfgString(site.config, "publishDir")) ?? ""
}
