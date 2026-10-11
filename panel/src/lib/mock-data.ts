export type SiteType = "static" | "proxy"

export interface SiteTypeInfo {
  type: SiteType
  label: string
  /** Short mono abbreviation used for the neutral type badge (never a status color). */
  abbr: string
  description: string
  /** Süreci olan tür (durum "Çalışıyor" gösterilir); statik site yalnızca Nginx. */
  managed: boolean
}

/** v1.4.0: yalnızca iki tür — Uygulama (ters proxy, çoğunlukla Docker Compose) ve Statik. */
export const SITE_TYPES: SiteTypeInfo[] = [
  {
    type: "proxy",
    label: "Uygulama",
    abbr: "APP",
    description: "Nginx bir porta yönlendirir; uygulama Docker Compose ile ya da kendi yönteminle çalışır.",
    managed: true,
  },
  {
    type: "static",
    label: "Statik Site",
    abbr: "HTML",
    description: "HTML/CSS/JS dosyaları — elle yükleme ya da Git + derleme.",
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
  { id: "1", domain: "app.example.com", type: "proxy", status: "running" },
  { id: "2", domain: "docs.example.com", type: "static", status: "active" },
]
