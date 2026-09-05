/**
 * Bir sitenin gerçek dosyalarının sunucuda nerede yaşadığını çözer. Git pull
 * ve restart mantığının ikisi de bunu kullanır, tek bir yerde tutarlı olsun
 * diye — provision-site.sh'ın kendi konvansiyonlarıyla birebir eşleşmeli:
 *   - STATIC/PHP/WORDPRESS: nginx `root` = `<siteRoot>/public` (bkz.
 *     provision-site.sh `cmd_create_vhost`), dolayısıyla git de oraya klonlanır.
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
