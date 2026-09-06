/**
 * GitHub App entegrasyonu (Aşama H) — bkz. prisma/schema.prisma
 * (GitHubAppConfig/GitHubInstallation) için tam mimari gerekçe.
 *
 * Akış:
 * 1. `buildManifest()` + istemci tarafında GitHub'ın "manifest flow"una
 *    (`POST https://github.com/settings/apps/new?state=...`) form submit —
 *    bkz. `/api/settings/github/app/begin`. GitHub App'i OTOMATİK oluşturur,
 *    App ID/private key elle kopyalanmaz.
 * 2. GitHub, admin'in TARAYICISINI `redirect_url?code=...`'a yönlendirir
 *    (sunucudan sunucuya bir webhook DEĞİL — bu yüzden redirect_url'in
 *    dışarıdan erişilebilir bir alan adı olması GEREKMEZ, yalnızca admin'in
 *    kendi tarayıcısının paneli açtığı adresten erişilebilir olması yeterli;
 *    IP:24428 dahil). `exchangeManifestCode()` bu `code`'u GERÇEK App
 *    kimlik bilgilerine çevirir (bkz. /api/settings/github/app/callback).
 * 3. "Install Et" butonu admin'i `https://github.com/apps/<slug>/installations/new`'a
 *    yönlendirir — GitHub'ın KENDİ ekranında hangi repolara izin verildiği
 *    seçilir. GitHub admin'i tekrar panele (`?installation_id=...`) yönlendirir
 *    (bkz. /api/settings/github/app/setup) — `upsertInstallation()` bunu kaydeder.
 * 4. Git/Repo işlemleri için panel KENDİ private key'iyle imzaladığı kısa
 *    ömürlü bir JWT (`signAppJwt`) ile `getInstallationAccessToken()`'dan
 *    1 saatlik bir "installation token" alır — bu token HTTP Bearer olarak
 *    hem REST API çağrılarında hem de git clone/fetch'te (`git.ts`) kullanılır.
 *    Token'lar veritabanına ASLA yazılmaz, yalnızca bellekte (bu modülün
 *    kapsamında) kısa süreliğine önbelleklenir.
 */
import { SignJWT, importPKCS8 } from "jose"

import { decryptSecret, encryptSecret } from "@/lib/crypto"
import { GITHUB_API_BASE, GITHUB_API_VERSION, USER_AGENT } from "@/lib/github-api"
import { prisma } from "@/lib/prisma"

const APP_JWT_TTL_SECONDS = 9 * 60 // GitHub azami 10dk kabul ediyor — 1dk pay bırakıldı
const INSTALLATION_TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000 // sona ermeden 5dk önce yenile

/**
 * Manifest/install akışlarının CSRF `state` nonce'unu taşıyan çerezin adı —
 * `route.ts` dosyaları Next.js'te yalnızca HTTP metodu handler'ları export
 * edebildiği için (başka bir named export build hatası verir) bu sabit
 * burada, paylaşılan bir lib dosyasında tutuluyor.
 */
export const GH_APP_STATE_COOKIE = "gh_app_state"
export const GH_APP_STATE_TTL_SECONDS = 600 // 10dk — formu doldurup göndermeye fazlasıyla yeterli

export class GitHubAppError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = "GitHubAppError"
    this.status = status
  }
}

async function githubFetch(
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {}
): Promise<Response> {
  return fetch(`${GITHUB_API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": USER_AGENT,
      ...init.headers,
    },
    cache: "no-store",
  })
}

async function githubJsonOrThrow<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string }
    throw new GitHubAppError(body.message || `${fallback} (${res.status}).`, res.status)
  }
  return (await res.json()) as T
}

// ---------------------------------------------------------------------------
// 1) Manifest flow — App'i GitHub'da otomatik oluşturma
// ---------------------------------------------------------------------------

export interface GitHubAppManifest {
  name: string
  url: string
  redirect_url: string
  callback_urls: string[]
  setup_url: string
  public: boolean
  default_permissions: Record<string, "read" | "write">
  default_events: string[]
}

/** `origin`: panelin admin'in tarayıcısından erişildiği taban adres (ör. `https://panel.example.com` veya `http://1.2.3.4:24428`). */
export function buildManifest(origin: string): GitHubAppManifest {
  const suffix = Math.random().toString(36).slice(2, 8)
  return {
    name: `Rudder Cloud (${suffix})`, // GitHub App isimleri global-unique olmalı
    url: origin,
    redirect_url: `${origin}/api/settings/github/app/callback`,
    callback_urls: [`${origin}/api/settings/github/app/callback`],
    setup_url: `${origin}/api/settings/github/app/setup`,
    public: false,
    default_permissions: {
      contents: "write",
      metadata: "read",
    },
    default_events: [],
  }
}

interface ManifestConversionResponse {
  id: number
  slug: string
  name: string
  client_id: string
  client_secret: string
  // GitHub'ın kendi şeması bunu nullable işaretliyor — manifest'te
  // `hook_attributes` (webhook URL'i) belirtilmediği için (bkz. buildManifest,
  // bu App webhook DEĞİL doğrudan REST/git akışı kullanıyor) GitHub bu App'ler
  // için `null` döndürüyor. Alan zaten hiç okunmuyor (bkz. not aşağıda).
  webhook_secret: string | null
  pem: string
  html_url: string
  owner: { login: string; avatar_url: string; type: string }
}

export interface CreatedAppInfo {
  appId: string
  slug: string
  name: string
  htmlUrl: string
  ownerLogin: string
  ownerAvatarUrl: string
}

/** GitHub'ın döndürdüğü tek kullanımlık `code`'u gerçek App kimlik bilgilerine çevirir ve DB'ye kaydeder. */
export async function exchangeManifestCode(
  code: string,
  createdByUserId: string
): Promise<CreatedAppInfo> {
  const res = await githubFetch(`/app-manifests/${encodeURIComponent(code)}/conversions`, {
    method: "POST",
  })
  const data = await githubJsonOrThrow<ManifestConversionResponse>(
    res,
    "GitHub App oluşturulamadı"
  )

  await prisma.gitHubAppConfig.upsert({
    where: { id: "panel" },
    create: {
      id: "panel",
      appId: String(data.id),
      slug: data.slug,
      name: data.name,
      clientId: data.client_id,
      clientSecretEnc: encryptSecret(data.client_secret),
      webhookSecretEnc: encryptSecret(data.webhook_secret ?? ""),
      privateKeyEnc: encryptSecret(data.pem),
      htmlUrl: data.html_url,
      ownerLogin: data.owner.login,
      ownerAvatarUrl: data.owner.avatar_url,
      createdByUserId,
    },
    update: {
      appId: String(data.id),
      slug: data.slug,
      name: data.name,
      clientId: data.client_id,
      clientSecretEnc: encryptSecret(data.client_secret),
      webhookSecretEnc: encryptSecret(data.webhook_secret ?? ""),
      privateKeyEnc: encryptSecret(data.pem),
      htmlUrl: data.html_url,
      ownerLogin: data.owner.login,
      ownerAvatarUrl: data.owner.avatar_url,
      createdByUserId,
    },
  })

  installationTokenCache.clear() // olası eski App'e ait token'lar artık geçersiz

  return {
    appId: String(data.id),
    slug: data.slug,
    name: data.name,
    htmlUrl: data.html_url,
    ownerLogin: data.owner.login,
    ownerAvatarUrl: data.owner.avatar_url,
  }
}

// ---------------------------------------------------------------------------
// 2) App JWT + installation token
// ---------------------------------------------------------------------------

async function getAppConfigOrThrow() {
  const config = await prisma.gitHubAppConfig.findUnique({ where: { id: "panel" } })
  if (!config) {
    throw new GitHubAppError("Henüz bağlı bir GitHub App yok — önce Ayarlar'dan oluşturun.", 400)
  }
  return config
}

/** `iss: <appId>` ile imzalanmış, GitHub'ın App-seviyesi uçlarında (installation token üretimi vb.) kabul ettiği kısa ömürlü RS256 JWT. */
async function signAppJwt(appId: string, privateKeyPem: string): Promise<string> {
  const key = await importPKCS8(privateKeyPem, "RS256")
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt(now - 60) // saat senkron sapmalarına karşı 60sn geriye pay (GitHub'ın kendi önerisi)
    .setExpirationTime(now + APP_JWT_TTL_SECONDS)
    .setIssuer(appId)
    .sign(key)
}

interface CachedToken {
  token: string
  expiresAtMs: number
}
const installationTokenCache = new Map<string, CachedToken>()

/** 1 saatlik installation token — bellekte önbelleklenir, DB'ye ASLA yazılmaz. */
export async function getInstallationAccessToken(installationId: string): Promise<string> {
  const cached = installationTokenCache.get(installationId)
  if (cached && cached.expiresAtMs - Date.now() > INSTALLATION_TOKEN_REFRESH_MARGIN_MS) {
    return cached.token
  }

  const config = await getAppConfigOrThrow()
  const privateKey = decryptSecret(config.privateKeyEnc)
  const appJwt = await signAppJwt(config.appId, privateKey)

  const res = await githubFetch(`/app/installations/${encodeURIComponent(installationId)}/access_tokens`, {
    method: "POST",
    headers: { Authorization: `Bearer ${appJwt}` },
  })
  const data = await githubJsonOrThrow<{ token: string; expires_at: string }>(
    res,
    "Installation token alınamadı"
  )

  installationTokenCache.set(installationId, {
    token: data.token,
    expiresAtMs: new Date(data.expires_at).getTime(),
  })
  return data.token
}

// ---------------------------------------------------------------------------
// 3) Installation yönetimi
// ---------------------------------------------------------------------------

export interface InstallationDetails {
  installationId: string
  accountLogin: string
  accountAvatarUrl: string
  accountType: string
  repositorySelection: string
}

/** App JWT ile (installation token'ı DEĞİL) — kurulum GitHub'ın kendi ekranında tamamlandıktan hemen sonra bilgilerini çekmek için. */
export async function fetchInstallationDetails(installationId: string): Promise<InstallationDetails> {
  const config = await getAppConfigOrThrow()
  const privateKey = decryptSecret(config.privateKeyEnc)
  const appJwt = await signAppJwt(config.appId, privateKey)

  const res = await githubFetch(`/app/installations/${encodeURIComponent(installationId)}`, {
    headers: { Authorization: `Bearer ${appJwt}` },
  })
  const data = await githubJsonOrThrow<{
    id: number
    account: { login: string; avatar_url: string; type: string } | null
    repository_selection: string
  }>(res, "Installation bilgisi alınamadı")

  return {
    installationId: String(data.id),
    accountLogin: data.account?.login ?? "bilinmiyor",
    accountAvatarUrl: data.account?.avatar_url ?? "",
    accountType: data.account?.type ?? "User",
    repositorySelection: data.repository_selection,
  }
}

export async function upsertInstallation(
  details: InstallationDetails,
  installedByUserId: string
) {
  return prisma.gitHubInstallation.upsert({
    where: { installationId: details.installationId },
    create: {
      installationId: details.installationId,
      accountLogin: details.accountLogin,
      accountAvatarUrl: details.accountAvatarUrl,
      accountType: details.accountType,
      repositorySelection: details.repositorySelection,
      installedByUserId,
    },
    update: {
      accountLogin: details.accountLogin,
      accountAvatarUrl: details.accountAvatarUrl,
      accountType: details.accountType,
      repositorySelection: details.repositorySelection,
    },
  })
}

/** App'in kendisinden kurulumu tamamen kaldırır (GitHub tarafında da uninstall eder). */
export async function uninstallFromGithub(installationId: string): Promise<void> {
  const config = await getAppConfigOrThrow()
  const privateKey = decryptSecret(config.privateKeyEnc)
  const appJwt = await signAppJwt(config.appId, privateKey)

  const res = await githubFetch(`/app/installations/${encodeURIComponent(installationId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${appJwt}` },
  })
  if (!res.ok && res.status !== 404) {
    const body = (await res.json().catch(() => ({}))) as { message?: string }
    throw new GitHubAppError(body.message || `Kurulum GitHub'dan kaldırılamadı (${res.status}).`, res.status)
  }
  installationTokenCache.delete(installationId)
}

// ---------------------------------------------------------------------------
// 4) Repo listeleme — "kullanıcının izin verdiği repolar", her seferinde TAZE
// ---------------------------------------------------------------------------

export interface InstalledRepoItem {
  id: number
  name: string
  fullName: string
  owner: string
  private: boolean
  htmlUrl: string
  defaultBranch: string
  description: string | null
  installationId: string
  accountLogin: string
}

interface RawInstallationRepo {
  id: number
  name: string
  full_name: string
  owner: { login: string }
  private: boolean
  html_url: string
  default_branch: string
  description: string | null
}

/** Tek bir kurulumun GitHub'da o an erişebildiği depoları listeler (sayfalanmış). */
export async function listInstallationRepositories(
  installationId: string,
  accountLogin: string
): Promise<InstalledRepoItem[]> {
  const token = await getInstallationAccessToken(installationId)
  const repos: InstalledRepoItem[] = []
  let page = 1

  for (;;) {
    const res = await githubFetch(`/installation/repositories?per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await githubJsonOrThrow<{ repositories: RawInstallationRepo[] }>(
      res,
      "Kurulumun depoları listelenemedi"
    )
    for (const r of data.repositories) {
      repos.push({
        id: r.id,
        name: r.name,
        fullName: r.full_name,
        owner: r.owner?.login ?? "",
        private: r.private,
        htmlUrl: r.html_url,
        defaultBranch: r.default_branch,
        description: r.description,
        installationId,
        accountLogin,
      })
    }
    if (data.repositories.length < 100) break
    page += 1
  }
  return repos
}

/** Panele bağlı TÜM kurulumlar üzerinden birleşik depo listesi — site GitHub kartındaki seçici için. */
export async function listAllInstalledRepositories(): Promise<InstalledRepoItem[]> {
  const installations = await prisma.gitHubInstallation.findMany()
  const results = await Promise.allSettled(
    installations.map((inst) => listInstallationRepositories(inst.installationId, inst.accountLogin))
  )
  const repos: InstalledRepoItem[] = []
  for (const r of results) {
    if (r.status === "fulfilled") repos.push(...r.value)
    // Bir kurulum (ör. GitHub'da elle kaldırılmış) hata verirse diğerlerini etkilemesin.
  }
  return repos
}
