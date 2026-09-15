import { NextResponse } from "next/server"
import { execFileSync } from "node:child_process"
import { getSession } from "@/lib/auth"
import { APP_VERSION } from "@/lib/version"
import { resolveSourceDir } from "@/lib/self-update"

export const CURRENT_VERSION = APP_VERSION
export const GITHUB_REPO = "chtsngn/rudder-cloud"

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
}

let cachedRelease: {
  data: VersionResponse
  timestamp: number
} | null = null

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 dakika önbellek

function compareSemver(v1: string, v2: string): number {
  const clean = (v: string) =>
    v
      .replace(/^v/, "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0)
  const [maj1 = 0, min1 = 0, pat1 = 0] = clean(v1)
  const [maj2 = 0, min2 = 0, pat2 = 0] = clean(v2)
  if (maj1 !== maj2) return maj1 - maj2
  if (min1 !== min2) return min1 - min2
  return pat1 - pat2
}

/**
 * Kurulu kodun git bilgisi. Panel bir rsync kopyasında (.git YOK) çalıştığı
 * için cwd'de değil, KAYNAK KLONDA sorgulanır (bkz. lib/self-update.ts).
 * Kaynak klon root'a ait; git "dubious ownership" ile reddetmesin diye o
 * çağrıya özel `safe.directory` verilir. Etiket checkout'unda (detached
 * HEAD) dal adı yerine etiket gösterilir. Bulunamazsa null — arayüz "HEAD"
 * yazar; uydurma bir commit gösterilmez.
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

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const force = searchParams.get("force") === "true"
  const now = Date.now()

  const gitInfo = getLocalGitInfo()

  // Önbellek geçerli mi?
  if (!force && cachedRelease && now - cachedRelease.timestamp < CACHE_TTL_MS) {
    return NextResponse.json({
      ...cachedRelease.data,
      currentVersion: CURRENT_VERSION,
      gitInfo,
    })
  }

  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Rudder-Cloud-Panel",
    }
    if (process.env.GITHUB_TOKEN) {
      headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`
    }

    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers,
      next: { revalidate: 300 },
    })

    if (!res.ok) {
      const fallbackData = {
        currentVersion: CURRENT_VERSION,
        latestVersion: CURRENT_VERSION,
        hasUpdate: false,
        releaseName: CURRENT_VERSION,
        releaseNotes: "Sürüm bilgisi kontrol edildi. Sistem güncel.",
        publishedAt: new Date().toISOString(),
        githubUrl: `https://github.com/${GITHUB_REPO}`,
        gitInfo,
        checkedAt: new Date().toISOString(),
      }
      return NextResponse.json(fallbackData)
    }

    const release: GitHubRelease = await res.json()
    const latestVersion = release.tag_name || CURRENT_VERSION
    const hasUpdate = compareSemver(latestVersion, CURRENT_VERSION) > 0

    const responseData: VersionResponse = {
      currentVersion: CURRENT_VERSION,
      latestVersion,
      hasUpdate,
      releaseName: release.name || release.tag_name,
      releaseNotes: release.body || "Açıklama belirtilmedi.",
      publishedAt: release.published_at,
      githubUrl: release.html_url || `https://github.com/${GITHUB_REPO}/releases`,
      gitInfo,
      checkedAt: new Date().toISOString(),
    }

    cachedRelease = {
      data: responseData,
      timestamp: now,
    }

    return NextResponse.json(responseData)
  } catch (error) {
    return NextResponse.json({
      currentVersion: CURRENT_VERSION,
      latestVersion: CURRENT_VERSION,
      hasUpdate: false,
      releaseName: CURRENT_VERSION,
      releaseNotes: "GitHub bağlantısı kurulamadı.",
      publishedAt: new Date().toISOString(),
      githubUrl: `https://github.com/${GITHUB_REPO}`,
      gitInfo,
      checkedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Bilinmeyen hata",
    })
  }
}
