"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  File as FileIcon,
  FileCode,
  Folder,
  FolderPlus,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { FILE_TEMPLATES } from "@/lib/file-templates"
import { CustomSelect } from "@/components/ui/custom-select"
import { cn } from "@/lib/utils"
import { useTranslation } from "@/components/language-provider"

interface SiteEntry {
  name: string
  path: string
  type: "file" | "dir" | "other"
  size: number
  modifiedAt: string
}

interface EnvOverview {
  files: SiteEntry[]
  availableExample: string | null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

async function parseError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  return data?.error ?? `İstek başarısız oldu (${res.status}).`
}

function triggerDownload(url: string) {
  const a = document.createElement("a")
  a.href = url
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/**
 * Dosya yöneticisi (Aşama C) — 2026-09-15'ten itibaren site detay sayfasının
 * "Dosyalar" sekmesinin İÇİNDE render edilir (eskiden ayrı bir sayfaydı).
 * Bir dosyaya tıklanınca `onOpenFile(path)` çağrılır; sekme editörü aynı
 * yerde açar. Klasör değişimi `onPathChange` ile üst bileşene bildirilir
 * (URL'e yazılsın, yenilemede aynı klasöre dönülsün diye).
 */
export function SiteFileManager({
  siteId,
  initialPath = "",
  onOpenFile,
  onPathChange,
}: {
  siteId: string
  initialPath?: string
  onOpenFile: (path: string) => void
  onPathChange?: (path: string) => void
}) {
  const { t, lang } = useTranslation()

  const [currentPath, setCurrentPath] = useState(initialPath)
  const [entries, setEntries] = useState<SiteEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [dirError, setDirError] = useState<string | null>(null)

  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [newFileOpen, setNewFileOpen] = useState(false)
  const [newFileName, setNewFileName] = useState("")
  const [newFileTemplate, setNewFileTemplate] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [deleting, setDeleting] = useState(false)
  const [rowBusy, setRowBusy] = useState<string | null>(null)

  const [envOverview, setEnvOverview] = useState<EnvOverview | null>(null)
  const [envError, setEnvError] = useState<string | null>(null)
  const [envCopying, setEnvCopying] = useState(false)

  const loadDir = useCallback(
    async (path: string) => {
      setLoading(true)
      setDirError(null)
      try {
        const res = await fetch(`/api/sites/${siteId}/files?path=${encodeURIComponent(path)}`, { cache: "no-store" })
        if (!res.ok) {
          setDirError(await parseError(res))
          return
        }
        const data = (await res.json()) as { path: string; entries: SiteEntry[] }
        setEntries(data.entries)
        setSelected(new Set())
      } catch {
        setDirError(lang === "en" ? "Could not reach the server." : "Sunucuya bağlanılamadı.")
      } finally {
        setLoading(false)
      }
    },
    [siteId, lang]
  )

  const loadEnv = useCallback(async () => {
    setEnvError(null)
    try {
      const res = await fetch(`/api/sites/${siteId}/env`, { cache: "no-store" })
      if (!res.ok) {
        setEnvError(await parseError(res))
        return
      }
      setEnvOverview((await res.json()) as EnvOverview)
    } catch {
      setEnvError(lang === "en" ? "Could not reach the server." : "Sunucuya bağlanılamadı.")
    }
  }, [siteId, lang])

  useEffect(() => {
    const timer = setTimeout(() => {
      loadDir(initialPath)
      loadEnv()
    }, 0)
    return () => clearTimeout(timer)
    // Yalnızca site değişince ilk yükleme — klasör gezintisi navigateTo ile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId])

  function navigateTo(path: string) {
    setCurrentPath(path)
    onPathChange?.(path)
    loadDir(path)
  }

  function toggleSelected(path: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim()
    if (!name) return
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch(`/api/sites/${siteId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: currentPath, name, kind: "folder" }),
      })
      if (!res.ok) {
        setCreateError(await parseError(res))
        return
      }
      setNewFolderName("")
      setNewFolderOpen(false)
      await loadDir(currentPath)
    } catch {
      setCreateError(lang === "en" ? "Could not reach the server." : "Sunucuya bağlanılamadı.")
    } finally {
      setCreating(false)
    }
  }

  async function handleCreateFile() {
    const name = newFileName.trim()
    if (!name) return
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch(`/api/sites/${siteId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: currentPath, name, kind: "file", template: newFileTemplate || undefined }),
      })
      if (!res.ok) {
        setCreateError(await parseError(res))
        return
      }
      setNewFileName("")
      setNewFileTemplate("")
      setNewFileOpen(false)
      await loadDir(currentPath)
      if (currentPath === "" && name.startsWith(".env")) loadEnv()
    } catch {
      setCreateError(lang === "en" ? "Could not reach the server." : "Sunucuya bağlanılamadı.")
    } finally {
      setCreating(false)
    }
  }

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    setUploading(true)
    setUploadError(null)
    try {
      const formData = new FormData()
      for (const file of Array.from(fileList)) formData.append("files", file)
      const res = await fetch(`/api/sites/${siteId}/files/upload?path=${encodeURIComponent(currentPath)}`, {
        method: "POST",
        body: formData,
      })
      const data = (await res.json().catch(() => null)) as { uploaded: unknown[]; errors: { name: string; error: string }[] } | null
      if (!res.ok && !data) {
        setUploadError(lang === "en" ? "Upload failed." : "Yükleme başarısız oldu.")
        return
      }
      if (data && data.errors.length > 0) {
        setUploadError(data.errors.map((e) => `${e.name}: ${e.error}`).join(" · "))
      }
      await loadDir(currentPath)
    } catch {
      setUploadError(lang === "en" ? "Could not reach the server." : "Sunucuya bağlanılamadı.")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleDeleteOne(entryPath: string) {
    if (!window.confirm(lang === "en" ? `Delete "${entryPath}"? This cannot be undone.` : `"${entryPath}" silinsin mi? Bu işlem geri alınamaz.`)) return
    setRowBusy(entryPath)
    try {
      const res = await fetch(`/api/sites/${siteId}/files?path=${encodeURIComponent(entryPath)}`, { method: "DELETE" })
      if (!res.ok) {
        setDirError(await parseError(res))
        return
      }
      await loadDir(currentPath)
      if (currentPath === "" && entryPath.startsWith(".env")) loadEnv()
    } catch {
      setDirError(lang === "en" ? "Could not reach the server." : "Sunucuya bağlanılamadı.")
    } finally {
      setRowBusy(null)
    }
  }

  async function handleDeleteSelected() {
    if (selected.size === 0) return
    if (!window.confirm(lang === "en" ? `Delete ${selected.size} items? This cannot be undone.` : `${selected.size} öğe silinsin mi? Bu işlem geri alınamaz.`)) return
    setDeleting(true)
    try {
      for (const p of selected) {
        const res = await fetch(`/api/sites/${siteId}/files?path=${encodeURIComponent(p)}`, { method: "DELETE" })
        if (!res.ok) setDirError(await parseError(res))
      }
      await loadDir(currentPath)
      if (currentPath === "") loadEnv()
    } finally {
      setDeleting(false)
    }
  }

  function handleDownloadSelected() {
    if (selected.size === 0) return
    triggerDownload(`/api/sites/${siteId}/files/download?paths=${encodeURIComponent(Array.from(selected).join(","))}`)
  }

  function handleDownloadOne(entryPath: string) {
    triggerDownload(`/api/sites/${siteId}/files/download?paths=${encodeURIComponent(entryPath)}`)
  }

  async function handleEnvCopy(fromName: string) {
    setEnvCopying(true)
    setEnvError(null)
    try {
      const res = await fetch(`/api/sites/${siteId}/env/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromName }),
      })
      if (!res.ok) {
        setEnvError(await parseError(res))
        return
      }
      await loadEnv()
      if (currentPath === "") await loadDir("")
    } catch {
      setEnvError(lang === "en" ? "Could not reach the server." : "Sunucuya bağlanılamadı.")
    } finally {
      setEnvCopying(false)
    }
  }

  const breadcrumbSegments = currentPath ? currentPath.split("/") : []

  return (
    <div className="space-y-6">
      {envOverview && (envOverview.files.length > 0 || envOverview.availableExample) && (
        <Card>
          <CardHeader>
            <CardTitle>{lang === "en" ? ".env Files" : ".env Dosyaları"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {envError && <p className="text-sm text-destructive">{envError}</p>}
            {envOverview.files.length > 0 && (
              <ul className="space-y-1.5">
                {envOverview.files.map((f) => (
                  <li key={f.path} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-foreground">{f.name}</span>
                    <Button variant="ghost" size="sm" onClick={() => onOpenFile(f.path)}>
                      <Pencil className="size-3.5" />
                      {t("common.edit")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {envOverview.availableExample && (
              <div className="flex items-center justify-between rounded-lg border border-dashed border-border p-3 text-sm">
                <span className="text-muted-foreground">
                  <span className="font-mono text-foreground">.env</span> {lang === "en" ? "not found —" : "yok —"}{" "}
                  <span className="font-mono">{envOverview.availableExample}</span> {lang === "en" ? "exists." : "mevcut."}
                </span>
                <Button size="sm" variant="outline" disabled={envCopying} onClick={() => handleEnvCopy(envOverview.availableExample!)}>
                  {envCopying && <Loader2 className="size-3.5 animate-spin" />}
                  {lang === "en" ? "Copy from example" : "Örnekten kopyala"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <nav className="flex flex-wrap items-center gap-1 text-sm">
              <button type="button" className="text-muted-foreground hover:text-foreground cursor-pointer" onClick={() => navigateTo("")}>
                /
              </button>
              {breadcrumbSegments.map((seg, i) => {
                const segPath = breadcrumbSegments.slice(0, i + 1).join("/")
                return (
                  <span key={segPath} className="flex items-center gap-1">
                    <span className="text-muted-foreground">/</span>
                    <button
                      type="button"
                      className={cn("hover:text-foreground cursor-pointer", i === breadcrumbSegments.length - 1 ? "font-medium text-foreground" : "text-muted-foreground")}
                      onClick={() => navigateTo(segPath)}
                    >
                      {seg}
                    </button>
                  </span>
                )
              })}
            </nav>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => loadDir(currentPath)} title={t("common.refresh")}>
                <RefreshCw className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setNewFolderOpen((v) => !v)
                  setNewFileOpen(false)
                }}
              >
                <FolderPlus className="size-3.5" />
                {lang === "en" ? "New Folder" : "Yeni Klasör"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setNewFileOpen((v) => !v)
                  setNewFolderOpen(false)
                }}
              >
                <Plus className="size-3.5" />
                {lang === "en" ? "New File" : "Yeni Dosya"}
              </Button>
              <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                {lang === "en" ? "Upload" : "Yükle"}
              </Button>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {(newFolderOpen || newFileOpen) && (
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
              {newFolderOpen && (
                <>
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-muted-foreground">{lang === "en" ? "Folder name" : "Klasör adı"}</label>
                    <Input
                      autoFocus
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                      placeholder={lang === "en" ? "new-folder" : "yeni-klasor"}
                    />
                  </div>
                  <Button size="sm" disabled={creating || !newFolderName.trim()} onClick={handleCreateFolder}>
                    {creating && <Loader2 className="size-3.5 animate-spin" />}
                    {t("common.create")}
                  </Button>
                </>
              )}
              {newFileOpen && (
                <>
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-muted-foreground">{lang === "en" ? "File name" : "Dosya adı"}</label>
                    <Input
                      autoFocus
                      value={newFileName}
                      onChange={(e) => setNewFileName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateFile()}
                      placeholder="file.js"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{lang === "en" ? "Template (optional)" : "Şablon (opsiyonel)"}</label>
                    <CustomSelect
                      value={newFileTemplate}
                      onChange={setNewFileTemplate}
                      options={[
                        { value: "", label: lang === "en" ? "Empty file" : "Boş dosya" },
                        ...FILE_TEMPLATES.map((tpl) => ({ value: tpl.extension, label: `${tpl.label} (${tpl.extension})` })),
                      ]}
                      size="sm"
                      className="min-w-[150px]"
                    />
                  </div>
                  <Button size="sm" disabled={creating || !newFileName.trim()} onClick={handleCreateFile}>
                    {creating && <Loader2 className="size-3.5 animate-spin" />}
                    {t("common.create")}
                  </Button>
                </>
              )}
            </div>
          )}
          {createError && <p className="text-sm text-destructive">{createError}</p>}
          {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}

          {selected.size > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
              <span>
                {selected.size} {lang === "en" ? "items selected" : "öğe seçildi"}
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={handleDownloadSelected}>
                  {lang === "en" ? "Download (zip)" : "İndir (zip)"}
                </Button>
                <Button size="sm" variant="destructive" disabled={deleting} onClick={handleDeleteSelected}>
                  {deleting && <Loader2 className="size-3.5 animate-spin" />}
                  {t("common.delete")}
                </Button>
              </div>
            </div>
          )}

          {dirError && <p className="text-sm text-destructive">{dirError}</p>}

          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{lang === "en" ? "This directory is empty." : "Bu dizin boş."}</p>
          ) : (
            <div className="divide-y divide-border">
              {entries.map((entry) => (
                <div key={entry.path} className="flex items-center gap-3 py-2.5 text-sm">
                  <input type="checkbox" checked={selected.has(entry.path)} onChange={() => toggleSelected(entry.path)} className="size-4" />
                  <button
                    type="button"
                    className="flex flex-1 items-center gap-2 text-left cursor-pointer min-w-0"
                    onClick={() => {
                      if (entry.type === "dir") navigateTo(entry.path)
                      else onOpenFile(entry.path)
                    }}
                  >
                    {entry.type === "dir" ? <Folder className="size-4 shrink-0 text-muted-foreground" /> : <FileCode className="size-4 shrink-0 text-muted-foreground" />}
                    <span className="truncate font-mono text-foreground">{entry.name}</span>
                  </button>
                  <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">{entry.type === "file" ? formatBytes(entry.size) : "—"}</span>
                  <span className="w-36 shrink-0 text-right text-xs text-muted-foreground">
                    {new Date(entry.modifiedAt).toLocaleDateString(lang === "en" ? "en-US" : "tr-TR")}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    {entry.type === "file" && (
                      <Button variant="ghost" size="sm" onClick={() => handleDownloadOne(entry.path)} title={lang === "en" ? "Download" : "İndir"}>
                        <FileIcon className="size-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" disabled={rowBusy === entry.path} onClick={() => handleDeleteOne(entry.path)} title={t("common.delete")}>
                      {rowBusy === entry.path ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
