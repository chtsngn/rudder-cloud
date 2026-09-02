"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft,
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

export default function SiteFilesPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const siteId = params.id

  const [domain, setDomain] = useState<string>("")
  const [siteNotSupported, setSiteNotSupported] = useState(false)

  const [currentPath, setCurrentPath] = useState("")
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
        const res = await fetch(`/api/sites/${siteId}/files?path=${encodeURIComponent(path)}`, {
          cache: "no-store",
        })
        if (!res.ok) {
          if (res.status === 400) {
            setSiteNotSupported(true)
            return
          }
          setDirError(await parseError(res))
          return
        }
        const data = (await res.json()) as { path: string; entries: SiteEntry[] }
        setEntries(data.entries)
        setSelected(new Set())
      } catch {
        setDirError("Sunucuya bağlanılamadı.")
      } finally {
        setLoading(false)
      }
    },
    [siteId]
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
      setEnvError("Sunucuya bağlanılamadı.")
    }
  }, [siteId])

  useEffect(() => {
    let cancelled = false
    async function loadSite() {
      try {
        const res = await fetch(`/api/sites/${siteId}`, { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as { domain: string; type: string }
        if (!cancelled) setDomain(data.domain)
        if (!cancelled && data.type === "REVERSE_PROXY") setSiteNotSupported(true)
      } catch {
        // sessiz geç — üstteki dizin yüklemesi zaten hatayı gösterecek
      }
    }
    const timer = setTimeout(() => {
      loadSite()
      loadDir("")
      loadEnv()
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId])

  function navigateTo(path: string) {
    setCurrentPath(path)
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
      setCreateError("Sunucuya bağlanılamadı.")
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
      if (currentPath === "" && !envOverview?.files.some((f) => f.name === name) && name.startsWith(".env")) {
        loadEnv()
      }
    } catch {
      setCreateError("Sunucuya bağlanılamadı.")
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
      const data = (await res.json().catch(() => null)) as
        | { uploaded: unknown[]; errors: { name: string; error: string }[] }
        | null
      if (!res.ok && !data) {
        setUploadError("Yükleme başarısız oldu.")
        return
      }
      if (data && data.errors.length > 0) {
        setUploadError(data.errors.map((e) => `${e.name}: ${e.error}`).join(" · "))
      }
      await loadDir(currentPath)
    } catch {
      setUploadError("Sunucuya bağlanılamadı.")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleDeleteOne(entryPath: string) {
    if (!window.confirm(`"${entryPath}" silinsin mi? Bu işlem geri alınamaz.`)) return
    setRowBusy(entryPath)
    try {
      const res = await fetch(`/api/sites/${siteId}/files?path=${encodeURIComponent(entryPath)}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        setDirError(await parseError(res))
        return
      }
      await loadDir(currentPath)
    } catch {
      setDirError("Sunucuya bağlanılamadı.")
    } finally {
      setRowBusy(null)
    }
  }

  async function handleDeleteSelected() {
    if (selected.size === 0) return
    if (!window.confirm(`${selected.size} öğe silinsin mi? Bu işlem geri alınamaz.`)) return
    setDeleting(true)
    try {
      for (const p of selected) {
        const res = await fetch(`/api/sites/${siteId}/files?path=${encodeURIComponent(p)}`, {
          method: "DELETE",
        })
        if (!res.ok) {
          setDirError(await parseError(res))
        }
      }
      await loadDir(currentPath)
    } finally {
      setDeleting(false)
    }
  }

  function handleDownloadSelected() {
    if (selected.size === 0) return
    const url = `/api/sites/${siteId}/files/download?paths=${encodeURIComponent(Array.from(selected).join(","))}`
    triggerDownload(url)
  }

  function handleDownloadOne(entryPath: string) {
    const url = `/api/sites/${siteId}/files/download?paths=${encodeURIComponent(entryPath)}`
    triggerDownload(url)
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
      setEnvError("Sunucuya bağlanılamadı.")
    } finally {
      setEnvCopying(false)
    }
  }

  const breadcrumbSegments = currentPath ? currentPath.split("/") : []

  if (siteNotSupported) {
    return (
      <div className="space-y-4">
        <BackLink siteId={siteId} />
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Bu site türü için dosya yöneticisi desteklenmiyor (Ters Proxy siteleri yerel
            dosya bulundurmaz).
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <BackLink siteId={siteId} />
          <h1 className="mt-2 font-mono text-xl font-semibold text-foreground">
            Dosyalar {domain && <span className="text-muted-foreground">— {domain}</span>}
          </h1>
        </div>
      </div>

      {envOverview && (envOverview.files.length > 0 || envOverview.availableExample) && (
        <Card>
          <CardHeader>
            <CardTitle>.env Dosyaları</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {envError && <p className="text-sm text-destructive">{envError}</p>}
            {envOverview.files.length > 0 && (
              <ul className="space-y-1.5">
                {envOverview.files.map((f) => (
                  <li key={f.path} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-foreground">{f.name}</span>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/sites/${siteId}/files/edit?path=${encodeURIComponent(f.path)}`}>
                        <Pencil className="size-3.5" />
                        Düzenle
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {envOverview.availableExample && (
              <div className="flex items-center justify-between rounded-lg border border-dashed border-border p-3 text-sm">
                <span className="text-muted-foreground">
                  <span className="font-mono text-foreground">.env</span> yok — {" "}
                  <span className="font-mono">{envOverview.availableExample}</span> mevcut.
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={envCopying}
                  onClick={() => handleEnvCopy(envOverview.availableExample!)}
                >
                  {envCopying && <Loader2 className="size-3.5 animate-spin" />}
                  Örnekten kopyala
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
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => navigateTo("")}
              >
                /
              </button>
              {breadcrumbSegments.map((seg, i) => {
                const segPath = breadcrumbSegments.slice(0, i + 1).join("/")
                return (
                  <span key={segPath} className="flex items-center gap-1">
                    <span className="text-muted-foreground">/</span>
                    <button
                      className={cn(
                        "hover:text-foreground",
                        i === breadcrumbSegments.length - 1
                          ? "font-medium text-foreground"
                          : "text-muted-foreground"
                      )}
                      onClick={() => navigateTo(segPath)}
                    >
                      {seg}
                    </button>
                  </span>
                )
              })}
            </nav>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => loadDir(currentPath)}>
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
                Yeni Klasör
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
                Yeni Dosya
              </Button>
              <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                Yükle
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {(newFolderOpen || newFileOpen) && (
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
              {newFolderOpen && (
                <>
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-muted-foreground">Klasör adı</label>
                    <Input
                      autoFocus
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                      placeholder="yeni-klasor"
                    />
                  </div>
                  <Button size="sm" disabled={creating || !newFolderName.trim()} onClick={handleCreateFolder}>
                    {creating && <Loader2 className="size-3.5 animate-spin" />}
                    Oluştur
                  </Button>
                </>
              )}
              {newFileOpen && (
                <>
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-muted-foreground">Dosya adı</label>
                    <Input
                      autoFocus
                      value={newFileName}
                      onChange={(e) => setNewFileName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateFile()}
                      placeholder="dosya.js"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Şablon (opsiyonel)</label>
                    <CustomSelect
                      value={newFileTemplate}
                      onChange={setNewFileTemplate}
                      options={[
                        { value: "", label: "Boş dosya" },
                        ...FILE_TEMPLATES.map((t) => ({
                          value: t.extension,
                          label: `${t.label} (${t.extension})`,
                        })),
                      ]}
                      size="sm"
                      className="min-w-[150px]"
                    />
                  </div>
                  <Button size="sm" disabled={creating || !newFileName.trim()} onClick={handleCreateFile}>
                    {creating && <Loader2 className="size-3.5 animate-spin" />}
                    Oluştur
                  </Button>
                </>
              )}
            </div>
          )}
          {createError && <p className="text-sm text-destructive">{createError}</p>}
          {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}

          {selected.size > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
              <span>{selected.size} öğe seçildi</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={handleDownloadSelected}>
                  İndir (zip)
                </Button>
                <Button size="sm" variant="destructive" disabled={deleting} onClick={handleDeleteSelected}>
                  {deleting && <Loader2 className="size-3.5 animate-spin" />}
                  Sil
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
            <p className="py-6 text-center text-sm text-muted-foreground">Bu dizin boş.</p>
          ) : (
            <div className="divide-y divide-border">
              {entries.map((entry) => (
                <div key={entry.path} className="flex items-center gap-3 py-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.has(entry.path)}
                    onChange={() => toggleSelected(entry.path)}
                    className="size-4"
                  />
                  <button
                    className="flex flex-1 items-center gap-2 text-left"
                    onClick={() => {
                      if (entry.type === "dir") navigateTo(entry.path)
                      else router.push(`/sites/${siteId}/files/edit?path=${encodeURIComponent(entry.path)}`)
                    }}
                  >
                    {entry.type === "dir" ? (
                      <Folder className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <FileCode className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate font-mono text-foreground">{entry.name}</span>
                  </button>
                  <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                    {entry.type === "file" ? formatBytes(entry.size) : "—"}
                  </span>
                  <span className="w-36 shrink-0 text-right text-xs text-muted-foreground">
                    {new Date(entry.modifiedAt).toLocaleDateString("tr-TR")}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    {entry.type === "file" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownloadOne(entry.path)}
                        title="İndir"
                      >
                        <FileIcon className="size-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={rowBusy === entry.path}
                      onClick={() => handleDeleteOne(entry.path)}
                      title="Sil"
                    >
                      {rowBusy === entry.path ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
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

function BackLink({ siteId }: { siteId: string }) {
  return (
    <Link
      href={`/sites/${siteId}`}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Site detayına dön
    </Link>
  )
}
