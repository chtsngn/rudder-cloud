/**
 * Dosya yöneticisinin tarayıcı tarafı yükleme yardımcıları: sürükle-bırak ile
 * gelen klasörleri dolaşmak ve büyük seçimleri parça parça (batch) yüklemek.
 * Sunucu tarafı: `POST /api/sites/[id]/files/upload` (`files` + `paths`).
 */

export interface UploadItem {
  file: File
  /** Hedef klasöre göre göreli yol (`klasor/alt/dosya.txt` ya da yalnızca ad). */
  relPath: string
}

export interface UploadResult {
  uploaded: number
  errors: { name: string; error: string }[]
}

/** Tek istekte gönderilecek azami toplam boyut / dosya sayısı. */
const BATCH_MAX_BYTES = 40 * 1024 * 1024
const BATCH_MAX_FILES = 50

function readFileEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

function readAllDirEntries(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = dir.createReader()
  const all: FileSystemEntry[] = []
  // readEntries her çağrıda en fazla ~100 öğe döner — boş dönene kadar tekrarla.
  return new Promise((resolve, reject) => {
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) resolve(all)
        else {
          all.push(...batch)
          next()
        }
      }, reject)
    next()
  })
}

async function walkEntry(entry: FileSystemEntry, prefix: string, out: UploadItem[]): Promise<void> {
  const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
  if (entry.isFile) {
    out.push({ file: await readFileEntry(entry as FileSystemFileEntry), relPath })
  } else if (entry.isDirectory) {
    const children = await readAllDirEntries(entry as FileSystemDirectoryEntry)
    for (const child of children) await walkEntry(child, relPath, out)
  }
}

/**
 * Bırakılan öğeleri (klasörler dahil, özyinelemeli) listeler. `DataTransfer`
 * öğeleri olay bittikten sonra geçersizleşir — girdiler senkron alınır,
 * dolaşma sonra yapılır.
 */
export async function collectDroppedItems(dt: DataTransfer): Promise<UploadItem[]> {
  const entries = Array.from(dt.items)
    .filter((i) => i.kind === "file")
    .map((i) => i.webkitGetAsEntry?.() ?? null)
    .filter((e): e is FileSystemEntry => e !== null)

  if (entries.length === 0) {
    return Array.from(dt.files).map((file) => ({ file, relPath: file.name }))
  }
  const out: UploadItem[] = []
  for (const entry of entries) await walkEntry(entry, "", out)
  return out
}

/** `<input type="file">` (klasör seçiminde `webkitRelativePath` dolu gelir). */
export function itemsFromFileList(list: FileList): UploadItem[] {
  return Array.from(list).map((file) => ({ file, relPath: file.webkitRelativePath || file.name }))
}

/** Öğeleri makul boyutlu parçalar halinde sırayla yükler; ilerlemeyi bildirir. */
export async function uploadInBatches(
  siteId: string,
  targetDir: string,
  items: UploadItem[],
  onProgress: (done: number, total: number) => void
): Promise<UploadResult> {
  const result: UploadResult = { uploaded: 0, errors: [] }
  const batches: UploadItem[][] = []
  let current: UploadItem[] = []
  let currentBytes = 0
  for (const item of items) {
    if (current.length > 0 && (current.length >= BATCH_MAX_FILES || currentBytes + item.file.size > BATCH_MAX_BYTES)) {
      batches.push(current)
      current = []
      currentBytes = 0
    }
    current.push(item)
    currentBytes += item.file.size
  }
  if (current.length > 0) batches.push(current)

  let done = 0
  onProgress(0, items.length)
  for (const batch of batches) {
    const form = new FormData()
    for (const item of batch) {
      form.append("files", item.file)
      form.append("paths", item.relPath)
    }
    try {
      const res = await fetch(`/api/sites/${siteId}/files/upload?path=${encodeURIComponent(targetDir)}`, {
        method: "POST",
        body: form,
      })
      const data = (await res.json().catch(() => null)) as { uploaded?: unknown[]; errors?: { name: string; error: string }[]; error?: string } | null
      if (data?.uploaded) result.uploaded += data.uploaded.length
      if (data?.errors) result.errors.push(...data.errors)
      else if (!res.ok) {
        const message = data?.error ?? (res.status === 413 ? "İstek çok büyük (sunucu sınırı)." : `Yükleme başarısız (${res.status}).`)
        for (const item of batch) result.errors.push({ name: item.relPath, error: message })
      }
    } catch {
      for (const item of batch) result.errors.push({ name: item.relPath, error: "Sunucuya bağlanılamadı." })
    }
    done += batch.length
    onProgress(done, items.length)
  }
  return result
}
