/**
 * Panel içi güncelleme ("Şimdi Güncelle") — Next.js tarafı yardımcıları.
 *
 * Asıl iş `scripts/self-update.sh` içinde, root olarak ve panel.service'den
 * BAĞIMSIZ bir geçici systemd unit'inde yapılır (neden böyle olduğu o
 * betiğin başında ayrıntılı anlatılıyor). Burada yalnızca:
 *   - kaynak klonun (gerçek git deposunun) yeri çözülür,
 *   - hedef etiket doğrulanır (betik de bağımsız olarak tekrar doğrular),
 *   - betiğin bıraktığı status.json + log dosyası okunur (canlı ilerleme).
 *
 * KAYNAK KLON ≠ PANEL_DIR: panel `/opt/sunucu-paneli` içinde çalışır; bu
 * dizin install.sh'ın rsync kopyasıdır ve `.git` içermez. `git fetch`'i
 * `process.cwd()`'de deneyen eski güncelleyici bu yüzden "not a git
 * repository" ile düşüyordu.
 */
import { execFile } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

/** bootstrap.sh'ın klonladığı varsayılan yer (SRC_DIR). */
export const DEFAULT_SOURCE_DIR = "/opt/sunucu-paneli-src"
/** self-update.sh'ın STATE_DIR/LOG_FILE/STATUS_FILE sabitleriyle aynı olmalı. */
export const UPDATE_STATE_DIR = "/var/log/panel-update"
export const UPDATE_LOG_FILE = path.join(UPDATE_STATE_DIR, "update.log")
export const UPDATE_STATUS_FILE = path.join(UPDATE_STATE_DIR, "status.json")
/** systemd unit adı — self-update.sh UNIT_NAME ile aynı. */
export const UPDATE_UNIT_NAME = "panel-self-update"

/**
 * Betik panel koduyla birlikte dağıtılır (install.sh `panel/` → PANEL_DIR
 * rsync'i `scripts/`'i de kopyalar). cwd üretimde PANEL_DIR (systemd
 * WorkingDirectory), geliştirmede `panel/` — ikisinde de `scripts/` göreli.
 */
export const SELF_UPDATE_SCRIPT =
  process.env.SELF_UPDATE_SCRIPT_PATH ?? path.resolve(process.cwd(), "scripts", "self-update.sh")

export type UpdateRunState = "idle" | "running" | "success" | "failed"

export interface UpdateStatus {
  state: UpdateRunState
  ref: string | null
  sourceDir: string | null
  startedAt: string | null
  finishedAt: string | null
  message: string | null
  /** Log dosyasının son satırları (ANSI renk kodları temizlenmiş). */
  log: string
}

const REF_RE = /^(latest|v?\d+\.\d+\.\d+([.-][0-9A-Za-z.-]+)?)$/

export function isValidUpdateRef(ref: string): boolean {
  return REF_RE.test(ref)
}

function isGitRepo(dir: string): boolean {
  try {
    return fs.existsSync(path.join(dir, ".git"))
  } catch {
    return false
  }
}

/**
 * Kaynak klonun yerini çözer. Öncelik:
 *  1) `PANEL_SRC_DIR` (.env — install.sh her çalıştırmada yazar; root'a ait
 *     olup panel kullanıcısının stat edemeyeceği bir dizin olabilir, bu
 *     yüzden burada varlığı KONTROL EDİLMEZ, betik root olarak doğrular),
 *  2) bootstrap.sh varsayılanı `/opt/sunucu-paneli-src`,
 *  3) cwd'den yukarı yürüyerek bulunan ilk `.git` (yerel geliştirme).
 * Hiçbiri yoksa null — çağıran anlaşılır bir hata döndürür.
 */
export function resolveSourceDir(): string | null {
  const fromEnv = process.env.PANEL_SRC_DIR?.trim()
  if (fromEnv) return fromEnv

  if (isGitRepo(DEFAULT_SOURCE_DIR)) return DEFAULT_SOURCE_DIR

  let curr = process.cwd()
  while (curr && curr !== path.dirname(curr)) {
    if (isGitRepo(curr)) return curr
    curr = path.dirname(curr)
  }
  return null
}

const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "")
}

const LOG_TAIL_BYTES = 32 * 1024
const LOG_TAIL_LINES = 200

async function readLogTail(): Promise<string> {
  let handle: fs.promises.FileHandle | null = null
  try {
    handle = await fs.promises.open(UPDATE_LOG_FILE, "r")
    const { size } = await handle.stat()
    const start = Math.max(0, size - LOG_TAIL_BYTES)
    const length = size - start
    if (length <= 0) return ""
    const buf = Buffer.alloc(length)
    await handle.read(buf, 0, length, start)
    const lines = stripAnsi(buf.toString("utf8")).split("\n")
    // Baştan kesilmiş yarım satırı at (dosyanın ortasından başladıysak).
    if (start > 0 && lines.length > 1) lines.shift()
    return lines.slice(-LOG_TAIL_LINES).join("\n").trimEnd()
  } catch {
    return ""
  } finally {
    await handle?.close().catch(() => {})
  }
}

export async function readUpdateStatus(): Promise<UpdateStatus> {
  let parsed: Partial<UpdateStatus> = {}
  try {
    const raw = await fs.promises.readFile(UPDATE_STATUS_FILE, "utf8")
    parsed = JSON.parse(raw)
  } catch {
    return {
      state: "idle",
      ref: null,
      sourceDir: null,
      startedAt: null,
      finishedAt: null,
      message: null,
      log: "",
    }
  }

  const state: UpdateRunState =
    parsed.state === "running" || parsed.state === "success" || parsed.state === "failed"
      ? parsed.state
      : "idle"

  return {
    state,
    ref: typeof parsed.ref === "string" ? parsed.ref : null,
    sourceDir: typeof parsed.sourceDir === "string" ? parsed.sourceDir : null,
    startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : null,
    finishedAt: typeof parsed.finishedAt === "string" ? parsed.finishedAt : null,
    message: typeof parsed.message === "string" ? parsed.message : null,
    log: await readLogTail(),
  }
}

/**
 * Güncelleme unit'i gerçekten çalışıyor mu? status.json 'running' derken
 * unit ölmüş olabilir (örn. sunucu yeniden başladı) — arayüz sonsuza kadar
 * beklemesin diye ikisi birlikte değerlendirilir. `systemctl is-active`
 * yetkisiz kullanıcı için de çalışır (salt okuma sorgusu).
 */
export async function isUpdateUnitActive(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("systemctl", ["is-active", UPDATE_UNIT_NAME], {
      timeout: 5000,
    })
    return stdout.trim() === "active" || stdout.trim() === "activating"
  } catch {
    return false
  }
}

export class SelfUpdateStartError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
    this.name = "SelfUpdateStartError"
  }
}

function extractStderr(error: unknown): string {
  const err = error as NodeJS.ErrnoException & { stderr?: string | Buffer; code?: number | string }
  const stderr = err.stderr?.toString().trim() ?? ""
  return stripAnsi(stderr || err.message || "Bilinmeyen hata.")
}

/**
 * Güncellemeyi başlatır: `sudo -n /bin/bash scripts/self-update.sh --start
 * <srcDir> <ref>`. Betik doğrulamaları yapıp işi systemd-run'a devreder ve
 * hemen döner; ilerleme `readUpdateStatus()` ile izlenir.
 */
export async function startSelfUpdate(sourceDir: string, ref: string): Promise<void> {
  if (!isValidUpdateRef(ref)) {
    throw new SelfUpdateStartError(`Geçersiz sürüm etiketi: ${ref}`, 400)
  }
  try {
    await execFileAsync(
      "sudo",
      ["-n", "/bin/bash", SELF_UPDATE_SCRIPT, "--start", sourceDir, ref],
      { timeout: 30_000 }
    )
  } catch (error) {
    const exitCode = (error as { code?: unknown }).code
    const detail = extractStderr(error)
    if (exitCode === 3) {
      throw new SelfUpdateStartError("Bir güncelleme zaten çalışıyor.", 409)
    }
    if (/a password is required|sudo:/i.test(detail)) {
      throw new SelfUpdateStartError(
        `Güncelleyici root yetkisiyle başlatılamadı (sudoers izni eksik/bozuk olabilir — sunucuda 'sudo bash doctor.sh' ile onarılabilir). Ayrıntı: ${detail}`,
        500
      )
    }
    throw new SelfUpdateStartError(detail, 500)
  }
}
