/**
 * Adapts between the DB-facing `Site` shape (Prisma's `SiteType/SiteStatus`
 * enums, a JSON `config` blob) and the UI-facing `Site` shape from
 * `@/lib/mock-data` that the dashboard/site-card components render.
 *
 * Kept separate from mock-data.ts so that file can stay untouched as a seed
 * reference, per the project's mock-data convention.
 */
import { SITE_TYPES, type Site, type SiteType } from "@/lib/mock-data"

/** Mirrors the Prisma `SiteType` enum values (plain strings — `@prisma/client`
 * must never be bundled into client components). */
export type DbSiteType = "WORDPRESS" | "PHP" | "NODEJS" | "STATIC" | "PYTHON" | "REVERSE_PROXY" | "DOCKER"

/** Mirrors the Prisma `SiteStatus` enum values. */
export type DbSiteStatus = "ACTIVE" | "PROVISIONING" | "STOPPED" | "FAILED"

const UI_TO_DB_TYPE: Record<SiteType, DbSiteType> = {
  wordpress: "WORDPRESS",
  php: "PHP",
  nodejs: "NODEJS",
  static: "STATIC",
  python: "PYTHON",
  proxy: "REVERSE_PROXY",
  docker: "DOCKER",
}

const DB_TO_UI_TYPE: Record<DbSiteType, SiteType> = {
  WORDPRESS: "wordpress",
  PHP: "php",
  NODEJS: "nodejs",
  STATIC: "static",
  PYTHON: "python",
  REVERSE_PROXY: "proxy",
  DOCKER: "docker",
}

export function uiTypeToDbType(type: SiteType): DbSiteType {
  return UI_TO_DB_TYPE[type]
}

export function dbTypeToUiType(type: string): SiteType {
  return DB_TO_UI_TYPE[type as DbSiteType] ?? "static"
}

/** Git bağlanabilen / deploy hattı olan tipler (bkz. src/lib/git.ts GIT_PULL_TYPES). */
export const GIT_CAPABLE_DB_TYPES: DbSiteType[] = ["NODEJS", "PYTHON", "REVERSE_PROXY", "DOCKER"]
export const GIT_CAPABLE_UI_TYPES: SiteType[] = ["nodejs", "python", "proxy", "docker"]
/** Panelin kendi systemd birimi olan tipler. */
export const SYSTEMD_DB_TYPES: DbSiteType[] = ["NODEJS", "PYTHON"]

export function dbStatusToUiStatus(status: string, managed: boolean): Site["status"] {
  switch (status as DbSiteStatus) {
    case "ACTIVE":
      return managed ? "running" : "active"
    case "STOPPED":
      return "stopped"
    case "FAILED":
      return "error"
    case "PROVISIONING":
    default:
      return "provisioning"
  }
}

/** Mirrors the Prisma `ProcessManager` enum values. */
export type DbProcessManager = "SYSTEMD" | "DOCKER_COMPOSE" | "PM2" | "CUSTOM_SCRIPT" | "NONE"

export const PROCESS_MANAGER_LABELS: Record<DbProcessManager, { tr: string; en: string }> = {
  NONE: { tr: "Yok (panel süreci yönetmiyor)", en: "None (panel does not manage the process)" },
  SYSTEMD: { tr: "systemd (panel yönetiyor)", en: "systemd (managed by panel)" },
  DOCKER_COMPOSE: { tr: "Docker Compose (up -d --build)", en: "Docker Compose (up -d --build)" },
  PM2: { tr: "PM2 (root pm2 daemon'ı)", en: "PM2 (root pm2 daemon)" },
  CUSTOM_SCRIPT: { tr: "Özel betik", en: "Custom script" },
}

/** Shape returned by `GET /api/sites` and `GET /api/sites/[id]`. */
export interface ApiSite {
  id: string
  domain: string
  type: string
  status: string
  sslEnabled: boolean
  sslStatus: string
  sslLastError: string | null
  config: Record<string, unknown> | null
  repoUrl: string | null
  gitBranch: string
  githubRepoFullName: string | null
  githubInstallationId: string | null
  autoPullEnabled: boolean
  autoPullIntervalSeconds: number
  lastPullAt: string | null
  lastPullOk: boolean | null
  lastPullError: string | null
  processManager: DbProcessManager
  customRestartCommand: string | null
  deployCommand: string | null
  pm2ProcessName: string | null
  lastDeployAt: string | null
  lastDeployOk: boolean | null
  lastDeployError: string | null
  lastDeployOutput: string | null
  deployHookCreatedAt: string | null
  deployKeyName: string | null
  deployKeyPublicKey: string | null
  deployKeyFingerprint: string | null
  createdAt: string
  updatedAt: string
}

export function apiSiteToUiSite(api: ApiSite): Site {
  const type = dbTypeToUiType(api.type)
  const typeInfo = SITE_TYPES.find((t) => t.type === type)
  const managed = typeInfo?.managed ?? false

  return {
    id: api.id,
    domain: api.domain,
    type,
    status: dbStatusToUiStatus(api.status, managed),
    // CPU/RAM ölçülmüyor (2026-09-15: eski "her zaman 0" sahte göstergeler
    // kaldırıldı) — gerçek durum için /api/sites/[id]/process-status.
  }
}

export function sitePortFromConfig(config: Record<string, unknown> | null | undefined): number | null {
  const raw = config?.port
  const port = typeof raw === "number" ? raw : typeof raw === "string" ? Number.parseInt(raw, 10) : NaN
  return Number.isInteger(port) ? port : null
}
