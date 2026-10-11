import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { cloneForScan, GitError, isValidGitBranch, isValidRepoUrl, listScanFiles, readScanFile } from "@/lib/git"
import { isSuperAdmin } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { scanRepo } from "@/lib/repo-scan"

const REPO_FULL_NAME_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/

/**
 * `POST /api/sites/scan` — yeni site sihirbazı (v1.5.0): depo, site
 * oluşturulmadan ÖNCE geçici bir klona çekilip taranır, kartlar ve önerilen
 * ayarlar döner (bkz. src/lib/repo-scan.ts). Site oluşturmak SUPER_ADMIN işi
 * olduğu için bu uç da öyle. Body: { installationId, repoFullName, branch }
 * (GitHub App) ya da { repoUrl, branch } (herkese açık HTTPS adresi).
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 })
  }
  const input = (body ?? {}) as Record<string, unknown>
  const branch = typeof input.branch === "string" && input.branch.trim() ? input.branch.trim() : "main"
  if (!isValidGitBranch(branch)) {
    return NextResponse.json({ error: "Geçersiz git branch." }, { status: 400 })
  }

  let repoUrl: string
  let githubInstallationId: string | null = null
  if (typeof input.repoFullName === "string" && input.repoFullName) {
    const repoFullName = input.repoFullName.trim()
    const installationId = typeof input.installationId === "string" ? input.installationId.trim() : ""
    if (!REPO_FULL_NAME_RE.test(repoFullName) || !installationId) {
      return NextResponse.json({ error: "Geçersiz depo (owner/repo ve installationId bekleniyor)." }, { status: 400 })
    }
    const installation = await prisma.gitHubInstallation.findUnique({ where: { installationId } })
    if (!installation) {
      return NextResponse.json({ error: "GitHub kurulumu bulunamadı." }, { status: 404 })
    }
    repoUrl = `https://github.com/${repoFullName}.git`
    githubInstallationId = installation.installationId
  } else {
    repoUrl = typeof input.repoUrl === "string" ? input.repoUrl.trim() : ""
    if (!isValidRepoUrl(repoUrl)) {
      return NextResponse.json({ error: "Geçersiz repo adresi." }, { status: 400 })
    }
  }

  let checkout: Awaited<ReturnType<typeof cloneForScan>> | null = null
  try {
    checkout = await cloneForScan({ repoUrl, branch, githubInstallationId })
    const files = await listScanFiles(checkout)
    const active = checkout
    const scan = await scanRepo(files, (path) => readScanFile(active, path))
    return NextResponse.json({ repoUrl, branch, scan })
  } catch (error) {
    const message = error instanceof GitError ? error.message : "Depo taranamadı."
    return NextResponse.json({ error: message }, { status: 422 })
  } finally {
    await checkout?.cleanup()
  }
}
