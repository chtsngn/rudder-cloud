/**
 * Manuel/otomatik `git pull` — panel süreci (`panel` kullanıcısı) doğrudan,
 * hiçbir sudo/privileged script olmadan çalıştırır. Bu yüzden yalnızca
 * panelin zaten yazma izni olduğu dizinlerde çalışır: NODEJS/PYTHON tipleri
 * (systemd birimleri her zaman `User=panel` ile oluşturuluyor, bkz.
 * provision-site.sh `cmd_create_service`) ve REVERSE_PROXY (dizin panel
 * tarafından ilk pull'da oluşturulur, bkz. site-paths.ts — CloudPanel-tarzı
 * "reverse-proxy + git clone + PM2/Docker Compose ile ayağa kaldır" akışı
 * tam olarak bunu gerektiriyor). STATIC/PHP/WORDPRESS tipleri isteğe bağlı
 * "dedicated linux user" desteklediği için (bkz. `ensure_linux_user`)
 * panelin o dizine yazma izni garanti değil — bu tipler için git-pull
 * kasıtlı olarak DESTEKLENMİYOR (bkz. docs/ARCHITECTURE.md → Aşama B,
 * "kapsam dışı bırakılanlar").
 */
import { execFile } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

import { getInstallationAccessToken } from "@/lib/github-app"
import { resolveSiteWorkdir, type SiteLike } from "@/lib/site-paths"

const execFileAsync = promisify(execFile)
const GIT_TIMEOUT_MS = 120_000

// https:// (opsiyonel gömülü token ile) veya git@host:owner/repo(.git) — ssh
const REPO_URL_RE =
  /^(https:\/\/[A-Za-z0-9_.:@-]+\/[A-Za-z0-9_.\/-]+(\.git)?|git@[A-Za-z0-9_.-]+:[A-Za-z0-9_.\/-]+(\.git)?)$/
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

const GIT_PULL_TYPES = new Set(["NODEJS", "PYTHON", "REVERSE_PROXY"])

export function isGitPullSupported(siteType: string): boolean {
  return GIT_PULL_TYPES.has(siteType)
}

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
   * "restart gerekli mi" kararı için kullanır (bkz. auto-pull-scheduler.ts). */
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
 * Site bir GitHub App kurulumuna bağlıysa (`githubInstallationId`), SSH
 * deploy key YERİNE bu kurulumun kısa ömürlü installation token'ını HTTPS
 * kimlik doğrulaması olarak enjekte eden `git -c http.extraHeader=...`
 * argümanlarını döner — GitHub'ın kendi `actions/checkout`'ta kullandığı
 * biçim (`x-access-token:<token>` Basic Auth olarak base64), git'in smart-
 * HTTP protokolü Bearer şemasını değil bunu bekliyor. Token hiçbir zaman
 * diske (`.git/config`, remote URL içine) YAZILMAZ — yalnızca bu tek
 * `execFile` çağrısının argümanlarında, bellekte yaşar; her çağrıda TAZE
 * mintlendiği için (bkz. getInstallationAccessToken önbelleği) sonraki
 * `git fetch`'ler eski/süresi dolmuş bir token'a asla bağlı kalmaz. Kurulum
 * bağlı değilse boş dizi döner (mevcut repoUrl/SSH akışı değişmeden çalışır).
 */
async function githubAppAuthArgs(githubInstallationId: string | null | undefined): Promise<string[]> {
  if (!githubInstallationId) return []
  const token = await getInstallationAccessToken(githubInstallationId)
  const basicCredential = Buffer.from(`x-access-token:${token}`).toString("base64")
  return ["-c", `http.extraHeader=AUTHORIZATION: basic ${basicCredential}`]
}

/**
 * `.git` yoksa (veya varsa ama farklı bir depoya bağlıysa — bkz. aşağıda
 * `repoChanged`) temiz bir geçici dizine klonlayıp içeriğini `rsync -a
 * --delete` ile hedefe yansıtır — `--delete` KASITLI: repo değiştiğinde
 * eski repodan kalan dosyaların silinip hedefin yeni repoyla BİREBİR eşit
 * hale gelmesini garantiler (bkz. site-github-keys-card kaldırılırken
 * eklenen kullanıcı uyarısı: "repo değiştirilirse eski dosyalar silinir").
 * `.git` varsa VE aynı depoya bağlıysa doğrudan `git fetch` + `reset --hard`
 * ile hızlı, aşamalı bir pull yapılır.
 */
export async function gitPullOrClone(
  site: SiteLike & { repoUrl: string; gitBranch: string; githubInstallationId?: string | null }
): Promise<GitPullResult> {
  if (!isGitPullSupported(site.type)) {
    throw new GitError(
      "Bu site türü için git pull henüz desteklenmiyor (yalnızca Node.js/Python)."
    )
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

  try {
    const authArgs = await githubAppAuthArgs(site.githubInstallationId)
    if (reuseExisting) {
      await execFileAsync(
        "git",
        ["-C", workdir, ...authArgs, "fetch", "origin", site.gitBranch],
        { timeout: GIT_TIMEOUT_MS }
      )
      await execFileAsync(
        "git",
        ["-C", workdir, "reset", "--hard", `origin/${site.gitBranch}`],
        { timeout: GIT_TIMEOUT_MS }
      )
    } else {
      const tmp = await mkdtemp(join(tmpdir(), "site-git-"))
      try {
        await execFileAsync(
          "git",
          [...authArgs, "clone", "--branch", site.gitBranch, "--single-branch", site.repoUrl, tmp],
          { timeout: GIT_TIMEOUT_MS }
        )
        await execFileAsync("mkdir", ["-p", workdir])
        // `--delete` SADECE repo gerçekten değiştiyse (repoChanged) eklenir —
        // gerçek ilk klonlamada üstteki dosya-fonksiyonu-dışı dosyaları
        // SİLMEME garantisi (WordPress-tarzı senaryo, bkz. fonksiyon başlığı)
        // korunuyor; yalnızca "eski repo -> yeni repo" geçişinde eski
        // içerik bilinçli olarak temizleniyor.
        const rsyncArgs = repoChanged ? ["-a", "--delete", `${tmp}/`, `${workdir}/`] : ["-a", `${tmp}/`, `${workdir}/`]
        await execFileAsync("rsync", rsyncArgs, { timeout: GIT_TIMEOUT_MS })
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: string }
    const detail = err.stderr?.toString().trim() || err.message
    throw new GitError(detail || "git pull başarısız oldu.")
  }

  const after = await currentCommit(workdir)
  return { changed: before !== after, commit: after ?? "" }
}
