"use client"

import { useCallback, useEffect, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Loader2, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { languageForFileName } from "@/lib/file-templates"

// Monaco'nun kendisi tarayıcıda (CDN'den, bkz. @monaco-editor/react'in
// varsayılan yükleyicisi) çalışıyor — SSR'da anlamı yok, bu yüzden dynamic
// import + ssr:false.
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[70vh] items-center justify-center text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  ),
})

async function parseError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  return data?.error ?? `İstek başarısız oldu (${res.status}).`
}

export default function SiteFileEditPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const siteId = params.id
  const relPath = searchParams.get("path") ?? ""

  const [content, setContent] = useState("")
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(
        `/api/sites/${siteId}/files/content?path=${encodeURIComponent(relPath)}`,
        { cache: "no-store" }
      )
      if (!res.ok) {
        setLoadError(await parseError(res))
        return
      }
      const data = (await res.json()) as { content: string }
      setContent(data.content)
      setDirty(false)
    } catch {
      setLoadError("Sunucuya bağlanılamadı.")
    } finally {
      setLoading(false)
    }
  }, [siteId, relPath])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!relPath) {
        setLoadError("Düzenlenecek dosya belirtilmedi.")
        setLoading(false)
        return
      }
      load()
    }, 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relPath])

  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (!dirty) return
      e.preventDefault()
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [dirty])

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(
        `/api/sites/${siteId}/files/content?path=${encodeURIComponent(relPath)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        }
      )
      if (!res.ok) {
        setSaveError(await parseError(res))
        return
      }
      setDirty(false)
      setSavedAt(new Date())
    } catch {
      setSaveError("Sunucuya bağlanılamadı.")
    } finally {
      setSaving(false)
    }
  }

  const parentPath = relPath.split("/").slice(0, -1).join("/")

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={`/sites/${siteId}/files?path=${encodeURIComponent(parentPath)}`}
            onClick={(e) => {
              if (dirty && !window.confirm("Kaydedilmemiş değişiklikler var. Yine de çıkılsın mı?")) {
                e.preventDefault()
                return
              }
              router.push(`/sites/${siteId}/files`)
            }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Dosyalara dön
          </Link>
          <h1 className="mt-2 font-mono text-lg font-semibold text-foreground">{relPath}</h1>
        </div>
        <div className="flex items-center gap-3">
          {dirty && <span className="text-xs text-warning">Kaydedilmedi</span>}
          {!dirty && savedAt && (
            <span className="text-xs text-success">
              Kaydedildi ({savedAt.toLocaleTimeString("tr-TR")})
            </span>
          )}
          <Button onClick={handleSave} disabled={saving || loading || !!loadError}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Kaydet
          </Button>
        </div>
      </div>

      {saveError && <p className="text-sm text-destructive">{saveError}</p>}

      {loadError ? (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">{loadError}</CardContent>
        </Card>
      ) : loading ? (
        <div className="flex h-[70vh] items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <Card className="overflow-hidden py-0">
          <MonacoEditor
            height="70vh"
            language={languageForFileName(relPath)}
            value={content}
            theme="vs-dark"
            onChange={(value) => {
              setContent(value ?? "")
              setDirty(true)
            }}
            options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: "on" }}
          />
        </Card>
      )}
    </div>
  )
}
