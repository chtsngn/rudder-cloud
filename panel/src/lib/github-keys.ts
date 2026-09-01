/**
 * GitHub deploy key ve GitHub Actions SSH key yönetimi (Aşama E).
 *
 * Mevcut `scripts/github-deploy-key.sh` / `scripts/github-actions-key.sh`
 * interaktif (okuma/yazma promptları) olduğu için panelden DOĞRUDAN
 * çalıştırılamıyor — mantıkları burada API olarak yeniden yazıldı:
 *
 *   - Deploy key: `panel` kullanıcısının kendi `~/.ssh` dizininde ed25519
 *     anahtar üretilir (`site_<slug>_deploy`), `~/.ssh/config`'e idempotent
 *     bir `Host github.com-site_<slug>_deploy` alias'ı eklenir (script'teki
 *     "Host alias" adımının birebir aynısı). Public key GitHub repo'nun
 *     Deploy Keys ayarına ELLE eklensin diye döndürülür.
 *   - Actions key: ayrı bir ed25519 anahtar üretilir, public key `panel`
 *     kullanıcısının KENDİ `~/.ssh/authorized_keys` dosyasına eklenir
 *     (GitHub Actions bu anahtarla sunucuya `panel` kullanıcısı olarak SSH
 *     ile bağlanabilsin diye — script'in "PUBLIC key -> authorized_keys"
 *     adımı).
 *
 * GÜVENLİK: PRIVATE KEY hiçbir zaman veritabanına yazılmaz. Diskte yalnızca
 * `panel` kullanıcısının kendi ev dizininde 0600 izinle durur. Actions key
 * için private key, GitHub Actions secret'ına yapıştırılabilsin diye
 * yalnızca ÜRETİM ANINDAKİ API yanıtında bir kez döner — sonradan hiçbir
 * route bunu tekrar okuyup dönmez (bkz. actions-key/route.ts GET, yalnızca
 * public alanları döner).
 *
 * Hiçbiri yeni bir sudo izni gerektirmiyor: ikisi de yalnızca `panel`
 * kullanıcısının zaten sahip olduğu kendi ev dizini (`~/.ssh`) içinde
 * çalışır — provizyon script'lerine veya sudoers'a hiçbir dokunuş yok.
 */
import { execFile } from "node:child_process"
import { access, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { constants as fsConstants } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

const SSH_DIR = join(homedir(), ".ssh")
const SSH_CONFIG = join(SSH_DIR, "config")
const AUTHORIZED_KEYS = join(SSH_DIR, "authorized_keys")
const KNOWN_HOSTS = join(SSH_DIR, "known_hosts")

export class GithubKeyError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = "GithubKeyError"
    this.status = status
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
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

export function deployKeyNameFor(domain: string): string {
  return `site_${slugifyDomain(domain)}_deploy`
}

export function actionsKeyNameFor(domain: string): string {
  return `site_${slugifyDomain(domain)}_actions`
}

export function deployHostAlias(keyName: string): string {
  return `github.com-${keyName}`
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
// Deploy key (git clone/pull için) — SSH config'e Host alias ekler.
// ---------------------------------------------------------------------------

export interface DeployKeyInfo {
  keyName: string
  hostAlias: string
  publicKey: string
  fingerprint: string
  createdAt: string
}

async function ensureHostAlias(hostAlias: string, keyFile: string): Promise<void> {
  await writeFile(SSH_CONFIG, "", { flag: "a" })
  await chmod(SSH_CONFIG, 0o600)
  const existing = await readFile(SSH_CONFIG, "utf8").catch(() => "")

  const hostLineRe = new RegExp(`^[ \\t]*Host[ \\t]+${escapeRegExp(hostAlias)}[ \\t]*$`, "m")
  if (hostLineRe.test(existing)) return // script'teki "zaten tanımlı, atlanıyor" davranışı

  const block = `Host ${hostAlias}\n    HostName github.com\n    User git\n    IdentityFile ${keyFile}\n    IdentitiesOnly yes\n`
  const needsLeadingNewline = existing.length > 0 && !existing.endsWith("\n")
  await writeFile(SSH_CONFIG, (needsLeadingNewline ? "\n" : "") + block, { flag: "a" })
  await chmod(SSH_CONFIG, 0o600)
}

async function removeHostAlias(hostAlias: string): Promise<void> {
  const existing = await readFile(SSH_CONFIG, "utf8").catch(() => "")
  if (!existing) return
  // Yazdığımız bloğu birebir tanıyoruz: "Host <alias>" satırı + onu izleyen
  // girintili satırlar (config gövdesi). Yalnızca kendi ürettiğimiz bloğu
  // kaldırıyoruz, kullanıcının elle eklediği başka Host bloklarına dokunmuyoruz.
  const blockRe = new RegExp(
    `(^|\\n)[ \\t]*Host[ \\t]+${escapeRegExp(hostAlias)}[ \\t]*\\n(?:[ \\t]+[^\\n]*\\n?)*`,
    "m"
  )
  const updated = existing.replace(blockRe, (_match, lead: string) => (lead ? "\n" : ""))
  if (updated !== existing) {
    await writeFile(SSH_CONFIG, updated)
    await chmod(SSH_CONFIG, 0o600)
  }
}

export async function generateDeployKey(domain: string): Promise<DeployKeyInfo> {
  await ensureSshDir()
  const keyName = deployKeyNameFor(domain)
  const keyFile = join(SSH_DIR, keyName)
  const pubFile = `${keyFile}.pub`
  const hostAlias = deployHostAlias(keyName)

  if (await pathExists(keyFile)) {
    throw new GithubKeyError(
      "Bu site için deploy key zaten mevcut. Önce mevcut anahtarı silin.",
      409
    )
  }

  await generateEd25519KeyPair(keyFile, keyName)
  await ensureHostAlias(hostAlias, keyFile)

  const publicKey = (await readFile(pubFile, "utf8")).trim()
  const fingerprint = await fingerprintOf(pubFile)

  return { keyName, hostAlias, publicKey, fingerprint, createdAt: new Date().toISOString() }
}

export async function removeDeployKey(domain: string): Promise<void> {
  const keyName = deployKeyNameFor(domain)
  const keyFile = join(SSH_DIR, keyName)
  const hostAlias = deployHostAlias(keyName)

  await removeHostAlias(hostAlias)
  await rm(keyFile, { force: true })
  await rm(`${keyFile}.pub`, { force: true })
}

async function ensureGithubKnownHost(): Promise<void> {
  await writeFile(KNOWN_HOSTS, "", { flag: "a" })
  await chmod(KNOWN_HOSTS, 0o644)
  const existing = await readFile(KNOWN_HOSTS, "utf8").catch(() => "")
  if (existing.includes("github.com")) return
  try {
    const { stdout } = await execFileAsync("ssh-keyscan", ["-t", "ed25519", "github.com"], {
      timeout: 10_000,
    })
    if (stdout.trim()) {
      await writeFile(KNOWN_HOSTS, stdout, { flag: "a" })
    }
  } catch {
    // best-effort — known_hosts olmadan da bağlantı denemesi devam edebilir,
    // yalnızca ilk seferde host authenticity uyarısı çıkabilir.
  }
}

export interface DeployKeyTestResult {
  ok: boolean
  output: string
}

/** script'in 7. adımının karşılığı: `ssh -T git@<alias>`. GitHub başarılı
 * kimlik doğrulamada bile exit 1 döner (shell erişimi vermez) — bu yüzden
 * başarı, çıktıdaki "successfully authenticated" ifadesiyle belirlenir. */
export async function testDeployKeyConnection(domain: string): Promise<DeployKeyTestResult> {
  const keyName = deployKeyNameFor(domain)
  const hostAlias = deployHostAlias(keyName)
  if (!(await pathExists(join(SSH_DIR, keyName)))) {
    throw new GithubKeyError("Bu site için deploy key bulunamadı.", 404)
  }

  await ensureGithubKnownHost()

  try {
    const { stdout, stderr } = await execFileAsync(
      "ssh",
      ["-T", "-o", "ConnectTimeout=10", "-o", "BatchMode=yes", `git@${hostAlias}`],
      { timeout: 15_000 }
    )
    const output = `${stdout}${stderr}`.trim()
    return { ok: /successfully authenticated/i.test(output), output }
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string }
    const output = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim()
    return { ok: /successfully authenticated/i.test(output), output: output || err.message }
  }
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
