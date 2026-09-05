/**
 * GitHub REST API İstemcisi — Deploy Key yönetimi.
 *
 * Repoya SSH Deploy Key ekleme/listeleme/silme (`/repos/{owner}/{repo}/keys`)
 * — bir bearer token alır, token'ın kaynağı (Aşama H'den beri) GitHub App
 * installation token'ı (bkz. src/lib/github-app.ts), eskiden olduğu gibi bir
 * kullanıcı PAT'ı DEĞİL.
 */
export const GITHUB_API_BASE = "https://api.github.com"
export const GITHUB_API_VERSION = "2022-11-28"
export const USER_AGENT = "Rudder-Cloud-Panel/1.2.4"

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
