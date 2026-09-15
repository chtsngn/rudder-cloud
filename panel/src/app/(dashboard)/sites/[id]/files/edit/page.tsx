"use client"

import { useEffect } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"

/**
 * Eski `/sites/[id]/files/edit?path=` adresi — editör artık site detay
 * sayfasının "Dosyalar" sekmesinde açılıyor (2026-09-15). Yönlendirir.
 */
export default function SiteFileEditPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const file = searchParams.get("path") ?? ""
    router.replace(`/sites/${params.id}?tab=files${file ? `&file=${encodeURIComponent(file)}` : ""}`)
  }, [params.id, router, searchParams])

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  )
}
