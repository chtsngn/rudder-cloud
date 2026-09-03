/**
 * GitHub REST API İstemcisi ve Entegrasyon Katmanı.
 *
 * Kullanıcının GitHub Personal Access Token'ı (PAT) üzerinden:
 * - Kullanıcı kimlik doğrulama & profil sorgulama
 * - Depoları (repositories) listeleme
 * - Depoya doğrudan Deploy Key ekleme/listeleme/silme işlemlerini yürütür.
 */
import { decryptSecret } from "@/lib/crypto"
import { prisma } from "@/lib/prisma"

const GITHUB_API_BASE = "https://api.github.com"
const GITHUB_API_VERSION = "2022-11-28"
const USER_AGENT = "Rudder-Cloud-Panel/1.1.0"

export class GitHubApiError extends Error {
  status: number
  detail?: unknown

  constructor(message: string, status = 400, detail?: unknown) {
    super(message)
    this.name = "GitHubApiError"
    this.status = status
    this.detail = detail
  }
}

export interface GitHubUserProfile {
  id: number
  login: string
  name: string | null
  avatarUrl: string
  htmlUrl: string
  publicRepos: number
  totalPrivateRepos: number
}

export interface GitHubTokenVerification {
  valid: boolean
  user: GitHubUserProfile
  scopes: string[]
  hasDeployKeyScope: boolean
}

export interface GitHubRepoItem {
  id: number
  name: string
  fullName: string
  owner: string
  private: boolean
  htmlUrl: string
  sshUrl: string
  defaultBranch: string
  description: string | null
}

export interface GitHubDeployKeyResponse {
  id: number
  key: string
  url: string
  title: string
  verified: boolean
  createdAt: string
  readOnly: boolean
}

function parseScopes(scopeHeader: string | null): string[] {
  if (!scopeHeader) return []
  return scopeHeader
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Verilen Personal Access Token'ı GitHub API üzerinden doğrular ve kullanıcı profilini çeker.
 */
export async function verifyGitHubToken(token: string): Promise<GitHubTokenVerification> {
  const cleanToken = token.trim()
  if (!cleanToken) {
    throw new GitHubApiError("GitHub token boş olamaz.", 400)
  }

  const res = await fetch(`${GITHUB_API_BASE}/user`, {
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string }
    if (res.status === 401) {
      throw new GitHubApiError("Geçersiz GitHub token veya yetkilendirme reddedildi.", 401)
    }
    throw new GitHubApiError(
      body.message || `GitHub API isteği başarısız oldu (${res.status}).`,
      res.status
    )
  }

  const rawUser = (await res.json()) as {
    id: number
    login: string
    name: string | null
    avatar_url: string
    html_url: string
    public_repos?: number
    total_private_repos?: number
  }

  const scopes = parseScopes(res.headers.get("x-oauth-scopes"))
  const hasDeployKeyScope = scopes.some((s) =>
    ["repo", "public_repo", "admin:public_key"].includes(s)
  )

  return {
    valid: true,
    user: {
      id: rawUser.id,
      login: rawUser.login,
      name: rawUser.name,
      avatarUrl: rawUser.avatar_url,
      htmlUrl: rawUser.html_url,
      publicRepos: rawUser.public_repos ?? 0,
      totalPrivateRepos: rawUser.total_private_repos ?? 0,
    },
    scopes,
    hasDeployKeyScope,
  }
}

/**
 * Kullanıcının veritabanındaki kayıtlı token'ını güvenle çözer ve döndürür.
 */
export async function getDecryptedTokenForUser(userId: string): Promise<string> {
  const account = await prisma.gitHubAccount.findUnique({
    where: { userId },
  })
  if (!account) {
    throw new GitHubApiError("Kullanıcıya ait bağlı GitHub hesabı bulunamadı.", 404)
  }
  return decryptSecret(account.tokenEnc)
}

/**
 * Bağlı GitHub kullanıcısının erişebildiği depoları listeler.
 */
export async function listGitHubUserRepos(token: string): Promise<GitHubRepoItem[]> {
  const res = await fetch(
    `${GITHUB_API_BASE}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        "User-Agent": USER_AGENT,
      },
      cache: "no-store",
    }
  )

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string }
    throw new GitHubApiError(
      body.message || `Depolar listelenemedi (${res.status}).`,
      res.status
    )
  }

  const rawRepos = (await res.json()) as Array<{
    id: number
    name: string
    full_name: string
    owner: { login: string }
    private: boolean
    html_url: string
    ssh_url: string
    default_branch: string
    description: string | null
  }>

  return rawRepos.map((r) => ({
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    owner: r.owner?.login ?? "",
    private: r.private,
    htmlUrl: r.html_url,
    sshUrl: r.ssh_url,
    defaultBranch: r.default_branch,
    description: r.description,
  }))
}

/**
 * GitHub API üzerinden belirtilen depoya bir Deploy Key ekler (`POST /repos/{owner}/{repo}/keys`).
 */
export async function addDeployKeyToGitHubRepo(
  token: string,
  owner: string,
  repo: string,
  title: string,
  publicKey: string,
  readOnly = true
): Promise<GitHubDeployKeyResponse> {
  const cleanOwner = owner.trim()
  const cleanRepo = repo.trim()
  const cleanTitle = title.trim() || "Rudder Cloud Deploy Key"
  const cleanKey = publicKey.trim()

  if (!cleanOwner || !cleanRepo) {
    throw new GitHubApiError("Depo sahibi (owner) ve adı (repo) zorunludur.", 400)
  }
  if (!cleanKey) {
    throw new GitHubApiError("Deploy public key boş olamaz.", 400)
  }

  const res = await fetch(`${GITHUB_API_BASE}/repos/${cleanOwner}/${cleanRepo}/keys`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": USER_AGENT,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: cleanTitle,
      key: cleanKey,
      read_only: readOnly,
    }),
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string
      errors?: Array<{ message?: string }>
    }
    const errMsg =
      body.errors?.[0]?.message ||
      body.message ||
      `Deploy key eklenemedi (${res.status}). Depoya yazma/yönetici yetkiniz olduğundan emin olun.`
    throw new GitHubApiError(errMsg, res.status, body)
  }

  const created = (await res.json()) as {
    id: number
    key: string
    url: string
    title: string
    verified: boolean
    created_at: string
    read_only: boolean
  }

  return {
    id: created.id,
    key: created.key,
    url: created.url,
    title: created.title,
    verified: created.verified,
    createdAt: created.created_at,
    readOnly: created.read_only,
  }
}

/**
 * Belirtilen depodaki Deploy Key'leri listeler (`GET /repos/{owner}/{repo}/keys`).
 */
export async function listDeployKeysFromGitHubRepo(
  token: string,
  owner: string,
  repo: string
): Promise<GitHubDeployKeyResponse[]> {
  const res = await fetch(`${GITHUB_API_BASE}/repos/${owner.trim()}/${repo.trim()}/keys`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string }
    throw new GitHubApiError(
      body.message || `Deploy key'ler listelenemedi (${res.status}).`,
      res.status
    )
  }

  const rawKeys = (await res.json()) as Array<{
    id: number
    key: string
    url: string
    title: string
    verified: boolean
    created_at: string
    read_only: boolean
  }>

  return rawKeys.map((k) => ({
    id: k.id,
    key: k.key,
    url: k.url,
    title: k.title,
    verified: k.verified,
    createdAt: k.created_at,
    readOnly: k.read_only,
  }))
}

/**
 * GitHub API üzerinden depodan bir Deploy Key siler (`DELETE /repos/{owner}/{repo}/keys/{keyId}`).
 */
export async function deleteDeployKeyFromGitHubRepo(
  token: string,
  owner: string,
  repo: string,
  keyId: number
): Promise<void> {
  const res = await fetch(
    `${GITHUB_API_BASE}/repos/${owner.trim()}/${repo.trim()}/keys/${keyId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        "User-Agent": USER_AGENT,
      },
    }
  )

  if (!res.ok && res.status !== 404) {
    const body = (await res.json().catch(() => ({}))) as { message?: string }
    throw new GitHubApiError(
      body.message || `Deploy key GitHub'dan silinemedi (${res.status}).`,
      res.status
    )
  }
}
