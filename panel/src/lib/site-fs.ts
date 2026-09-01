/**
 * Dosya yöneticisi (Aşama C) için paylaşılan, güvenli dosya-sistemi katmanı.
 * TÜM işlemler tek bir sitenin kendi kök dizinine (`resolveSiteWorkdir`)
 * KAPSANIR — sunucu genelinde serbest dosya erişimi hiçbir zaman mümkün
 * değildir. Her çağrı `resolveSitePath` üzerinden geçmek ZORUNDADIR; o da
 * hem string-düzeyinde (`..` vb.) hem de `fs.realpath` ile (symlink kaçışı)
 * hedefin site kökü İÇİNDE kaldığını doğrular.
 *
 * Bu modül panel süreci (`panel` kullanıcısı) altında, sudo OLMADAN çalışır
 * — bkz. git.ts/restart.ts'teki aynı kısıt. STATIC/PHP/WORDPRESS siteleri
 * isteğe bağlı "dedicated linux user" ile provision edilmiş olabilir (bkz.
 * provision-site.sh `ensure_linux_user`); böyle bir sitede panelin yazma
 * izni olmayabilir — bu durumda işlemler net bir `SiteFsError` ile
 * (ENOACCES/EPERM) başarısız olur, sessizce yutulmaz.
 */
import archiver from "archiver"
import { createReadStream } from "node:fs"
import { promises as fs, type Dirent } from "node:fs"
import path from "node:path"
import type { Readable } from "node:stream"

import { resolveSiteWorkdir, type SiteLike } from "@/lib/site-paths"

export class SiteFsError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = "SiteFsError"
    this.status = status
  }
}

/** Metin olarak okunabilecek/düzenlenebilecek azami dosya boyutu (Monaco için makul bir sınır). */
export const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024 // 5MB
/** Tek bir yükleme isteğinde kabul edilen azami dosya boyutu. */
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024 // 200MB

export interface SiteEntry {
  name: string
  /** Site köküne göre, `/` ile ayrılmış göreli yol (baştaki `/` olmadan). */
  path: string
  type: "file" | "dir" | "other"
  size: number
  modifiedAt: string
}

function toRelative(root: string, absPath: string): string {
  const rel = path.relative(root, absPath).split(path.sep).join("/")
  return rel
}

/**
 * Kullanıcının verdiği göreli yolu site kökü altında güvenli bir mutlak yola
 * çözer. Hedef henüz var olmayabilir (create işlemleri) — bu durumda en
 * yakın var olan ata dizin `fs.realpath` ile doğrulanır (symlink kontrolü).
 */
export async function resolveSitePath(
  site: SiteLike,
  relativePath: string
): Promise<{ absPath: string; root: string }> {
  const root = resolveSiteWorkdir(site)
  if (!root) {
    throw new SiteFsError("Bu site türü için dosya yönetimi desteklenmiyor.", 400)
  }

  const rawRel = (relativePath ?? "").replace(/\\/g, "/").replace(/^\/+/, "")
  if (rawRel.includes("\0")) {
    throw new SiteFsError("Geçersiz yol.", 400)
  }

  const normalized = path.normalize(path.join(root, rawRel))
  if (normalized !== root && !normalized.startsWith(root + path.sep)) {
    throw new SiteFsError("Site dizini dışına çıkılamaz.", 400)
  }

  let realRoot: string
  try {
    realRoot = await fs.realpath(root)
  } catch {
    throw new SiteFsError(
      "Site dizini sunucuda bulunamadı (henüz provision edilmemiş olabilir).",
      404
    )
  }

  // En yakın var olan ata dizini bulup realpath ile doğrula — symlink'in site
  // kökü dışına çıkmadığından emin olmak için.
  let checkDir = normalized
  while (true) {
    try {
      const real = await fs.realpath(checkDir)
      if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
        throw new SiteFsError("Site dizini dışına çıkılamaz (symlink).", 400)
      }
      break
    } catch (err) {
      if (err instanceof SiteFsError) throw err
      const parent = path.dirname(checkDir)
      if (parent === checkDir) break
      checkDir = parent
    }
  }

  return { absPath: normalized, root: realRoot }
}

function entryType(dirent: Dirent): SiteEntry["type"] {
  if (dirent.isDirectory()) return "dir"
  if (dirent.isFile()) return "file"
  return "other"
}

export async function listDirectory(site: SiteLike, relativePath: string): Promise<SiteEntry[]> {
  const { absPath, root } = await resolveSitePath(site, relativePath)

  let dirents: Dirent[]
  try {
    dirents = await fs.readdir(absPath, { withFileTypes: true })
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "ENOENT") throw new SiteFsError("Dizin bulunamadı.", 404)
    if (code === "ENOTDIR") throw new SiteFsError("Bu bir dizin değil.", 400)
    if (code === "EACCES" || code === "EPERM") {
      throw new SiteFsError("Bu dizine erişim izni yok (panel kullanıcısı sahibi değil).", 403)
    }
    throw new SiteFsError("Dizin okunamadı.", 500)
  }

  const entries = await Promise.all(
    dirents
      .filter((d) => !d.isSymbolicLink()) // symlink içeriğini listelemiyoruz — kaçış yüzeyini küçük tutar
      .map(async (d): Promise<SiteEntry> => {
        const full = path.join(absPath, d.name)
        let size = 0
        let modifiedAt = new Date(0).toISOString()
        try {
          const st = await fs.stat(full)
          size = st.size
          modifiedAt = st.mtime.toISOString()
        } catch {
          // stat başarısız olursa (örn. bozuk izin) varsayılanlarla devam et
        }
        return { name: d.name, path: toRelative(root, full), type: entryType(d), size, modifiedAt }
      })
  )

  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1
    return a.name.localeCompare(b.name, "tr")
  })

  return entries
}

export async function statEntry(site: SiteLike, relativePath: string): Promise<SiteEntry> {
  const { absPath, root } = await resolveSitePath(site, relativePath)
  let st
  try {
    st = await fs.stat(absPath)
  } catch {
    throw new SiteFsError("Bulunamadı.", 404)
  }
  return {
    name: path.basename(absPath),
    path: toRelative(root, absPath),
    type: st.isDirectory() ? "dir" : st.isFile() ? "file" : "other",
    size: st.size,
    modifiedAt: st.mtime.toISOString(),
  }
}

/** Kaba bir "bu ikili (binary) bir dosya mı" tespiti — ilk 8000 bayt içinde NUL var mı bakar. */
function looksBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, 8000)
  return sample.includes(0)
}

export async function readTextFile(site: SiteLike, relativePath: string): Promise<{ content: string; size: number }> {
  const { absPath } = await resolveSitePath(site, relativePath)

  let st
  try {
    st = await fs.stat(absPath)
  } catch {
    throw new SiteFsError("Dosya bulunamadı.", 404)
  }
  if (!st.isFile()) throw new SiteFsError("Bu bir dosya değil.", 400)
  if (st.size > MAX_TEXT_FILE_BYTES) {
    throw new SiteFsError(
      `Dosya çok büyük (${Math.round(st.size / 1024 / 1024)}MB) — düzenleyici yalnızca ${MAX_TEXT_FILE_BYTES / 1024 / 1024}MB'a kadar metin dosyalarını destekliyor.`,
      413
    )
  }

  let buf: Buffer
  try {
    buf = await fs.readFile(absPath)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "EACCES" || code === "EPERM") {
      throw new SiteFsError("Bu dosyaya erişim izni yok.", 403)
    }
    throw new SiteFsError("Dosya okunamadı.", 500)
  }

  if (looksBinary(buf)) {
    throw new SiteFsError("Bu ikili (binary) bir dosya gibi görünüyor — metin düzenleyicide açılamaz.", 415)
  }

  return { content: buf.toString("utf-8"), size: st.size }
}

export async function writeTextFile(site: SiteLike, relativePath: string, content: string): Promise<void> {
  if (Buffer.byteLength(content, "utf-8") > MAX_TEXT_FILE_BYTES) {
    throw new SiteFsError(`İçerik çok büyük (azami ${MAX_TEXT_FILE_BYTES / 1024 / 1024}MB).`, 413)
  }
  const { absPath } = await resolveSitePath(site, relativePath)
  try {
    await fs.writeFile(absPath, content, "utf-8")
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "ENOENT") throw new SiteFsError("Üst dizin bulunamadı.", 404)
    if (code === "EACCES" || code === "EPERM") throw new SiteFsError("Bu dosyaya yazma izni yok.", 403)
    if (code === "EISDIR") throw new SiteFsError("Bu bir dizin, dosya değil.", 400)
    throw new SiteFsError("Dosya yazılamadı.", 500)
  }
}

const SAFE_NAME_RE = /^[^/\\\0]+$/

function assertSafeName(name: string): void {
  if (!name || name === "." || name === ".." || !SAFE_NAME_RE.test(name) || name.length > 255) {
    throw new SiteFsError("Geçersiz dosya/klasör adı.", 400)
  }
}

export async function createFolder(site: SiteLike, parentRelPath: string, name: string): Promise<SiteEntry> {
  assertSafeName(name)
  const { absPath: parentAbs } = await resolveSitePath(site, parentRelPath)
  const target = path.join(parentAbs, name)
  try {
    await fs.mkdir(target)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "EEXIST") throw new SiteFsError("Bu isimde bir dosya/klasör zaten var.", 409)
    if (code === "EACCES" || code === "EPERM") throw new SiteFsError("Klasör oluşturma izni yok.", 403)
    if (code === "ENOENT") throw new SiteFsError("Üst dizin bulunamadı.", 404)
    throw new SiteFsError("Klasör oluşturulamadı.", 500)
  }
  return statEntry(site, toRelative(await realRootOf(site), target))
}

async function realRootOf(site: SiteLike): Promise<string> {
  const root = resolveSiteWorkdir(site)
  if (!root) throw new SiteFsError("Bu site türü için dosya yönetimi desteklenmiyor.", 400)
  try {
    return await fs.realpath(root)
  } catch {
    throw new SiteFsError("Site dizini sunucuda bulunamadı.", 404)
  }
}

export async function createFile(
  site: SiteLike,
  parentRelPath: string,
  name: string,
  content = ""
): Promise<SiteEntry> {
  assertSafeName(name)
  const { absPath: parentAbs } = await resolveSitePath(site, parentRelPath)
  const target = path.join(parentAbs, name)
  try {
    await fs.writeFile(target, content, { flag: "wx" }) // "wx": varsa hata ver, üzerine yazma
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "EEXIST") throw new SiteFsError("Bu isimde bir dosya zaten var.", 409)
    if (code === "EACCES" || code === "EPERM") throw new SiteFsError("Dosya oluşturma izni yok.", 403)
    if (code === "ENOENT") throw new SiteFsError("Üst dizin bulunamadı.", 404)
    throw new SiteFsError("Dosya oluşturulamadı.", 500)
  }
  return statEntry(site, toRelative(await realRootOf(site), target))
}

/** Dosya/klasörü siler (klasörler için özyinelemeli). Site kökünün kendisi silinemez. */
export async function deleteEntry(site: SiteLike, relativePath: string): Promise<void> {
  const { absPath, root } = await resolveSitePath(site, relativePath)
  if (absPath === root) {
    throw new SiteFsError("Site kök dizini silinemez.", 400)
  }
  try {
    await fs.rm(absPath, { recursive: true, force: false })
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "ENOENT") throw new SiteFsError("Bulunamadı.", 404)
    if (code === "EACCES" || code === "EPERM") throw new SiteFsError("Silme izni yok.", 403)
    throw new SiteFsError("Silinemedi.", 500)
  }
}

/** Yükleme hedefi bir dizin olmalı; dosya adı yalnızca basename olarak kabul edilir (yol bileşeni YOK). */
export async function writeUploadedFile(
  site: SiteLike,
  targetDirRelPath: string,
  fileName: string,
  data: Buffer
): Promise<SiteEntry> {
  const baseName = path.basename(fileName)
  assertSafeName(baseName)
  if (data.byteLength > MAX_UPLOAD_BYTES) {
    throw new SiteFsError(`Dosya çok büyük (azami ${MAX_UPLOAD_BYTES / 1024 / 1024}MB).`, 413)
  }
  const { absPath: dirAbs } = await resolveSitePath(site, targetDirRelPath)
  const target = path.join(dirAbs, baseName)
  try {
    await fs.writeFile(target, data)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "EACCES" || code === "EPERM") throw new SiteFsError("Yükleme izni yok.", 403)
    if (code === "ENOENT") throw new SiteFsError("Hedef dizin bulunamadı.", 404)
    if (code === "EISDIR") throw new SiteFsError(`"${baseName}" bir klasörle çakışıyor.`, 409)
    throw new SiteFsError("Dosya yüklenemedi.", 500)
  }
  return statEntry(site, toRelative(await realRootOf(site), target))
}

/** Tek bir dosyanın ham içeriğini indirmek için bir okuma akışı döndürür. */
export async function openReadStream(site: SiteLike, relativePath: string): Promise<{ stream: Readable; size: number; name: string }> {
  const { absPath } = await resolveSitePath(site, relativePath)
  let st
  try {
    st = await fs.stat(absPath)
  } catch {
    throw new SiteFsError("Dosya bulunamadı.", 404)
  }
  if (!st.isFile()) throw new SiteFsError("Bu bir dosya değil — birden fazla öğe seçiliyse zip olarak indirin.", 400)
  return { stream: createReadStream(absPath), size: st.size, name: path.basename(absPath) }
}

/**
 * Birden fazla dosya/klasörü (veya tek bir klasörü) tek bir zip akışı olarak
 * paketler — bellekte tutmadan, `archiver` ile satır satır (streaming).
 */
export async function createZipStream(site: SiteLike, relativePaths: string[]): Promise<Readable> {
  if (relativePaths.length === 0) {
    throw new SiteFsError("İndirilecek öğe seçilmedi.", 400)
  }

  const archive = archiver("zip", { zlib: { level: 6 } })
  archive.on("warning", (err) => console.error("[site-fs] zip uyarısı:", err))
  archive.on("error", (err) => {
    // archiver kendi stream'ine 'error' fırlatır; burada yalnızca logluyoruz —
    // tüketen taraf (Response body) zaten stream hatasını görecek.
    console.error("[site-fs] zip hatası:", err)
  })

  for (const relPath of relativePaths) {
    const { absPath } = await resolveSitePath(site, relPath)
    let st
    try {
      st = await fs.stat(absPath)
    } catch {
      continue // seçimden sonra silinmiş olabilir — sessizce atla
    }
    const name = path.basename(absPath)
    if (st.isDirectory()) {
      archive.directory(absPath, name)
    } else if (st.isFile()) {
      archive.file(absPath, { name })
    }
  }

  void archive.finalize()
  return archive
}
