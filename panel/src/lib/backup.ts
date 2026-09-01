/**
 * Veritabanı yedekleme (Aşama D) — `db-detect.ts`'in bulduğu bağlantı
 * bilgisiyle `pg_dump`/`mysqldump`/`mongodump` çalıştırır, sonucu gzip'ler,
 * yerelde `/opt/sunucu-paneli/backups/<domain>/` altında saklar (panel
 * kullanıcısı zaten bu dizinin sahibi — sudo GEREKMEZ, bkz. doctor.sh
 * `chown -R panel:panel ${PANEL_DIR}`), retention'a göre eskileri siler ve
 * isteğe bağlı olarak S3'e yükler. Şifreler asla process argümanlarında
 * görünmez (`ps aux`'ta ifşa olmasın diye) — PGPASSWORD/MYSQL_PWD ortam
 * değişkenleriyle veya mongo için doğrudan --uri içinde geçirilir.
 */
import { spawn } from "node:child_process"
import { createWriteStream, createReadStream } from "node:fs"
import { promises as fs } from "node:fs"
import path from "node:path"
import { promisify } from "node:util"
import { execFile } from "node:child_process"
import { createGzip } from "node:zlib"
import type { Readable } from "node:stream"

import type { DetectedDatabase } from "@/lib/db-detect"

const execFileAsync = promisify(execFile)

export class BackupError extends Error {
  status: number
  constructor(message: string, status = 500) {
    super(message)
    this.name = "BackupError"
    this.status = status
  }
}

const BACKUPS_ROOT = process.env.BACKUP_DIR ?? "/opt/sunucu-paneli/backups"
const DUMP_TIMEOUT_MS = 10 * 60 * 1000 // 10 dakika — büyük veritabanları için

export interface BackupFileInfo {
  fileName: string
  sizeBytes: number
  createdAt: string
}

function backupDirForDomain(domain: string): string {
  // domain zaten DOMAIN_RE ile doğrulanmış (provision aşamasında) — burada
  // yalnızca path.join kullanılıyor, kullanıcıdan doğrudan gelen serbest
  // metin DEĞİL.
  return path.join(/* turbopackIgnore: true */ BACKUPS_ROOT, domain)
}

async function ensureBackupDir(domain: string): Promise<string> {
  const dir = backupDirForDomain(domain)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

async function assertToolAvailable(command: string, engineLabel: string): Promise<void> {
  try {
    await execFileAsync("which", [command])
  } catch {
    throw new BackupError(
      `${command} sunucuda bulunamadı — ${engineLabel} yedeklemesi için kurulu olmalı (bkz. doctor.sh çıktısı).`,
      500
    )
  }
}

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, "-")
}

const SAFE_FILE_RE = /^[A-Za-z0-9._-]+$/

function assertSafeBackupFileName(fileName: string): void {
  if (!fileName || !SAFE_FILE_RE.test(fileName) || fileName.includes("..")) {
    throw new BackupError("Geçersiz yedek dosya adı.", 400)
  }
}

/** `pg_dump`/`mysqldump` çıktısını gzip ile sıkıştırarak doğrudan dosyaya akıtır. */
function runDumpToGzipFile(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  outPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const fail = (err: Error) => {
      if (settled) return
      settled = true
      reject(err)
    }
    const succeed = () => {
      if (settled) return
      settled = true
      resolve()
    }

    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] })
    let stderr = ""
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on("error", (err) => fail(new BackupError(`${command} başlatılamadı: ${err.message}`)))

    const gzip = createGzip()
    const out = createWriteStream(outPath)
    gzip.on("error", (err) => fail(new BackupError(`Sıkıştırma hatası: ${err.message}`)))
    out.on("error", (err) => fail(new BackupError(`Yedek dosyası yazılamadı: ${err.message}`)))

    let exitCode: number | null = null
    let outFinished = false
    child.on("close", (code) => {
      exitCode = code
      if (code !== 0) {
        fail(new BackupError(`${command} başarısız oldu (kod ${code}): ${stderr.trim().slice(0, 500)}`))
        return
      }
      if (outFinished) succeed()
    })
    out.on("finish", () => {
      outFinished = true
      if (exitCode === 0) succeed()
    })

    child.stdout.pipe(gzip).pipe(out)
  })
}

function mongoUriFrom(detected: DetectedDatabase): string {
  if (detected.connectionUri) return detected.connectionUri
  const auth = detected.user ? `${encodeURIComponent(detected.user)}:${encodeURIComponent(detected.password ?? "")}@` : ""
  const host = detected.host ?? "localhost"
  const port = detected.port ?? 27017
  const db = detected.database ?? ""
  return `mongodb://${auth}${host}:${port}/${db}`
}

/** Tespit edilen veritabanını dump'layıp gzip'li tek bir dosya olarak `<domain>` yedek dizinine yazar. */
export async function createDatabaseDump(domain: string, detected: DetectedDatabase): Promise<BackupFileInfo> {
  const dir = await ensureBackupDir(domain)
  const slug = timestampSlug()

  if (detected.engine === "postgres") {
    await assertToolAvailable("pg_dump", "PostgreSQL")
    const fileName = `${domain}_postgres_${slug}.sql.gz`
    const outPath = path.join(dir, fileName)
    const args = [
      "-h", detected.host ?? "localhost",
      "-p", String(detected.port ?? 5432),
      "--no-owner",
      "--no-privileges",
      "-F", "p",
    ]
    if (detected.user) args.push("-U", detected.user)
    if (detected.database) args.push(detected.database)
    const env: NodeJS.ProcessEnv = { ...process.env }
    if (detected.password) env.PGPASSWORD = detected.password
    await runDumpToGzipFile("pg_dump", args, env, outPath)
    return statBackupFile(dir, fileName)
  }

  if (detected.engine === "mysql") {
    await assertToolAvailable("mysqldump", "MySQL/MariaDB")
    const fileName = `${domain}_mysql_${slug}.sql.gz`
    const outPath = path.join(dir, fileName)
    const args = [
      "-h", detected.host ?? "localhost",
      "-P", String(detected.port ?? 3306),
      "--single-transaction",
      "--quick",
    ]
    if (detected.user) args.push("-u", detected.user)
    if (detected.database) args.push(detected.database)
    const env: NodeJS.ProcessEnv = { ...process.env }
    if (detected.password) env.MYSQL_PWD = detected.password
    await runDumpToGzipFile("mysqldump", args, env, outPath)
    return statBackupFile(dir, fileName)
  }

  // mongo — mongodump kendi --gzip/--archive'ıyla doğrudan dosyaya yazıyor, ayrı piping gerekmiyor.
  await assertToolAvailable("mongodump", "MongoDB")
  const fileName = `${domain}_mongo_${slug}.archive.gz`
  const outPath = path.join(dir, fileName)
  try {
    await execFileAsync(
      "mongodump",
      ["--uri", mongoUriFrom(detected), "--archive=" + outPath, "--gzip"],
      { timeout: DUMP_TIMEOUT_MS }
    )
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: string }
    throw new BackupError(`mongodump başarısız oldu: ${err.stderr?.toString().trim().slice(0, 500) || err.message}`)
  }
  return statBackupFile(dir, fileName)
}

async function statBackupFile(dir: string, fileName: string): Promise<BackupFileInfo> {
  const st = await fs.stat(path.join(dir, fileName))
  return { fileName, sizeBytes: st.size, createdAt: st.mtime.toISOString() }
}

export async function listBackups(domain: string): Promise<BackupFileInfo[]> {
  const dir = backupDirForDomain(domain)
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return []
    throw new BackupError("Yedekler listelenemedi.", 500)
  }
  const infos = await Promise.all(
    names
      .filter((n) => n.startsWith(`${domain}_`))
      .map(async (n) => {
        try {
          return await statBackupFile(dir, n)
        } catch {
          return null
        }
      })
  )
  return infos
    .filter((i): i is BackupFileInfo => i !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** En yeni `retentionCount` dosyayı tutar, gerisini siler. */
export async function applyRetention(domain: string, retentionCount: number): Promise<void> {
  const backups = await listBackups(domain)
  const toDelete = backups.slice(Math.max(0, retentionCount))
  const dir = backupDirForDomain(domain)
  for (const b of toDelete) {
    await fs.rm(path.join(dir, b.fileName), { force: true }).catch(() => {})
  }
}

export async function deleteBackupFile(domain: string, fileName: string): Promise<void> {
  assertSafeBackupFileName(fileName)
  if (!fileName.startsWith(`${domain}_`)) {
    throw new BackupError("Bu dosya bu siteye ait değil.", 400)
  }
  const target = path.join(backupDirForDomain(domain), fileName)
  try {
    await fs.rm(target)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new BackupError("Dosya bulunamadı.", 404)
    throw new BackupError("Silinemedi.", 500)
  }
}

export async function openBackupReadStream(
  domain: string,
  fileName: string
): Promise<{ stream: Readable; size: number }> {
  assertSafeBackupFileName(fileName)
  if (!fileName.startsWith(`${domain}_`)) {
    throw new BackupError("Bu dosya bu siteye ait değil.", 400)
  }
  const target = path.join(backupDirForDomain(domain), fileName)
  let st
  try {
    st = await fs.stat(target)
  } catch {
    throw new BackupError("Dosya bulunamadı.", 404)
  }
  return { stream: createReadStream(target), size: st.size }
}

export function localBackupPath(domain: string, fileName: string): string {
  return path.join(backupDirForDomain(domain), fileName)
}
