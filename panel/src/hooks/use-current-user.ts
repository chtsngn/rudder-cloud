"use client"

import { useEffect, useState } from "react"

export interface CurrentUser {
  id: string
  username: string
  role: "SUPER_ADMIN" | "MEMBER"
}

/**
 * `GET /api/auth/me`'yi sarmalayan küçük bir hook — sidebar'daki gerçek
 * kullanıcı/rol göstergesi VE SUPER_ADMIN-only sayfaların (Kullanıcılar,
 * Denetim Kaydı, Erişim kartı) istemci tarafı koruması bunu kullanıyor.
 * `loading === false && user === null` durumu "oturum yok/istek başarısız"
 * anlamına gelir — middleware zaten oturumsuz erişimi engellediği için bu
 * pratikte yalnızca ağ hatası gibi kenar durumlarda görülür.
 */
export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" })
        if (cancelled) return
        setUser(res.ok ? ((await res.json()) as CurrentUser) : null)
      } catch {
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    // bkz. src/app/(dashboard)/settings/page.tsx → aynı desen
    // (react-hooks/set-state-in-effect kuralına takılmamak için).
    const timer = setTimeout(() => {
      load()
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  return { user, loading }
}
