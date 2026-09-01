"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { useCurrentUser } from "@/hooks/use-current-user"

/**
 * `/users` ve `/audit` sayfalarını SADECE SUPER_ADMIN'e açık tutan istemci
 * tarafı koruma. Bu TEK BAŞINA bir güvenlik sınırı DEĞİL — gerçek koruma
 * her zaman ilgili API route'larının kendi `isSuperAdmin()` kontrolünde
 * (bkz. src/lib/permissions.ts); bu bileşen yalnızca bir MEMBER'ın bu
 * sayfaları hiç görmemesini/anasayfaya yönlendirilmesini sağlıyor.
 */
export function SuperAdminGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useCurrentUser()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user?.role !== "SUPER_ADMIN") {
      router.replace("/")
    }
  }, [loading, user, router])

  if (loading || user?.role !== "SUPER_ADMIN") {
    return (
      <div className="flex h-[50vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Yükleniyor...
      </div>
    )
  }

  return <>{children}</>
}
