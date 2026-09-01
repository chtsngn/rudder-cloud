/**
 * Bir sitenin gerçek dosyalarının sunucuda nerede yaşadığını çözer. Git pull
 * ve restart mantığının ikisi de bunu kullanır, tek bir yerde tutarlı olsun
 * diye — provision-site.sh'ın kendi konvansiyonlarıyla birebir eşleşmeli:
 *   - STATIC/PHP/WORDPRESS: nginx `root` = `<siteRoot>/public` (bkz.
 *     provision-site.sh `cmd_create_vhost`), dolayısıyla git de oraya klonlanır.
 *   - NODEJS/PYTHON: systemd `WorkingDirectory` = `<workingDir>` (siteRoot'un
 *     kendisi, `/public` eki YOK — bkz. `cmd_create_service`).
 *   - REVERSE_PROXY: yerel dosya yok, git pull/restart bu tipte anlamsız.
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

/** Sitenin gerçek dosyalarının bulunduğu mutlak dizin, ya da REVERSE_PROXY için `null`. */
export function resolveSiteWorkdir(site: SiteLike): string | null {
  switch (site.type) {
    case "STATIC":
    case "PHP":
    case "WORDPRESS": {
      const siteRoot = cfgString(site.config, "siteRoot") ?? defaultSiteRoot(site.domain)
      return `${siteRoot}/public`
    }
    case "NODEJS":
    case "PYTHON": {
      return cfgString(site.config, "workingDir") ?? defaultSiteRoot(site.domain)
    }
    default:
      return null
  }
}
