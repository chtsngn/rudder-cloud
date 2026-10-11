"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { CheckCircle2, FolderOpen, Loader2, Upload, X, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { displayPath } from "@/components/site-file-dialogs"
import { useTranslation } from "@/components/language-provider"
import { collectDroppedItems, uploadInBatches, type UploadItem } from "@/lib/file-upload-client"

interface UploadJob {
  dir: string
  done: number
  total: number
  uploaded?: number
  errors?: string[]
}

function hasFiles(e: DragEvent): boolean {
  return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")
}

/**
 * Site detay sayfasının tamamını bırakma alanı yapar: dosya/klasör pencerenin
 * herhangi bir yerine bırakılınca `targetDir`'e yüklenir. Olaylar `window`
 * üzerinde yakalama (capture) aşamasında dinlenir; böylece Monaco editör ya da
 * terminal bırakmayı kendine almaz ve tarayıcı dosyayı açmaya çalışmaz.
 *
 * `routeDrop` bırakılan öğeleri üstlenirse (Dosyalar sekmesinde dosya
 * yöneticisi açıkken — listeyi o yeniler, ilerlemeyi o gösterir) `true` döner;
 * aksi halde yükleme burada yapılır ve sağ altta bir bildirim gösterilir.
 */
export function SiteDropUpload({
  siteId,
  domain,
  targetDir,
  routeDrop,
  onShowFiles,
}: {
  siteId: string
  domain: string
  targetDir: string
  routeDrop?: (items: UploadItem[]) => boolean
  onShowFiles?: (dir: string) => void
}) {
  const { lang } = useTranslation()
  const en = lang === "en"

  const [dragging, setDragging] = useState(false)
  const [job, setJob] = useState<UploadJob | null>(null)
  const depthRef = useRef(0)
  const busyRef = useRef(false)
  // Dinleyiciler bir kez bağlanır; güncel prop'lar ref üzerinden okunur.
  const latest = useRef({ siteId, targetDir, routeDrop })
  useEffect(() => {
    latest.current = { siteId, targetDir, routeDrop }
  })

  useEffect(() => {
    async function upload(items: UploadItem[]) {
      const { siteId: id, targetDir: dir, routeDrop: route } = latest.current
      if (items.length === 0 || route?.(items)) return
      busyRef.current = true
      setJob({ dir, done: 0, total: items.length })
      try {
        const result = await uploadInBatches(id, dir, items, (done, total) => setJob({ dir, done, total }))
        setJob({ dir, done: items.length, total: items.length, uploaded: result.uploaded, errors: result.errors.map((e) => `${e.name}: ${e.error}`) })
      } finally {
        busyRef.current = false
      }
    }

    function onDragEnter(e: DragEvent) {
      if (!hasFiles(e)) return
      e.preventDefault()
      depthRef.current += 1
      setDragging(true)
    }
    function onDragOver(e: DragEvent) {
      if (!hasFiles(e)) return
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer) e.dataTransfer.dropEffect = busyRef.current ? "none" : "copy"
    }
    function onDragLeave(e: DragEvent) {
      if (!hasFiles(e)) return
      depthRef.current = Math.max(0, depthRef.current - 1)
      if (depthRef.current === 0) setDragging(false)
    }
    function onDrop(e: DragEvent) {
      if (!hasFiles(e) || !e.dataTransfer) return
      e.preventDefault()
      e.stopPropagation()
      depthRef.current = 0
      setDragging(false)
      if (busyRef.current) return
      // DataTransfer olay bitince geçersizleşir — collectDroppedItems girdileri
      // ilk await'ten önce, senkron alır.
      void collectDroppedItems(e.dataTransfer).then(upload)
    }

    window.addEventListener("dragenter", onDragEnter, true)
    window.addEventListener("dragover", onDragOver, true)
    window.addEventListener("dragleave", onDragLeave, true)
    window.addEventListener("drop", onDrop, true)
    return () => {
      window.removeEventListener("dragenter", onDragEnter, true)
      window.removeEventListener("dragover", onDragOver, true)
      window.removeEventListener("dragleave", onDragLeave, true)
      window.removeEventListener("drop", onDrop, true)
    }
  }, [])

  // Hatasız biten yükleme bildirimi birkaç saniye sonra kapanır.
  const finished = job?.uploaded !== undefined
  const failed = (job?.errors?.length ?? 0) > 0
  useEffect(() => {
    if (!finished || failed) return
    const timer = setTimeout(() => setJob(null), 6000)
    return () => clearTimeout(timer)
  }, [finished, failed, job])

  if (typeof document === "undefined") return null

  return createPortal(
    <>
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[70] bg-background/70 p-4 backdrop-blur-[2px] sm:p-6">
          <div className="flex h-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-primary bg-primary/5 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10">
              <Upload className="size-8 text-primary" />
            </div>
            <p className="font-heading text-lg font-bold text-foreground">
              {job && !finished ? (en ? "An upload is already in progress" : "Bir yükleme sürüyor") : en ? "Drop to upload" : "Yüklemek için bırakın"}
            </p>
            <p className="max-w-full truncate px-4 font-mono text-sm text-muted-foreground">
              {domain}
              <span className="text-foreground">{displayPath(targetDir)}</span>
            </p>
          </div>
        </div>
      )}

      {/* Sağ alttaki Terminal düğmesinin (bottom-8) üstünde durur. */}
      {job && (
        <div className="fixed bottom-24 right-4 z-[60] w-[min(22rem,calc(100vw-2rem))] sm:right-8 rounded-2xl border border-border bg-card p-4 text-sm shadow-2xl">
          <div className="flex items-start gap-3">
            {!finished ? (
              <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
            ) : failed ? (
              <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">
                {!finished
                  ? en
                    ? `Uploading ${job.done}/${job.total}…`
                    : `Yükleniyor ${job.done}/${job.total}…`
                  : en
                    ? `${job.uploaded} file(s) uploaded`
                    : `${job.uploaded} dosya yüklendi`}
              </p>
              <p className="truncate font-mono text-xs text-muted-foreground">{displayPath(job.dir)}</p>
            </div>
            {finished && (
              <button type="button" onClick={() => setJob(null)} className="text-muted-foreground hover:text-foreground cursor-pointer" aria-label={en ? "Close" : "Kapat"}>
                <X className="size-4" />
              </button>
            )}
          </div>

          {!finished && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${job.total ? (job.done / job.total) * 100 : 0}%` }} />
            </div>
          )}

          {failed && (
            <ul className="mt-2 max-h-32 list-disc space-y-0.5 overflow-auto pl-5 text-xs text-destructive">
              {job.errors!.slice(0, 8).map((err) => (
                <li key={err} className="break-all">{err}</li>
              ))}
              {job.errors!.length > 8 && <li>{en ? `…and ${job.errors!.length - 8} more` : `…ve ${job.errors!.length - 8} hata daha`}</li>}
            </ul>
          )}

          {finished && onShowFiles && (job.uploaded ?? 0) > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="mt-3 w-full"
              onClick={() => {
                onShowFiles(job.dir)
                setJob(null)
              }}
            >
              <FolderOpen className="size-3.5" />
              {en ? "Show in Files" : "Dosyalarda göster"}
            </Button>
          )}
        </div>
      )}
    </>,
    document.body
  )
}
