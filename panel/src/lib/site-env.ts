/**
 * `.env` dosyalarını otomatik tespit + "örnekten tek tuşla kopya" özelliği
 * (Aşama C). Genel `site-fs.ts` katmanının özel bir kullanımı — kendi ayrı
 * dosya-okuma/yazma mantığı yok, yalnızca hangi dosyaların var olduğunu
 * tespit edip `.env.example`/`.env.sample`'dan `.env`'e kopyalıyor. Gerçek
 * düzenleme genel dosya içerik endpoint'leri (`/files/content`) üzerinden.
 *
 * Yalnızca site kökünün BİRİNCİ SEVİYESİNE bakar (alt dizinlerdeki .env'ler
 * kapsam dışı — çoğu framework kök dizinde tutar, ve derin tarama site
 * ağacının tamamını gezmeyi gerektirir ki bu, dosya yöneticisinin kendisiyle
 * zaten yapılabilir).
 */
import { promises as fs } from "node:fs"
import path from "node:path"

import { resolveSitePath, SiteFsError, statEntry, type SiteEntry } from "@/lib/site-fs"
import type { SiteLike } from "@/lib/site-paths"

const ENV_FILE_RE = /^\.env(\.[A-Za-z0-9_.-]+)?$/
const EXAMPLE_NAMES = [".env.example", ".env.sample"]

export interface EnvOverview {
  /** Site kökünde bulunan mevcut `.env*` dosyaları (`.env.example`/`.env.sample` dahil). */
  files: SiteEntry[]
  /** `.env` yoksa ve bir örnek varsa, o örneğin adı — yoksa `null`. */
  availableExample: string | null
}

export async function getEnvOverview(site: SiteLike): Promise<EnvOverview> {
  const { absPath: rootAbs } = await resolveSitePath(site, "")

  let names: string[]
  try {
    names = await fs.readdir(rootAbs)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "ENOENT") throw new SiteFsError("Site dizini bulunamadı.", 404)
    if (code === "EACCES" || code === "EPERM") throw new SiteFsError("Site dizinine erişim izni yok.", 403)
    throw new SiteFsError("Site dizini okunamadı.", 500)
  }

  const envNames = names.filter((n) => ENV_FILE_RE.test(n)).sort((a, b) => a.localeCompare(b))
  const files = await Promise.all(envNames.map((n) => statEntry(site, n)))

  const hasBaseEnv = envNames.includes(".env")
  const example = EXAMPLE_NAMES.find((n) => envNames.includes(n))
  const availableExample = !hasBaseEnv && example ? example : null

  return { files: files.filter((f) => f.type === "file"), availableExample }
}

/** `.env.example`/`.env.sample` içeriğini `.env`'e kopyalar. `.env` zaten varsa reddeder (üzerine yazmaz). */
export async function copyEnvFromExample(site: SiteLike, fromName: string): Promise<SiteEntry> {
  if (!EXAMPLE_NAMES.includes(fromName)) {
    throw new SiteFsError("Geçersiz örnek dosya adı.", 400)
  }

  const { absPath: rootAbs } = await resolveSitePath(site, "")
  const sourceAbs = path.join(rootAbs, fromName)
  const targetAbs = path.join(rootAbs, ".env")

  try {
    await fs.access(targetAbs)
    throw new SiteFsError(".env dosyası zaten var — üzerine yazılmıyor, doğrudan düzenleyin.", 409)
  } catch (err) {
    if (err instanceof SiteFsError) throw err
    // ENOENT bekleniyor (yani .env yok) — devam
  }

  try {
    await fs.copyFile(sourceAbs, targetAbs, fs.constants.COPYFILE_EXCL)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "ENOENT") throw new SiteFsError(`${fromName} bulunamadı.`, 404)
    if (code === "EEXIST") throw new SiteFsError(".env dosyası zaten var.", 409)
    if (code === "EACCES" || code === "EPERM") throw new SiteFsError("Kopyalama izni yok.", 403)
    throw new SiteFsError("Kopyalanamadı.", 500)
  }

  return statEntry(site, ".env")
}
