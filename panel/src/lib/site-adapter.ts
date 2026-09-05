/**
 * Adapts between the DB-facing `Site` shape (Prisma's `SiteType/SiteStatus`
 * enums, a JSON `config` blob) and the UI-facing `Site` shape from
 * `@/lib/mock-data` that the existing dashboard/site-card components render.
 *
 * Kept separate from mock-data.ts so that file can stay untouched as a seed
 * reference, per the project's mock-data convention.
 */
import { SITE_TYPES, type Site, type SiteType } from "@/lib/mock-data"

/** Mirrors the Prisma `SiteType` enum values (kept as plain strings so this
 * file has no dependency on `@prisma/client`, which must never be bundled
 * into client components). */
export type DbSiteType =
  | "WORDPRESS"
  | "PHP"
  | "NODEJS"
  | "STATIC"
  | "PYTHON"
  | "REVERSE_PROXY"
  | "DOCKER"

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

/**
 * The DB status enum has no notion of a site "type" — a single ACTIVE status
 * covers both "served directly by Nginx" (unmanaged types) and "systemd
 * process is up" (managed types). The UI distinguishes these with different
 * labels, so the mapping needs to know whether the site is managed.
 */
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
export type DbProcessManager = "SYSTEMD" | "DOCKER_COMPOSE" | "PM2" | "CUSTOM_SCRIPT"

/** Shape returned by `GET /api/sites` and `GET /api/sites/[id]`. Includes the
 * Aşama B (git pull + restart) fields — present on every site row (with
 * defaults) even though they're only meaningful for managed (NODEJS/PYTHON)
 * types and REVERSE_PROXY (CloudPanel-tarzı "git clone + PM2/Docker
 * Compose ile ayağa kaldır" akışı). */
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
  autoPullEnabled: boolean
  autoPullIntervalSeconds: number
  lastPullAt: string | null
  lastPullOk: boolean | null
  lastPullError: string | null
  processManager: DbProcessManager
  customRestartCommand: string | null
  createdAt: string
  updatedAt: string
}

export function apiSiteToUiSite(api: ApiSite): Site {
  const type = dbTypeToUiType(api.type)
  const typeInfo = SITE_TYPES.find((t) => t.type === type)
  const managed = typeInfo?.managed ?? false
  const cfg = (api.config ?? {}) as Record<string, unknown>

  return {
    id: api.id,
    domain: api.domain,
    type,
    status: dbStatusToUiStatus(api.status, managed),
    cpu: typeof cfg.cpu === "number" ? cfg.cpu : managed ? 0 : undefined,
    ram: typeof cfg.ram === "number" ? cfg.ram : managed ? 0 : undefined,
  }
}
