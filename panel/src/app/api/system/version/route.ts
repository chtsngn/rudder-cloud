import { NextResponse } from "next/server"
import { execFileSync } from "node:child_process"
import { getSession } from "@/lib/auth"
import { APP_VERSION, compareSemver, GITHUB_REPO, RELEASE_TAG_RE } from "@/lib/version"
import { resolveSourceDir } from "@/lib/self-update"

const CURRENT_VERSION = APP_VERSION
// GitHub'a çıkar, git çalıştırır — Node runtime.
export const runtime = "nodejs"

interface GitHubRelease {
  tag_name: string
  name: string
  body: string
  html_url: string
  published_at: string
  prerelease: boolean
  draft: boolean
}

interface VersionResponse {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  releaseName: string
  releaseNotes: string
  publishedAt: string
  githubUrl: string
  gitInfo: { commit: string; branch: string } | null
  checkedAt: string
  error?: string
}

/**
 * Yalnızca SÜREÇ İÇİ önbellek (2026-09-15 düzeltmesi): eskiden GitHub isteği
 * Next'in KALICI fetch önbelleğiyle (`next: { revalidate: 300 }`, diskte
 * `.next/cache`) yapılıyordu — panel yeni sürüme geçip yeniden başlasa bile
 * eski "latest" yanıtı 5 dakika daha servis ediliyor, arayüz v1.3.1'deyken
 * v1.3.0'ı "yeni sürüm" diye gösteriyordu. Artık `cache: "no-store"`; bu
 * bellek önbelleği de süreçle birlikte sıfırlanır, `?force=true` atlar.
 */
let cachedRelease: { data: Omit<VersionResponse, "currentVersion" | "gitInfo">; timestamp: number } | null = null
const CACHE_TTL_MS = 5 * 60 * 1000

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": `Rudder-Cloud-Panel/${CURRENT_VERSION.replace(/^v/, "")}`,
  }
  if (process.env.GITHUB_TOKEN) headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`
  return headers
}

/**
 * En yüksek sürüm numaralı, taslak/ön-sürüm olmayan release. `/releases/latest`
 * "en son OLUŞTURULAN" release'i döner ve "Latest" işareti elle değiştirilebilir
 * — sürüm sırası için semver karşılaştırması güvenilir olan. Liste alınamazsa
 * `/releases/latest`'e düşülür.
 */
async function fetchLatestRelease(): Promise<GitHubRelease | null> {
  const headers = githubHeaders()
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=30`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const list = (await res.json()) as GitHubRelease[]
      const candidates = list
        .filter((r) => !r.draft && !r.prerelease && RELEASE_TAG_RE.test(r.tag_name))
        .sort((a, b) => compareSemver(b.tag_name, a.tag_name))
      if (candidates[0]) return candidates[0]
    }
  } catch {
    // aşağıdaki fallback
  }
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return null
  return (await res.json()) as GitHubRelease
}

/**
 * Kurulu kodun git bilgisi. Panel bir rsync kopyasında (.git YOK) çalıştığı
 * için cwd'de değil, KAYNAK KLONDA sorgulanır (bkz. lib/self-update.ts).
 * Klon root'a ait; git "dubious ownership" ile reddetmesin diye o çağrıya
 * özel `safe.directory` verilir. Etiket checkout'unda dal adı yerine etiket
 * gösterilir. Bulunamazsa null — arayüz "HEAD" yazar, uydurma commit yok.
 */
function getLocalGitInfo(): { commit: string; branch: string } | null {
  const sourceDir = resolveSourceDir()
  if (!sourceDir) return null
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", `safe.directory=${sourceDir}`, "-C", sourceDir, ...args], {
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim()
  try {
    const commit = git("rev-parse", "--short", "HEAD")
    let branch: string
    try {
      branch = git("describe", "--tags", "--exact-match")
    } catch {
      branch = git("rev-parse", "--abbrev-ref", "HEAD")
    }
    return { commit, branch }
  } catch {
    return null
  }
}

function upToDateResponse(gitInfo: VersionResponse["gitInfo"], error?: string): VersionResponse {
  return {
    currentVersion: CURRENT_VERSION,
    latestVersion: CURRENT_VERSION,
    hasUpdate: false,
    releaseName: CURRENT_VERSION,
    releaseNotes: error ? "GitHub'a ulaşılamadı; sürüm bilgisi doğrulanamadı." : "Sistem güncel.",
    publishedAt: new Date().toISOString(),
    githubUrl: `https://github.com/${GITHUB_REPO}/releases`,
    gitInfo,
    checkedAt: new Date().toISOString(),
    ...(error ? { error } : {}),
  }
}

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 })
  }

  const force = new URL(request.url).searchParams.get("force") === "true"
  const now = Date.now()
  const gitInfo = getLocalGitInfo()

  if (!force && cachedRelease && now - cachedRelease.timestamp < CACHE_TTL_MS) {
    return NextResponse.json({ ...cachedRelease.data, currentVersion: CURRENT_VERSION, gitInfo })
  }

  try {
    const release = await fetchLatestRelease()
    if (!release) {
      return NextResponse.json(upToDateResponse(gitInfo, "GitHub sürüm listesi alınamadı."))
    }

    const latestVersion = release.tag_name
    // Yalnızca DAHA YENİ bir sürüm "güncelleme"dir; eşit ya da daha eski
    // (ör. GitHub'daki "latest" işareti eski bir sürümde kalmışsa) değildir.
    const hasUpdate = compareSemver(latestVersion, CURRENT_VERSION) > 0

    const data: Omit<VersionResponse, "currentVersion" | "gitInfo"> = {
      latestVersion,
      hasUpdate,
      releaseName: release.name || release.tag_name,
      releaseNotes: release.body || "Açıklama belirtilmedi.",
      publishedAt: release.published_at,
      githubUrl: release.html_url || `https://github.com/${GITHUB_REPO}/releases`,
      checkedAt: new Date().toISOString(),
    }
    cachedRelease = { data, timestamp: now }
    return NextResponse.json({ ...data, currentVersion: CURRENT_VERSION, gitInfo })
  } catch (error) {
    return NextResponse.json(
      upToDateResponse(gitInfo, error instanceof Error ? error.message : "GitHub bağlantısı kurulamadı.")
    )
  }
}
