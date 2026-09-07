/**
 * GitHub Actions SSH key yönetimi (Aşama E).
 *
 * Mevcut `scripts/github-actions-key.sh` interaktif (okuma/yazma promptları)
 * olduğu için panelden DOĞRUDAN çalıştırılamıyor — mantığı burada API olarak
 * yeniden yazıldı: ayrı bir ed25519 anahtar üretilir, public key `panel`
 * kullanıcısının KENDİ `~/.ssh/authorized_keys` dosyasına eklenir (GitHub
 * Actions bu anahtarla sunucuya `panel` kullanıcısı olarak SSH ile
 * bağlanabilsin diye — script'in "PUBLIC key -> authorized_keys" adımı).
 *
 * (Eskiden burada bir de "Deploy key" (git clone/pull için, panelin KENDİ
 * pull mekanizmasının repo'ya SSH ile erişmesi) yönetimi vardı — GitHub App
 * entegrasyonu (bkz. github-app.ts) bunu tamamen yerine aldı: pull'lar artık
 * kısa ömürlü installation token ile kimlik doğruluyor, ayrı bir SSH
 * anahtarına hiç gerek kalmadı. Bu yüzden 2026-09-07'de kaldırıldı — Actions
 * key (bu dosyanın geri kalanı) tamamen AYRI bir amaca hizmet ediyor: GitHub
 * Actions'ın KENDİ CI/CD akışının bu sunucuya SSH ile bağlanabilmesi, GitHub
 * App'in yerine geçtiği "panel repo'yu çeksin" akışıyla ilgisi yok.)
 *
 * GÜVENLİK: PRIVATE KEY hiçbir zaman veritabanına yazılmaz. Diskte yalnızca
 * `panel` kullanıcısının kendi ev dizininde 0600 izinle durur. Private key,
 * GitHub Actions secret'ına yapıştırılabilsin diye yalnızca ÜRETİM ANINDAKİ
 * API yanıtında bir kez döner — sonradan hiçbir route bunu tekrar okuyup
 * dönmez (bkz. actions-key/route.ts GET, yalnızca public alanları döner).
 *
 * Yeni bir sudo izni gerektirmiyor: yalnızca `panel` kullanıcısının zaten
 * sahip olduğu kendi ev dizini (`~/.ssh`) içinde çalışır — provizyon
 * script'lerine veya sudoers'a hiçbir dokunuş yok.
 */
import { execFile } from "node:child_process"
import { access, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { constants as fsConstants } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

const SSH_DIR = join(homedir(), ".ssh")
const AUTHORIZED_KEYS = join(SSH_DIR, "authorized_keys")

export class GithubKeyError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = "GithubKeyError"
    this.status = status
  }
}

function detailFromError(error: unknown, fallback: string): string {
  const err = error as NodeJS.ErrnoException & { stderr?: string }
  const detail = err.stderr?.toString().trim() || err.message
  return detail || fallback
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

async function ensureSshDir(): Promise<void> {
  await mkdir(SSH_DIR, { recursive: true, mode: 0o700 })
  await chmod(SSH_DIR, 0o700)
}

async function fingerprintOf(pubKeyPath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("ssh-keygen", ["-lf", pubKeyPath])
    return stdout.trim()
  } catch {
    return ""
  }
}

/** `example.com` -> `example_com` — anahtar/host-alias adlarında güvenli. */
export function slugifyDomain(domain: string): string {
  const slug = domain
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return slug || "site"
}

export function actionsKeyNameFor(domain: string): string {
  return `site_${slugifyDomain(domain)}_actions`
}

async function generateEd25519KeyPair(keyFile: string, comment: string): Promise<void> {
  try {
    // `timeout` kritik: `pathExists` kontrolü ile bu çağrı arasında teorik bir
    // yarış durumu (aynı anda iki "Oluştur" isteği) `ssh-keygen`'i dosya zaten
    // varken interaktif "Overwrite (y/n)?" promptuyla karşı karşıya bırakabilir
    // — stdin'e hiçbir şey yazılmadığı için bu istek süresiz asılı kalırdı.
    // Zaman aşımı bunu sınırlı, açık bir hataya çevirir (script'in kendisi
    // interaktif çalıştığı için bu riski taşımıyordu).
    await execFileAsync(
      "ssh-keygen",
      ["-t", "ed25519", "-C", comment, "-f", keyFile, "-N", ""],
      { timeout: 15_000 }
    )
  } catch (error) {
    throw new GithubKeyError(detailFromError(error, "Anahtar üretilemedi."), 500)
  }
  await chmod(keyFile, 0o600)
  await chmod(`${keyFile}.pub`, 0o644)
}

// ---------------------------------------------------------------------------
// Actions key (GitHub Actions'ın sunucuya SSH ile bağlanması için) —
// authorized_keys'e ekler.
// ---------------------------------------------------------------------------

export interface ActionsKeyWithPrivate {
  keyName: string
  publicKey: string
  privateKey: string
  fingerprint: string
  createdAt: string
}

async function addAuthorizedKey(publicKeyLine: string): Promise<void> {
  await writeFile(AUTHORIZED_KEYS, "", { flag: "a" })
  await chmod(AUTHORIZED_KEYS, 0o600)
  const existing = await readFile(AUTHORIZED_KEYS, "utf8").catch(() => "")
  const target = publicKeyLine.trim()
  if (existing.split("\n").some((line) => line.trim() === target)) return // zaten var

  const needsLeadingNewline = existing.length > 0 && !existing.endsWith("\n")
  await writeFile(AUTHORIZED_KEYS, (needsLeadingNewline ? "\n" : "") + target + "\n", { flag: "a" })
  await chmod(AUTHORIZED_KEYS, 0o600)
}

async function removeAuthorizedKey(publicKeyLine: string): Promise<void> {
  const existing = await readFile(AUTHORIZED_KEYS, "utf8").catch(() => "")
  if (!existing) return
  const target = publicKeyLine.trim()
  const lines = existing.split("\n").filter((line) => line.trim() !== target)
  const updated = lines.join("\n")
  if (updated !== existing) {
    await writeFile(AUTHORIZED_KEYS, updated)
    await chmod(AUTHORIZED_KEYS, 0o600)
  }
}

export async function generateActionsKey(domain: string): Promise<ActionsKeyWithPrivate> {
  await ensureSshDir()
  const keyName = actionsKeyNameFor(domain)
  const keyFile = join(SSH_DIR, keyName)
  const pubFile = `${keyFile}.pub`

  if (await pathExists(keyFile)) {
    throw new GithubKeyError(
      "Bu site için Actions anahtarı zaten mevcut. Önce mevcut anahtarı silin.",
      409
    )
  }

  await generateEd25519KeyPair(keyFile, keyName)

  const publicKey = (await readFile(pubFile, "utf8")).trim()
  const privateKey = await readFile(keyFile, "utf8")
  const fingerprint = await fingerprintOf(pubFile)

  await addAuthorizedKey(publicKey)

  return { keyName, publicKey, privateKey, fingerprint, createdAt: new Date().toISOString() }
}

export async function removeActionsKey(domain: string): Promise<void> {
  const keyName = actionsKeyNameFor(domain)
  const keyFile = join(SSH_DIR, keyName)
  const pubFile = `${keyFile}.pub`

  const publicKey = await readFile(pubFile, "utf8").catch(() => null)
  if (publicKey) {
    await removeAuthorizedKey(publicKey)
  }
  await rm(keyFile, { force: true })
  await rm(pubFile, { force: true })
}

// ---------------------------------------------------------------------------
// GitHub CLI ile otomatik secret ekleme (opsiyonel — script'in "gh CLI
// bulundu, otomatik ekleyeyim mi?" adımının karşılığı). `gh` kurulu değilse
// veya `panel` kullanıcısı için authenticate edilmemişse sessizce
// `attempted: false` döner; arayüz bu durumda private key'i elle
// kopyalanabilecek şekilde gösterir.
// ---------------------------------------------------------------------------

export interface GhSecretResult {
  attempted: boolean
  ok: boolean
  message: string
}

export function parseOwnerRepoFromUrl(url: string): string | null {
  const httpsMatch = url.match(/^https:\/\/[^/]+\/([^/]+\/[^/]+?)(\.git)?\/?$/)
  if (httpsMatch) return httpsMatch[1]
  const sshMatch = url.match(/^git@[^:]+:([^/]+\/[^/]+?)(\.git)?$/)
  if (sshMatch) return sshMatch[1]
  return null
}

const REPO_SLUG_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/

export async function tryAutoAddGithubSecret(
  repoSlug: string,
  privateKey: string
): Promise<GhSecretResult> {
  if (!REPO_SLUG_RE.test(repoSlug)) {
    return { attempted: false, ok: false, message: "Geçersiz repo adı (owner/repo bekleniyor)." }
  }

  try {
    await execFileAsync("which", ["gh"])
  } catch {
    return { attempted: false, ok: false, message: "gh CLI sunucuda kurulu değil." }
  }
  try {
    await execFileAsync("gh", ["auth", "status"], { timeout: 10_000 })
  } catch {
    return {
      attempted: false,
      ok: false,
      message: "gh CLI oturum açmamış (sunucuda `gh auth login` gerekiyor).",
    }
  }

  return new Promise((resolve) => {
    const child = execFile(
      "gh",
      ["secret", "set", "SSH_PRIVATE_KEY", "-R", repoSlug],
      { timeout: 20_000 },
      (error, _stdout, stderr) => {
        if (error) {
          resolve({ attempted: true, ok: false, message: stderr.trim() || error.message })
        } else {
          resolve({
            attempted: true,
            ok: true,
            message: `Secret eklendi: SSH_PRIVATE_KEY -> ${repoSlug}`,
          })
        }
      }
    )
    child.stdin?.write(privateKey)
    child.stdin?.end()
  })
}
