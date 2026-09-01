export type SiteType =
  | "wordpress"
  | "php"
  | "nodejs"
  | "static"
  | "python"
  | "proxy"

export interface SiteTypeInfo {
  type: SiteType
  label: string
  /** Short mono abbreviation used for the neutral type badge (never a status color). */
  abbr: string
  description: string
  /** Only nodejs/python sites get a panel-managed systemd process. Everything else is Nginx-only. */
  managed: boolean
}

export const SITE_TYPES: SiteTypeInfo[] = [
  {
    type: "wordpress",
    label: "WordPress",
    abbr: "WP",
    description: "PHP + MySQL ile hazır WordPress kurulumu.",
    managed: false,
  },
  {
    type: "php",
    label: "PHP",
    abbr: "PHP",
    description: "Genel amaçlı PHP uygulaması (Laravel, Symfony vb.).",
    managed: false,
  },
  {
    type: "nodejs",
    label: "Node.js",
    abbr: "JS",
    description: "systemd ile yönetilen Node.js servisi.",
    managed: true,
  },
  {
    type: "static",
    label: "Statik Site",
    abbr: "HTML",
    description: "Yalnızca HTML/CSS/JS dosyalarından oluşan statik site.",
    managed: false,
  },
  {
    type: "python",
    label: "Python",
    abbr: "PY",
    description: "systemd ile yönetilen Python (WSGI/ASGI) servisi.",
    managed: true,
  },
  {
    type: "proxy",
    label: "Ters Proxy",
    abbr: "RP",
    description: "Harici bir adrese yönlendiren Nginx ters proxy.",
    managed: false,
  },
]

export type SiteStatus = "active" | "running" | "stopped" | "provisioning" | "error"

export interface Site {
  id: string
  domain: string
  type: SiteType
  status: SiteStatus
  cpu?: number
  ram?: number
}

export const MOCK_SITES: Site[] = [
  { id: "1", domain: "blog.example.com", type: "wordpress", status: "active" },
  { id: "2", domain: "app.example.com", type: "php", status: "active" },
  {
    id: "3",
    domain: "api.example.com",
    type: "nodejs",
    status: "running",
    cpu: 12,
    ram: 34,
  },
  { id: "4", domain: "docs.example.com", type: "static", status: "active" },
  {
    id: "5",
    domain: "worker.example.com",
    type: "python",
    status: "stopped",
    cpu: 0,
    ram: 0,
  },
  { id: "6", domain: "old.example.com", type: "proxy", status: "active" },
]
