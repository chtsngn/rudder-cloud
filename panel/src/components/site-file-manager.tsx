"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react"
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ClipboardCopy,
  CopyPlus,
  CornerLeftUp,
  Download,
  File as FileIcon,
  FileArchive,
  FileCode,
  FileCog,
  FileImage,
  FilePlus,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  FolderUp,
  House,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Search,
  TextCursorInput,
  Trash2,
  Upload,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  CreateEntryDialog,
  TransferDialog,
  baseName,
  displayPath,
  type CreateRequest,
  type TransferRequest,
} from "@/components/site-file-dialogs"
import { collectDroppedItems, itemsFromFileList, uploadInBatches, type UploadItem } from "@/lib/file-upload-client"
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

type SortKey = "name" | "size" | "modifiedAt"

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

const CODE_EXT = new Set(["js", "mjs", "cjs", "jsx", "ts", "tsx", "py", "php", "sh", "rb", "go", "rs", "java", "css", "scss", "html", "htm", "vue", "svelte", "sql", "json", "xml"])
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "avif", "bmp"])
const ARCHIVE_EXT = new Set(["zip", "tar", "gz", "tgz", "rar", "7z", "bz2", "xz"])
const TEXT_EXT = new Set(["md", "txt", "log", "csv", "rst"])
const CONFIG_EXT = new Set(["yml", "yaml", "toml", "ini", "conf", "cfg", "lock"])

function EntryIcon({ entry }: { entry: SiteEntry }) {
  const cls = "size-4 shrink-0"
  if (entry.type === "dir") return <Folder className={cn(cls, "text-sky-500 fill-sky-500/15")} />
  const lower = entry.name.toLowerCase()
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : ""
  if (lower.startsWith(".env") || lower === "dockerfile" || lower.startsWith("docker-compose") || lower.startsWith(".git") || CONFIG_EXT.has(ext))
    return <FileCog className={cn(cls, "text-amber-500")} />
  if (IMAGE_EXT.has(ext)) return <FileImage className={cn(cls, "text-violet-500")} />
  if (ARCHIVE_EXT.has(ext)) return <FileArchive className={cn(cls, "text-orange-500")} />
  if (CODE_EXT.has(ext)) return <FileCode className={cn(cls, "text-emerald-500")} />
  if (TEXT_EXT.has(ext)) return <FileText className={cn(cls, "text-muted-foreground")} />
  return <FileIcon className={cn(cls, "text-muted-foreground")} />
}

/** Klasör seçici input'u — `webkitdirectory` React'te tiplenmediği için ref ile verilir. */
function setDirectoryInput(el: HTMLInputElement | null) {
  if (el) {
    el.setAttribute("webkitdirectory", "")
    el.setAttribute("directory", "")
  }
}

/**
 * Site dosya yöneticisi — site detay sayfasının "Dosyalar" sekmesinde render
 * edilir. Oluşturma (dosya/klasör, iç içe yol, şablon), yükleme (dosya,
 * klasör, sürükle-bırak), yeniden adlandırma/taşıma/kopyalama, zip indirme ve
 * silme. Bir dosyaya tıklanınca `onOpenFile(path)`; klasör değişimi
 * `onPathChange` ile üst bileşene (URL'e) bildirilir.
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
  const en = lang === "en"
  const offline = en ? "Could not reach the server." : "Sunucuya bağlanılamadı."

  const [currentPath, setCurrentPath] = useState(initialPath)
  const [entries, setEntries] = useState<SiteEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [dirError, setDirError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [flashPath, setFlashPath] = useState<string | null>(null)

  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "name", asc: true })
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [createReq, setCreateReq] = useState<CreateRequest | null>(null)
  const [transferReq, setTransferReq] = useState<TransferRequest | null>(null)

  const [upload, setUpload] = useState<{ done: number; total: number } | null>(null)
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
  const [dragDepth, setDragDepth] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

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
          setEntries([])
          return
        }
        const data = (await res.json()) as { path: string; entries: SiteEntry[] }
        setEntries(data.entries)
        setSelected(new Set())
      } catch {
        setDirError(offline)
      } finally {
        setLoading(false)
      }
    },
    [siteId, offline]
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
      setEnvError(offline)
    }
  }, [siteId, offline])

  useEffect(() => {
    const timer = setTimeout(() => {
      loadDir(initialPath)
      loadEnv()
    }, 0)
    return () => clearTimeout(timer)
    // Yalnızca site değişince ilk yükleme — klasör gezintisi navigateTo ile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId])

  // Başarı bildirimi ve vurgulanan satır birkaç saniye sonra kaybolur.
  useEffect(() => {
    if (!notice && !flashPath) return
    const timer = setTimeout(() => {
      setNotice(null)
      setFlashPath(null)
    }, 3500)
    return () => clearTimeout(timer)
  }, [notice, flashPath])

  function navigateTo(path: string) {
    setCurrentPath(path)
    setQuery("")
    setActionError(null)
    setNotice(null)
    setUploadErrors([])
    onPathChange?.(path)
    loadDir(path)
  }

  async function refresh(highlight?: string | null) {
    await loadDir(currentPath)
    if (highlight) setFlashPath(highlight)
    if (currentPath === "") loadEnv()
  }

  const visibleEntries = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? entries.filter((e) => e.name.toLowerCase().includes(q)) : entries.slice()
    const dir = sort.asc ? 1 : -1
    list.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : b.type === "dir" ? 1 : 0
      if (sort.key === "size" && a.size !== b.size) return (a.size - b.size) * dir
      if (sort.key === "modifiedAt" && a.modifiedAt !== b.modifiedAt) return a.modifiedAt < b.modifiedAt ? -dir : dir
      return a.name.localeCompare(b.name, "tr", { numeric: true }) * (sort.key === "name" ? dir : 1)
    })
    return list
  }, [entries, query, sort])

  const allVisibleSelected = visibleEntries.length > 0 && visibleEntries.every((e) => selected.has(e.path))

  function toggleSelected(path: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function toggleAll() {
    setSelected(allVisibleSelected ? new Set() : new Set(visibleEntries.map((e) => e.path)))
  }

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, asc: !prev.asc } : { key, asc: key === "name" }))
  }

  function openCreate(kind: CreateRequest["kind"], baseDir = currentPath) {
    setActionError(null)
    setCreateReq({ kind, baseDir })
  }

  function handleCreated(entry: { path: string; type: string }, openAfter: boolean) {
    const kind = createReq?.kind
    setCreateReq(null)
    if (openAfter && kind === "file") {
      onOpenFile(entry.path)
      return
    }
    if (openAfter && kind === "folder") {
      navigateTo(entry.path)
      return
    }
    setNotice(`${displayPath(entry.path)} ${en ? "created." : "oluşturuldu."}`)
    // Oluşturulan öğe bu klasörde değilse bile üst seviyesi burada görünür.
    const inHere = entry.path.startsWith(currentPath ? `${currentPath}/` : "")
    const rest = inHere ? entry.path.slice(currentPath ? currentPath.length + 1 : 0) : ""
    const topLevel = rest ? (currentPath ? `${currentPath}/${rest.split("/")[0]}` : rest.split("/")[0]) : null
    void refresh(topLevel)
  }

  async function runUpload(items: UploadItem[]) {
    if (items.length === 0) return
    setUploadErrors([])
    setActionError(null)
    const result = await uploadInBatches(siteId, currentPath, items, (done, total) => setUpload({ done, total }))
    setUpload(null)
    setUploadErrors(result.errors.map((e) => `${e.name}: ${e.error}`))
    if (result.uploaded > 0) setNotice(en ? `${result.uploaded} file(s) uploaded.` : `${result.uploaded} dosya yüklendi.`)
    const firstTop = items[0]?.relPath.split("/")[0]
    await refresh(firstTop ? (currentPath ? `${currentPath}/${firstTop}` : firstTop) : null)
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault()
    setDragDepth(0)
    if (upload) return
    const items = await collectDroppedItems(e.dataTransfer)
    await runUpload(items)
  }

  async function deletePaths(paths: string[]) {
    const label = paths.length === 1 ? `"${displayPath(paths[0])}"` : en ? `${paths.length} items` : `${paths.length} öğe`
    if (!window.confirm(en ? `Delete ${label}? This cannot be undone.` : `${label} silinsin mi? Bu işlem geri alınamaz.`)) return
    setActionError(null)
    if (paths.length === 1) setRowBusy(paths[0])
    else setDeleting(true)
    const errors: string[] = []
    try {
      for (const p of paths) {
        try {
          const res = await fetch(`/api/sites/${siteId}/files?path=${encodeURIComponent(p)}`, { method: "DELETE" })
          if (!res.ok) errors.push(`${baseName(p)}: ${await parseError(res)}`)
        } catch {
          errors.push(`${baseName(p)}: ${offline}`)
        }
      }
      if (errors.length > 0) setActionError(errors.join(" · "))
      else setNotice(en ? "Deleted." : "Silindi.")
      await refresh()
    } finally {
      setRowBusy(null)
      setDeleting(false)
    }
  }

  function downloadPaths(paths: string[]) {
    triggerDownload(`/api/sites/${siteId}/files/download?paths=${encodeURIComponent(paths.join(","))}`)
  }

  async function copyPath(path: string) {
    try {
      await navigator.clipboard.writeText(displayPath(path))
      setNotice(en ? "Path copied." : "Yol kopyalandı.")
    } catch {
      setActionError(en ? "Clipboard is not available." : "Panoya erişilemedi.")
    }
  }

  function handleTransferDone(lastPath: string | null, errors: string[]) {
    const mode = transferReq?.mode
    setTransferReq(null)
    if (errors.length > 0) setActionError(errors.join(" · "))
    else setNotice(mode === "copy" ? (en ? "Copied." : "Kopyalandı.") : mode === "move" ? (en ? "Moved." : "Taşındı.") : en ? "Renamed." : "Yeniden adlandırıldı.")
    void refresh(lastPath && lastPath.startsWith(currentPath) ? lastPath : null)
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
      setEnvError(offline)
    } finally {
      setEnvCopying(false)
    }
  }

  const breadcrumbSegments = currentPath ? currentPath.split("/") : []
  const dragging = dragDepth > 0
  const selectedPaths = Array.from(selected)

  function sortHeader(k: SortKey, children: ReactNode, className?: string) {
    const active = sort.key === k
    return (
      <button type="button" onClick={() => toggleSort(k)} className={cn("inline-flex items-center gap-1 hover:text-foreground cursor-pointer", active && "text-foreground", className)}>
        {children}
        {active && (sort.asc ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    )
  }

  function renderRowMenu(entry: SiteEntry) {
    const isDir = entry.type === "dir"
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="size-8 p-0" title={en ? "Actions" : "İşlemler"} disabled={rowBusy === entry.path}>
            {rowBusy === entry.path ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {isDir ? (
            <>
              <DropdownMenuItem onSelect={() => navigateTo(entry.path)}>
                <FolderOpen /> {en ? "Open" : "Aç"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openCreate("file", entry.path)}>
                <FilePlus /> {en ? "New file inside" : "İçinde yeni dosya"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openCreate("folder", entry.path)}>
                <FolderPlus /> {en ? "New folder inside" : "İçinde yeni klasör"}
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onSelect={() => onOpenFile(entry.path)}>
              <Pencil /> {t("common.edit")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setTransferReq({ mode: "rename", paths: [entry.path] })}>
            <TextCursorInput /> {en ? "Rename" : "Yeniden adlandır"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setTransferReq({ mode: "copy", paths: [entry.path] })}>
            <CopyPlus /> {en ? "Duplicate" : "Kopyasını oluştur"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setTransferReq({ mode: "move", paths: [entry.path] })}>
            <FolderInput /> {en ? "Move to…" : "Taşı…"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => downloadPaths([entry.path])}>
            <Download /> {isDir ? (en ? "Download as zip" : "Zip olarak indir") : en ? "Download" : "İndir"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copyPath(entry.path)}>
            <ClipboardCopy /> {en ? "Copy path" : "Yolu kopyala"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => void deletePaths([entry.path])}>
            <Trash2 /> {t("common.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const uploadMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={!!upload}>
          {upload ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          {upload ? `${upload.done}/${upload.total}` : en ? "Upload" : "Yükle"}
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
          <Upload /> {en ? "Upload files" : "Dosya yükle"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => folderInputRef.current?.click()}>
          <FolderUp /> {en ? "Upload folder" : "Klasör yükle"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div className="space-y-6">
      {envOverview && (envOverview.files.length > 0 || envOverview.availableExample) && (
        <Card>
          <CardHeader>
            <CardTitle>{en ? ".env Files" : ".env Dosyaları"}</CardTitle>
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
                  <span className="font-mono text-foreground">.env</span> {en ? "not found —" : "yok —"}{" "}
                  <span className="font-mono">{envOverview.availableExample}</span> {en ? "exists." : "mevcut."}
                </span>
                <Button size="sm" variant="outline" disabled={envCopying} onClick={() => handleEnvCopy(envOverview.availableExample!)}>
                  {envCopying && <Loader2 className="size-3.5 animate-spin" />}
                  {en ? "Copy from example" : "Örnekten kopyala"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card
        className="relative gap-4"
        onDragEnter={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return
          e.preventDefault()
          setDragDepth((d) => d + 1)
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault()
        }}
        onDragLeave={() => setDragDepth((d) => Math.max(0, d - 1))}
        onDrop={handleDrop}
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-primary/5 backdrop-blur-[1px]">
            <Upload className="size-8 text-primary" />
            <p className="text-sm font-medium text-foreground">{en ? "Drop to upload" : "Yüklemek için bırakın"}</p>
            <p className="font-mono text-xs text-muted-foreground">{displayPath(currentPath)}</p>
          </div>
        )}

        {/* ── Araç çubuğu: oluştur / yükle / ara / yenile ── */}
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => openCreate("file")}>
              <FilePlus className="size-3.5" />
              {en ? "New File" : "Yeni Dosya"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => openCreate("folder")}>
              <FolderPlus className="size-3.5" />
              {en ? "New Folder" : "Yeni Klasör"}
            </Button>
            {uploadMenu}
            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={en ? "Filter this folder" : "Bu klasörde ara"}
                  className="h-8 w-44 pl-8 text-xs sm:w-56"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer" aria-label="Temizle">
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              <Button variant="outline" size="sm" className="size-8 p-0" onClick={() => refresh()} title={t("common.refresh")}>
                <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
              </Button>
            </div>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files) void runUpload(itemsFromFileList(e.target.files)); e.target.value = "" }} />
            <input
              ref={(el) => {
                folderInputRef.current = el
                setDirectoryInput(el)
              }}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files) void runUpload(itemsFromFileList(e.target.files)); e.target.value = "" }}
            />
          </div>

          {/* Konum çubuğu */}
          <nav className="flex flex-wrap items-center gap-1 rounded-lg bg-muted/60 px-2.5 py-1.5 text-sm">
            <button type="button" className="flex items-center gap-1 text-muted-foreground hover:text-foreground cursor-pointer" onClick={() => navigateTo("")} title={en ? "Site root" : "Site kökü"}>
              <House className="size-3.5" />
            </button>
            {breadcrumbSegments.map((seg, i) => {
              const segPath = breadcrumbSegments.slice(0, i + 1).join("/")
              const last = i === breadcrumbSegments.length - 1
              return (
                <span key={segPath} className="flex items-center gap-1">
                  <span className="text-muted-foreground/60">/</span>
                  <button type="button" className={cn("font-mono hover:text-foreground cursor-pointer", last ? "font-medium text-foreground" : "text-muted-foreground")} onClick={() => navigateTo(segPath)}>
                    {seg}
                  </button>
                </span>
              )
            })}
            {!loading && !dirError && (
              <span className="ml-auto text-xs text-muted-foreground">
                {entries.filter((e) => e.type === "dir").length} {en ? "folders" : "klasör"} · {entries.filter((e) => e.type !== "dir").length} {en ? "files" : "dosya"}
              </span>
            )}
          </nav>
        </CardHeader>

        <CardContent className="space-y-3">
          {notice && <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{notice}</p>}
          {actionError && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{actionError}</p>}
          {uploadErrors.length > 0 && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <p className="font-medium">{en ? "Some files could not be uploaded:" : "Bazı dosyalar yüklenemedi:"}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                {uploadErrors.slice(0, 8).map((err) => (
                  <li key={err}>{err}</li>
                ))}
                {uploadErrors.length > 8 && <li>{en ? `…and ${uploadErrors.length - 8} more` : `…ve ${uploadErrors.length - 8} hata daha`}</li>}
              </ul>
            </div>
          )}

          {selected.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              <span className="font-medium">
                {selected.size} {en ? "selected" : "öğe seçildi"}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setTransferReq({ mode: "move", paths: selectedPaths })}>
                  <FolderInput className="size-3.5" />
                  {en ? "Move" : "Taşı"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => downloadPaths(selectedPaths)}>
                  <Download className="size-3.5" />
                  {en ? "Download (zip)" : "İndir (zip)"}
                </Button>
                <Button size="sm" variant="destructive" disabled={deleting} onClick={() => deletePaths(selectedPaths)}>
                  {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                  {t("common.delete")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  {en ? "Clear" : "Temizle"}
                </Button>
              </div>
            </div>
          )}

          {dirError ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{dirError}</p>
          ) : loading && entries.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              {/* Sütun başlıkları */}
              <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                <input type="checkbox" className="size-4" checked={allVisibleSelected} onChange={toggleAll} disabled={visibleEntries.length === 0} aria-label={en ? "Select all" : "Tümünü seç"} />
                {sortHeader("name", en ? "Name" : "Ad", "flex-1")}
                {sortHeader("size", en ? "Size" : "Boyut", "w-20 justify-end")}
                {sortHeader("modifiedAt", en ? "Modified" : "Değiştirilme", "hidden w-36 justify-end sm:inline-flex")}
                <span className="w-8" />
              </div>

              {currentPath && !query && (
                <button
                  type="button"
                  onClick={() => navigateTo(currentPath.includes("/") ? currentPath.slice(0, currentPath.lastIndexOf("/")) : "")}
                  className="flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/50 cursor-pointer"
                >
                  <span className="size-4" />
                  <CornerLeftUp className="size-4" />
                  <span className="font-mono">..</span>
                </button>
              )}

              {visibleEntries.length === 0 ? (
                query ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">{en ? `No items match “${query}”.` : `“${query}” ile eşleşen öğe yok.`}</p>
                ) : (
                  <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
                    <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                      <FolderOpen className="size-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{en ? "This folder is empty" : "Bu klasör boş"}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{en ? "Create a file or folder, or drag files here to upload." : "Dosya veya klasör oluşturun ya da yüklemek için dosyaları buraya sürükleyin."}</p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button size="sm" onClick={() => openCreate("file")}>
                        <FilePlus className="size-3.5" />
                        {en ? "New File" : "Yeni Dosya"}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => openCreate("folder")}>
                        <FolderPlus className="size-3.5" />
                        {en ? "New Folder" : "Yeni Klasör"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                        <Upload className="size-3.5" />
                        {en ? "Upload" : "Yükle"}
                      </Button>
                    </div>
                  </div>
                )
              ) : (
                <div className="divide-y divide-border">
                  {visibleEntries.map((entry) => (
                    <div
                      key={entry.path}
                      className={cn(
                        "group flex items-center gap-3 px-3 py-1.5 text-sm transition-colors hover:bg-muted/50",
                        selected.has(entry.path) && "bg-primary/5",
                        flashPath === entry.path && "bg-success/10"
                      )}
                    >
                      <input type="checkbox" checked={selected.has(entry.path)} onChange={() => toggleSelected(entry.path)} className="size-4" aria-label={entry.name} />
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left cursor-pointer"
                        onClick={() => (entry.type === "dir" ? navigateTo(entry.path) : onOpenFile(entry.path))}
                      >
                        <EntryIcon entry={entry} />
                        <span className={cn("truncate font-mono text-foreground", entry.type === "dir" && "font-medium")}>{entry.name}</span>
                      </button>
                      <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">{entry.type === "file" ? formatBytes(entry.size) : "—"}</span>
                      <span className="hidden w-36 shrink-0 text-right text-xs text-muted-foreground sm:block" title={new Date(entry.modifiedAt).toLocaleString(en ? "en-US" : "tr-TR")}>
                        {new Date(entry.modifiedAt).toLocaleString(en ? "en-US" : "tr-TR", { dateStyle: "short", timeStyle: "short" })}
                      </span>
                      <div className="w-8 shrink-0">{renderRowMenu(entry)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {en
              ? "Tip: drag files or folders onto this card to upload them into the current folder."
              : "İpucu: dosya veya klasörleri bu kartın üzerine sürükleyip bırakarak bulunduğunuz klasöre yükleyebilirsiniz."}
          </p>
        </CardContent>
      </Card>

      {createReq && (
        <CreateEntryDialog
          siteId={siteId}
          request={createReq}
          existingNames={createReq.baseDir === currentPath ? entries.map((e) => e.name) : null}
          onClose={() => setCreateReq(null)}
          onCreated={handleCreated}
        />
      )}
      {transferReq && <TransferDialog siteId={siteId} request={transferReq} onClose={() => setTransferReq(null)} onDone={handleTransferDone} />}
    </div>
  )
}
