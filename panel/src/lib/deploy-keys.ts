/**
 * SSH deploy key yönetimi — manuel (GitHub App dışı) depolar için: GitLab,
 * Bitbucket, self-hosted Gitea ya da GitHub App kurmak istemeyen kullanıcı.
 * (2026-09-15 denetimi: bu yol arayüzden tamamen kaldırılmıştı, GitHub App tek
 * seçenek olmuştu — geri getirildi.)
 *
 * Tasarım: site başına bir ed25519 anahtar çifti `panel` kullanıcısının kendi
 * `~/.ssh` dizininde (0600) üretilir; git bu anahtarı `~/.ssh/config` host
 * alias'ı ile DEĞİL, doğrudan `GIT_SSH_COMMAND="ssh -i <key> -o
 * IdentitiesOnly=yes"` ile kullanır (bkz. src/lib/git.ts) — böylece herhangi
 * bir git host'u (github.com, gitlab.com, ...) aynı şekilde çalışır ve
 * `~/.ssh/config`'e dokunulmaz.
 *
 * GÜVENLİK: private key ASLA veritabanına yazılmaz ve hiçbir API'den dönmez;
 * yalnızca public key gösterilir (kullanıcı bunu deponun "Deploy Keys"
 * ayarına salt-okunur olarak ekler). Yeni bir sudo izni GEREKMEZ.
 */
import { execFile } from "node:child_process"
import { access, chmod, mkdir, readFile, rm } from "node:fs/promises"
import { constants as fsConstants } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

const SSH_DIR = join(homedir(), ".ssh")

export class DeployKeyError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = "DeployKeyError"
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

/** `example.com` -> `example_com` — anahtar adlarında güvenli. */
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

export function deployKeyPathFor(domain: string): string {
  return join(SSH_DIR, deployKeyNameFor(domain))
}

export interface DeployKeyInfo {
  keyName: string
  publicKey: string
  fingerprint: string
  createdAt: string
}

export async function hasDeployKey(domain: string): Promise<boolean> {
  return pathExists(deployKeyPathFor(domain))
}

export async function generateDeployKey(domain: string): Promise<DeployKeyInfo> {
  await ensureSshDir()
  const keyName = deployKeyNameFor(domain)
  const keyFile = join(SSH_DIR, keyName)
  const pubFile = `${keyFile}.pub`

  if (await pathExists(keyFile)) {
    throw new DeployKeyError("Bu site için deploy key zaten mevcut. Önce mevcut anahtarı silin.", 409)
  }

  try {
    // `timeout` kritik: dosya varken ssh-keygen interaktif "Overwrite?" sorar
    // ve stdin olmadığı için süresiz asılı kalırdı.
    await execFileAsync("ssh-keygen", ["-t", "ed25519", "-C", keyName, "-f", keyFile, "-N", ""], {
      timeout: 15_000,
    })
  } catch (error) {
    throw new DeployKeyError(detailFromError(error, "Anahtar üretilemedi."), 500)
  }
  await chmod(keyFile, 0o600)
  await chmod(pubFile, 0o644)

  const publicKey = (await readFile(pubFile, "utf8")).trim()
  const fingerprint = await fingerprintOf(pubFile)
  return { keyName, publicKey, fingerprint, createdAt: new Date().toISOString() }
}

export async function removeDeployKey(domain: string): Promise<void> {
  const keyFile = deployKeyPathFor(domain)
  await rm(keyFile, { force: true })
  await rm(`${keyFile}.pub`, { force: true })
}

/** `git@github.com:owner/repo.git` / `ssh://git@gitlab.com/owner/repo.git` -> host. */
export function sshHostFromRepoUrl(repoUrl: string): string | null {
  const scp = repoUrl.match(/^([A-Za-z0-9_.-]+)@([A-Za-z0-9_.-]+):/)
  if (scp) return scp[2]
  try {
    const url = new URL(repoUrl)
    if (url.protocol === "ssh:" && url.hostname) return url.hostname
  } catch {
    // scp biçimi değil, URL de değil
  }
  return null
}

export function isSshRepoUrl(repoUrl: string): boolean {
  return sshHostFromRepoUrl(repoUrl) !== null
}

/** git'in bu siteye özel deploy key'i kullanması için ortam değişkeni (anahtar yoksa boş). */
export async function gitSshEnvFor(domain: string, repoUrl: string | null | undefined): Promise<Record<string, string>> {
  const base = "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new"
  if (!repoUrl || !isSshRepoUrl(repoUrl)) return {}
  const keyFile = deployKeyPathFor(domain)
  if (!(await pathExists(keyFile))) return { GIT_SSH_COMMAND: base }
  return { GIT_SSH_COMMAND: `${base} -i ${keyFile} -o IdentitiesOnly=yes` }
}

export interface DeployKeyTestResult {
  ok: boolean
  output: string
}

/** `ssh -T git@<host>` — GitHub/GitLab başarılı kimlik doğrulamada bile shell
 * vermediği için exit 1 döner; başarı çıktıdaki tanıdık ifadelerden çıkarılır. */
export async function testDeployKeyConnection(domain: string, host: string): Promise<DeployKeyTestResult> {
  const keyFile = deployKeyPathFor(domain)
  if (!(await pathExists(keyFile))) {
    throw new DeployKeyError("Bu site için deploy key bulunamadı.", 404)
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(host)) {
    throw new DeployKeyError("Geçersiz host.", 400)
  }
  const args = [
    "-T",
    "-i", keyFile,
    "-o", "IdentitiesOnly=yes",
    "-o", "ConnectTimeout=10",
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    `git@${host}`,
  ]
  const successRe = /successfully authenticated|Welcome to GitLab|logged in as|authenticated via/i
  try {
    const { stdout, stderr } = await execFileAsync("ssh", args, { timeout: 15_000 })
    const output = `${stdout}${stderr}`.trim()
    return { ok: successRe.test(output), output }
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string }
    const output = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim()
    return { ok: successRe.test(output), output: output || err.message }
  }
}
