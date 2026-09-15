"use client"

import { useCallback, useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { ArrowLeft, Loader2, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useTranslation } from "@/components/language-provider"
import { EDITOR_FONT_FAMILY, EDITOR_FONT_SIZE } from "@/lib/editor-font"
import { languageForFileName } from "@/lib/file-templates"

// Monaco tarayıcıda (CDN'den) çalışır — SSR'da anlamı yok.
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[65vh] items-center justify-center text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  ),
})

async function parseError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  return data?.error ?? `İstek başarısız oldu (${res.status}).`
}

/**
 * Tek bir dosyanın Monaco editörü — site detay sayfasının "Dosyalar"
 * sekmesinin içinde açılır (2026-09-15: eskiden ayrı bir sayfaydı). Geri
 * dönüş `onBack` ile; kaydedilmemiş değişiklik varsa onay ister. Font: tema
 * fontu DEĞİL, kod fontu (bkz. src/lib/editor-font.ts + globals.css).
 */
export function SiteFileEditor({ siteId, path, onBack }: { siteId: string; path: string; onBack: () => void }) {
  const { lang } = useTranslation()
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
      const res = await fetch(`/api/sites/${siteId}/files/content?path=${encodeURIComponent(path)}`, { cache: "no-store" })
      if (!res.ok) {
        setLoadError(await parseError(res))
        return
      }
      const data = (await res.json()) as { content: string }
      setContent(data.content)
      setDirty(false)
      setSavedAt(null)
    } catch {
      setLoadError(lang === "en" ? "Could not reach the server." : "Sunucuya bağlanılamadı.")
    } finally {
      setLoading(false)
    }
  }, [siteId, path, lang])

  useEffect(() => {
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])

  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (!dirty) return
      e.preventDefault()
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [dirty])

  const handleSave = useCallback(async () => {
    if (saving || loading || loadError) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/sites/${siteId}/files/content?path=${encodeURIComponent(path)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) {
        setSaveError(await parseError(res))
        return
      }
      setDirty(false)
      setSavedAt(new Date())
    } catch {
      setSaveError(lang === "en" ? "Could not reach the server." : "Sunucuya bağlanılamadı.")
    } finally {
      setSaving(false)
    }
  }, [siteId, path, content, saving, loading, loadError, lang])

  // Ctrl/Cmd+S → kaydet (tarayıcının "sayfayı kaydet" diyaloğu yerine).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        void handleSave()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [handleSave])

  function handleBack() {
    if (dirty && !window.confirm(lang === "en" ? "There are unsaved changes. Leave anyway?" : "Kaydedilmemiş değişiklikler var. Yine de çıkılsın mı?")) return
    onBack()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={handleBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground cursor-pointer">
            <ArrowLeft className="size-4" />
            {lang === "en" ? "Back to files" : "Dosyalara dön"}
          </button>
          <h2 className="mt-1.5 font-mono text-base font-semibold text-foreground break-all">{path}</h2>
        </div>
        <div className="flex items-center gap-3">
          {dirty && <span className="text-xs text-warning">{lang === "en" ? "Unsaved" : "Kaydedilmedi"}</span>}
          {!dirty && savedAt && (
            <span className="text-xs text-success">
              {lang === "en" ? "Saved" : "Kaydedildi"} ({savedAt.toLocaleTimeString(lang === "en" ? "en-US" : "tr-TR")})
            </span>
          )}
          <Button onClick={handleSave} disabled={saving || loading || !!loadError} title="Ctrl/⌘ + S">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {lang === "en" ? "Save" : "Kaydet"}
          </Button>
        </div>
      </div>

      {saveError && <p className="text-sm text-destructive">{saveError}</p>}

      {loadError ? (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">{loadError}</CardContent>
        </Card>
      ) : loading ? (
        <div className="flex h-[65vh] items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <Card className="overflow-hidden py-0">
          <MonacoEditor
            height="65vh"
            language={languageForFileName(path)}
            value={content}
            theme="vs-dark"
            onChange={(value) => {
              setContent(value ?? "")
              setDirty(true)
            }}
            options={{
              minimap: { enabled: false },
              fontSize: EDITOR_FONT_SIZE,
              fontFamily: EDITOR_FONT_FAMILY,
              fontLigatures: false,
              wordWrap: "on",
              automaticLayout: true,
              scrollBeyondLastLine: false,
            }}
          />
        </Card>
      )}
    </div>
  )
}
