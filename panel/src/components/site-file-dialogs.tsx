"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AlertTriangle, CopyPlus, FilePlus, FolderInput, FolderPlus, Loader2, Pencil, Sparkles, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CustomSelect } from "@/components/ui/custom-select"
import { FILE_TEMPLATES, suggestTemplate } from "@/lib/file-templates"
import { useTranslation } from "@/components/language-provider"
import { cn } from "@/lib/utils"

/** Site köküne göre gösterim yolu: "" → "/", "src/app" → "/src/app". */
export function displayPath(rel: string): string {
  return `/${rel.replace(/^\/+/, "")}`
}

export function joinRel(dir: string, name: string): string {
  const d = dir.replace(/^\/+|\/+$/g, "")
  const n = name.replace(/^\/+/, "")
  return d ? `${d}/${n}` : n
}

export function baseName(rel: string): string {
  return rel.split("/").pop() ?? rel
}

export function parentOf(rel: string): string {
  const i = rel.lastIndexOf("/")
  return i === -1 ? "" : rel.slice(0, i)
}

function FileDialogShell({
  title,
  icon,
  onClose,
  children,
  footer,
}: {
  title: string
  icon: ReactNode
  onClose: () => void
  children: ReactNode
  footer: ReactNode
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in-0 duration-150"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer" aria-label="Kapat">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">{children}</div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>
      </div>
    </div>
  )
}

const QUICK_FILE_NAMES = [".env", "index.html", "index.php", "docker-compose.yml", "Dockerfile", ".gitignore", "README.md"]

export interface CreateRequest {
  kind: "file" | "folder"
  /** Oluşturulacağı klasör (site köküne göre). */
  baseDir: string
}

/**
 * Yeni dosya / klasör diyaloğu. Ad iç içe olabilir (`src/utils/helper.js`) —
 * eksik klasörler sunucuda oluşturulur. Dosyalarda şablon adından otomatik
 * seçilir (değiştirilebilir); "oluşturunca aç" dosyayı editörde, klasörü
 * listede açar.
 */
export function CreateEntryDialog({
  siteId,
  request,
  existingNames,
  onClose,
  onCreated,
}: {
  siteId: string
  request: CreateRequest
  /** baseDir'deki mevcut adlar — çakışma uyarısı için (yalnızca biliniyorsa). */
  existingNames: string[] | null
  onClose: () => void
  onCreated: (entry: { path: string; type: string }, openAfter: boolean) => void
}) {
  const { lang } = useTranslation()
  const en = lang === "en"
  const isFile = request.kind === "file"
  const [name, setName] = useState("")
  const [template, setTemplate] = useState<string>("auto")
  const [openAfter, setOpenAfter] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const trimmed = name.trim().replace(/^\/+/, "")
  const autoTemplate = isFile ? suggestTemplate(trimmed) : undefined
  const effectiveTemplate = template === "auto" ? autoTemplate?.extension ?? "" : template
  const firstSegment = trimmed.split("/")[0]
  const nested = trimmed.includes("/")
  const conflict =
    !!existingNames && !!firstSegment && existingNames.includes(firstSegment) && !nested
      ? true
      : false

  const invalid = useMemo(() => {
    if (!trimmed) return null
    const parts = trimmed.split("/").filter(Boolean)
    if (parts.some((p) => p === "." || p === "..")) return en ? "“.” and “..” are not allowed." : "“.” ve “..” kullanılamaz."
    if (parts.some((p) => p.length > 255)) return en ? "Name is too long." : "Ad çok uzun."
    return null
  }, [trimmed, en])

  async function submit() {
    if (!trimmed || invalid || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/sites/${siteId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: request.baseDir, name: trimmed, kind: request.kind, template: isFile ? effectiveTemplate || undefined : undefined }),
      })
      const data = (await res.json().catch(() => null)) as { entry?: { path: string; type: string }; error?: string } | null
      if (!res.ok || !data?.entry) {
        setError(data?.error ?? (en ? `Request failed (${res.status}).` : `İstek başarısız oldu (${res.status}).`))
        return
      }
      onCreated(data.entry, openAfter)
    } catch {
      setError(en ? "Could not reach the server." : "Sunucuya bağlanılamadı.")
    } finally {
      setBusy(false)
    }
  }

  const title = isFile ? (en ? "New file" : "Yeni dosya") : en ? "New folder" : "Yeni klasör"

  return (
    <FileDialogShell
      title={title}
      icon={isFile ? <FilePlus className="size-4" /> : <FolderPlus className="size-4" />}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {en ? "Cancel" : "Vazgeç"}
          </Button>
          <Button onClick={submit} disabled={!trimmed || !!invalid || busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {en ? "Create" : "Oluştur"}
          </Button>
        </>
      }
    >
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">{isFile ? (en ? "File name" : "Dosya adı") : en ? "Folder name" : "Klasör adı"}</label>
        <Input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              void submit()
            }
          }}
          placeholder={isFile ? (en ? "e.g. index.js or src/utils/helper.js" : "ör. index.js veya src/utils/helper.js") : en ? "e.g. assets or public/images" : "ör. assets veya public/images"}
          className="font-mono"
          spellCheck={false}
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          {en ? "Location: " : "Konum: "}
          <span className="font-mono text-foreground">{displayPath(joinRel(request.baseDir, trimmed || (isFile ? "…" : "…/")))}</span>
          {" · "}
          {en ? "Use / for subfolders; missing folders are created." : "Alt klasör için / kullanın; eksik klasörler oluşturulur."}
        </p>
        {invalid && <p className="text-xs text-destructive">{invalid}</p>}
        {conflict && !invalid && (
          <p className="flex items-center gap-1.5 text-xs text-warning">
            <AlertTriangle className="size-3.5" />
            {en ? "An item with this name already exists here." : "Burada bu isimde bir öğe zaten var."}
          </p>
        )}
      </div>

      {isFile && (
        <>
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">{en ? "Quick pick" : "Hızlı seçim"}</span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_FILE_NAMES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    setName(n)
                    inputRef.current?.focus()
                  }}
                  className={cn(
                    "rounded-md border px-2 py-0.5 font-mono text-xs transition-colors cursor-pointer",
                    trimmed === n ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">{en ? "Starting content" : "Başlangıç içeriği"}</span>
              <CustomSelect
                value={template}
                onChange={setTemplate}
                options={[
                  { value: "auto", label: en ? "Automatic (by name)" : "Otomatik (ada göre)" },
                  { value: "", label: en ? "Empty file" : "Boş dosya" },
                  ...FILE_TEMPLATES.map((tpl) => ({ value: tpl.extension, label: tpl.label })),
                ]}
                size="sm"
                className="min-w-[190px]"
              />
            </div>
            {template === "auto" && (
              <p className="flex items-center gap-1 pb-1.5 text-xs text-muted-foreground">
                <Sparkles className="size-3.5 text-primary" />
                {autoTemplate ? `${en ? "Template" : "Şablon"}: ${autoTemplate.label}` : en ? "Empty file" : "Boş dosya"}
              </p>
            )}
          </div>
        </>
      )}

      <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
        <input type="checkbox" className="size-4" checked={openAfter} onChange={(e) => setOpenAfter(e.target.checked)} />
        {isFile ? (en ? "Open in the editor after creating" : "Oluşturunca editörde aç") : en ? "Open the folder after creating" : "Oluşturunca klasöre gir"}
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </FileDialogShell>
  )
}

export interface TransferRequest {
  mode: "rename" | "move" | "copy"
  paths: string[]
}

function copyNameFor(name: string): string {
  const dot = name.lastIndexOf(".")
  if (dot <= 0) return `${name}-kopya`
  return `${name.slice(0, dot)}-kopya${name.slice(dot)}`
}

/**
 * Yeniden adlandır (tek öğe, aynı klasör), taşı (bir veya daha fazla öğe →
 * hedef klasör) ve kopyala (tek öğe → yeni ad/yol). Üzerine yazılmaz.
 */
export function TransferDialog({
  siteId,
  request,
  onClose,
  onDone,
}: {
  siteId: string
  request: TransferRequest
  onClose: () => void
  onDone: (lastPath: string | null, errors: string[]) => void
}) {
  const { lang } = useTranslation()
  const en = lang === "en"
  const single = request.paths[0]
  const initial =
    request.mode === "rename"
      ? baseName(single)
      : request.mode === "copy"
        ? joinRel(parentOf(single), copyNameFor(baseName(single)))
        : parentOf(single)
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    // Yeniden adlandırmada uzantıyı seçime dahil etme (VS Code gibi).
    const v = el.value
    const dot = request.mode === "rename" ? v.lastIndexOf(".") : -1
    el.setSelectionRange(request.mode === "copy" ? v.lastIndexOf("/") + 1 : 0, dot > 0 ? dot : v.length)
  }, [request.mode])

  const target = value.trim().replace(/^\/+|\/+$/g, "")

  function destinationFor(from: string): string {
    if (request.mode === "rename") return joinRel(parentOf(from), target)
    if (request.mode === "copy") return target
    return joinRel(target, baseName(from))
  }

  const unchanged = request.mode !== "copy" && request.paths.every((p) => destinationFor(p) === p)
  const disabled = busy || unchanged || (request.mode !== "move" && !target) || (request.mode === "rename" && target.includes("/"))

  async function submit() {
    if (disabled) return
    setBusy(true)
    setError(null)
    const errors: string[] = []
    let last: string | null = null
    for (const from of request.paths) {
      try {
        const res = await fetch(`/api/sites/${siteId}/files`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: destinationFor(from), mode: request.mode === "copy" ? "copy" : "move" }),
        })
        const data = (await res.json().catch(() => null)) as { entry?: { path: string }; error?: string } | null
        if (!res.ok || !data?.entry) errors.push(`${baseName(from)}: ${data?.error ?? res.status}`)
        else last = data.entry.path
      } catch {
        errors.push(`${baseName(from)}: ${en ? "could not reach the server" : "sunucuya bağlanılamadı"}`)
      }
    }
    setBusy(false)
    if (errors.length > 0 && last === null) {
      setError(errors.join(" · "))
      return
    }
    onDone(last, errors)
  }

  const meta = {
    rename: { title: en ? "Rename" : "Yeniden adlandır", icon: <Pencil className="size-4" />, label: en ? "New name" : "Yeni ad", action: en ? "Rename" : "Adlandır" },
    move: {
      title: request.paths.length > 1 ? (en ? `Move ${request.paths.length} items` : `${request.paths.length} öğeyi taşı`) : en ? "Move" : "Taşı",
      icon: <FolderInput className="size-4" />,
      label: en ? "Target folder (empty = site root)" : "Hedef klasör (boş = site kökü)",
      action: en ? "Move" : "Taşı",
    },
    copy: { title: en ? "Duplicate" : "Kopyasını oluştur", icon: <CopyPlus className="size-4" />, label: en ? "Path of the copy" : "Kopyanın yolu", action: en ? "Copy" : "Kopyala" },
  }[request.mode]

  return (
    <FileDialogShell
      title={meta.title}
      icon={meta.icon}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {en ? "Cancel" : "Vazgeç"}
          </Button>
          <Button onClick={submit} disabled={disabled}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {meta.action}
          </Button>
        </>
      }
    >
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">{meta.label}</label>
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              void submit()
            }
          }}
          className="font-mono"
          spellCheck={false}
          autoComplete="off"
          placeholder={request.mode === "move" ? "public/assets" : undefined}
        />
        <div className="space-y-0.5 text-xs text-muted-foreground">
          {request.paths.slice(0, 4).map((p) => (
            <p key={p} className="truncate font-mono">
              {displayPath(p)} → <span className="text-foreground">{displayPath(destinationFor(p))}</span>
            </p>
          ))}
          {request.paths.length > 4 && <p>{en ? `…and ${request.paths.length - 4} more` : `…ve ${request.paths.length - 4} öğe daha`}</p>}
        </div>
        {request.mode === "rename" && target.includes("/") && (
          <p className="text-xs text-destructive">{en ? "Use “Move” to change the folder." : "Klasörü değiştirmek için “Taşı”yı kullanın."}</p>
        )}
        {request.mode !== "rename" && (
          <p className="text-xs text-muted-foreground">{en ? "Missing folders are created. Existing items are never overwritten." : "Eksik klasörler oluşturulur. Var olan öğelerin üzerine yazılmaz."}</p>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </FileDialogShell>
  )
}
