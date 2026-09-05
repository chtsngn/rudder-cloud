"use client"

import { useEffect, useState } from "react"

import { useTranslation } from "@/components/language-provider"

interface UsedPort {
  port: number
  process: string | null
  source: "site" | "docker" | "system"
  label: string | null
}

interface PortsResponse {
  used: UsedPort[]
  suggestions: number[]
}

const MAX_SHOWN = 10

/**
 * Port giren her yerde (site sihirbazı, ters proxy hedef adresi vb.) o an
 * sunucuda dinlenen portları küçük bir ipucu olarak gösterir — `GET
 * /api/system/ports`'u (Aşama A, Port Görüntüleyici) yeniden kullanır,
 * kendi port tespitini YAPMAZ. Bu uç nokta bilinçli olarak SUPER_ADMIN-only
 * (dinlenen portlar/süreç adları sistem bilgisi sızdırır) — ama zaten yalnızca
 * SUPER_ADMIN site oluşturabildiği için (bkz. docs/ARCHITECTURE.md Aşama G)
 * bu sihirbazda ek bir bilgi sızıntısı değil. Bir MEMBER bir ters proxy'nin
 * hedef adresini düzenlerken bu isteği yaparsa 403 alır — o durumda ipucu
 * SESSİZCE gizlenir, hata gösterilmez (site oluşturmadaki kadar kritik değil).
 */
export function BusyPortsHint() {
  const { lang } = useTranslation()
  const [data, setData] = useState<PortsResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/system/ports", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: PortsResponse | null) => {
        if (!cancelled && json) setData(json)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (!data || data.used.length === 0) return null

  const shown = data.used.slice(0, MAX_SHOWN)
  const hiddenCount = data.used.length - shown.length
  const suggestion = data.suggestions[0]

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
      <span className="font-semibold shrink-0">
        {lang === "en" ? "Busy ports:" : "Meşgul portlar:"}
      </span>
      {shown.map((u) => (
        <span
          key={u.port}
          title={u.label ?? u.process ?? undefined}
          className="font-mono px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-[#101c38] border border-slate-200 dark:border-[#1e3568] text-slate-700 dark:text-slate-300"
        >
          {u.port}
          {u.label ? <span className="text-slate-400 dark:text-slate-500">:{u.label}</span> : null}
        </span>
      ))}
      {hiddenCount > 0 && <span>+{hiddenCount}</span>}
      {suggestion !== undefined && (
        <span className="ml-1 font-semibold text-emerald-600 dark:text-emerald-400">
          {lang === "en" ? `free: ${suggestion}` : `boş: ${suggestion}`}
        </span>
      )}
    </div>
  )
}
