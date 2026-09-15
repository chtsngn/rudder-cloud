"use client"

import { useEffect } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"

/**
 * Eski `/sites/[id]/files[?path=]` adresi — dosya yöneticisi artık site detay
 * sayfasının "Dosyalar" sekmesinde (2026-09-15). Eski bağlantılar/yer imleri
 * kırılmasın diye sekmeye yönlendirir.
 */
export default function SiteFilesPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const dir = searchParams.get("path") ?? ""
    router.replace(`/sites/${params.id}?tab=files${dir ? `&dir=${encodeURIComponent(dir)}` : ""}`)
  }, [params.id, router, searchParams])

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  )
}
