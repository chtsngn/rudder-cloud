/**
 * Manuel/otomatik `git pull` — panel süreci (`panel` kullanıcısı) doğrudan,
 * hiçbir sudo/privileged script olmadan çalıştırır. Bu yüzden yalnızca
 * panelin zaten yazma izni olduğu dizinlerde çalışır: NODEJS/PYTHON (systemd
 * birimleri `User=panel`), REVERSE_PROXY ve DOCKER (klasör panel tarafından
 * oluşturulur — CloudPanel-tarzı "reverse-proxy + git clone + Docker Compose
 * ile ayağa kaldır" akışı tam olarak bunu gerektiriyor). STATIC/PHP/WORDPRESS
 * dosyaları dedicated kullanıcıya ait olduğu için (bkz. provision-site.sh
 * apply_owned_site_access) git-pull kasıtlı olarak DESTEKLENMİYOR.
 *
 * Kimlik doğrulama: site bir GitHub App kurulumuna bağlıysa kısa ömürlü
 * installation token (HTTPS); SSH adresli manuel depolarda sitenin kendi
 * deploy key'i (`GIT_SSH_COMMAND`, bkz. src/lib/deploy-keys.ts); public
 * HTTPS depolarda hiçbir şey.
 */
import { execFile } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

import { gitSshEnvFor } from "@/lib/deploy-keys"
import { getInstallationAccessToken } from "@/lib/github-app"
import { resolveSiteWorkdir, type SiteLike } from "@/lib/site-paths"

const execFileAsync = promisify(execFile)
const GIT_TIMEOUT_MS = 180_000

// https:// (opsiyonel gömülü token ile), git@host:owner/repo(.git) ya da ssh://git@host/owner/repo(.git)
const REPO_URL_RE =
  /^(https:\/\/[A-Za-z0-9_.:@-]+\/[A-Za-z0-9_.\/-]+(\.git)?|git@[A-Za-z0-9_.-]+:[A-Za-z0-9_.\/-]+(\.git)?|ssh:\/\/[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+(:[0-9]{1,5})?\/[A-Za-z0-9_.\/-]+(\.git)?)$/
const BRANCH_RE = /^[A-Za-z0-9._/-]{1,100}$/

export function isValidRepoUrl(url: string): boolean {
  return typeof url === "string" && url.length <= 512 && REPO_URL_RE.test(url)
}

export function isValidGitBranch(branch: string): boolean {
  return typeof branch === "string" && BRANCH_RE.test(branch) && !branch.includes("..")
}

export class GitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GitError"
  }
}

const GIT_PULL_TYPES = new Set(["NODEJS", "PYTHON", "REVERSE_PROXY", "DOCKER"])

export function isGitPullSupported(siteType: string): boolean {
  return GIT_PULL_TYPES.has(siteType)
}

export const GIT_PULL_UNSUPPORTED_MESSAGE =
  "Bu site türü için git bağlama desteklenmiyor (yalnızca Node.js/Python/Ters Proxy/Docker)."

async function pathExists(path: string): Promise<boolean> {
  try {
    await execFileAsync("test", ["-e", path])
    return true
  } catch {
    return false
  }
}

export interface GitPullResult {
  /** Pull sonucunda HEAD değişti mi (yoksa zaten güncel miydi) — çağıran bunu
   * "deploy/restart gerekli mi" kararı için kullanır (bkz. deploy.ts). */
  changed: boolean
  commit: string
}

async function currentCommit(workdir: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", workdir, "rev-parse", "HEAD"])
    return stdout.trim()
  } catch {
    return null
  }
}

async function currentRemoteUrl(workdir: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", workdir, "remote", "get-url", "origin"])
    return stdout.trim()
  } catch {
    return null
  }
}

/**
 * Site bir GitHub App kurulumuna bağlıysa (`githubInstallationId`), kısa
 * ömürlü installation token'ı HTTPS kimlik doğrulaması olarak enjekte eden
 * `git -c http.extraHeader=...` argümanlarını döner — GitHub'ın kendi
 * `actions/checkout`'ta kullandığı biçim (`x-access-token:<token>` Basic Auth).
 * Token hiçbir zaman diske (`.git/config`, remote URL) YAZILMAZ.
 */
async function githubAppAuthArgs(githubInstallationId: string | null | undefined): Promise<string[]> {
  if (!githubInstallationId) return []
  const token = await getInstallationAccessToken(githubInstallationId)
  const basicCredential = Buffer.from(`x-access-token:${token}`).toString("base64")
  return ["-c", `http.extraHeader=AUTHORIZATION: basic ${basicCredential}`]
}

/**
 * `.git` yoksa (veya varsa ama farklı bir depoya bağlıysa — `repoChanged`)
 * temiz bir geçici dizine klonlayıp içeriğini `rsync -a [--delete]` ile hedefe
 * yansıtır (`--delete` YALNIZCA repo değiştiğinde: eski repodan kalanlar
 * temizlensin; ilk klonlamada var olan dosyalara — .env gibi — dokunulmaz).
 * `.git` varsa VE aynı depoya bağlıysa `git fetch` + `reset --hard`.
 */
export async function gitPullOrClone(
  site: SiteLike & { repoUrl: string; gitBranch: string; githubInstallationId?: string | null }
): Promise<GitPullResult> {
  if (!isGitPullSupported(site.type)) {
    throw new GitError(GIT_PULL_UNSUPPORTED_MESSAGE)
  }
  if (!isValidRepoUrl(site.repoUrl)) {
    throw new GitError(`Geçersiz repo adresi: ${site.repoUrl}`)
  }
  if (!isValidGitBranch(site.gitBranch)) {
    throw new GitError(`Geçersiz git branch: ${site.gitBranch}`)
  }

  const workdir = resolveSiteWorkdir(site)
  if (!workdir) {
    throw new GitError("Bu site türü için çalışma dizini belirlenemedi.")
  }

  const hasGit = await pathExists(join(workdir, ".git"))
  const existingOrigin = hasGit ? await currentRemoteUrl(workdir) : null
  const repoChanged = hasGit && existingOrigin !== null && existingOrigin !== site.repoUrl
  const reuseExisting = hasGit && !repoChanged
  const before = reuseExisting ? await currentCommit(workdir) : null

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0", // kimlik sorulursa asılı kalmak yerine hemen hata ver
    ...(await gitSshEnvFor(site.domain, site.repoUrl)),
  }

  try {
    const authArgs = await githubAppAuthArgs(site.githubInstallationId)
    if (reuseExisting) {
      await execFileAsync("git", ["-C", workdir, ...authArgs, "fetch", "origin", site.gitBranch], {
        timeout: GIT_TIMEOUT_MS,
        env,
      })
      await execFileAsync("git", ["-C", workdir, "reset", "--hard", `origin/${site.gitBranch}`], {
        timeout: GIT_TIMEOUT_MS,
        env,
      })
    } else {
      const tmp = await mkdtemp(join(tmpdir(), "site-git-"))
      try {
        await execFileAsync(
          "git",
          [...authArgs, "clone", "--branch", site.gitBranch, "--single-branch", site.repoUrl, tmp],
          { timeout: GIT_TIMEOUT_MS, env }
        )
        await execFileAsync("mkdir", ["-p", workdir])
        const rsyncArgs = repoChanged ? ["-a", "--delete", `${tmp}/`, `${workdir}/`] : ["-a", `${tmp}/`, `${workdir}/`]
        await execFileAsync("rsync", rsyncArgs, { timeout: GIT_TIMEOUT_MS })
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: string; killed?: boolean }
    if (err.killed) throw new GitError("git işlemi zaman aşımına uğradı.")
    const detail = err.stderr?.toString().trim() || err.message
    throw new GitError(detail || "git pull başarısız oldu.")
  }

  const after = await currentCommit(workdir)
  return { changed: before !== after, commit: after ?? "" }
}
