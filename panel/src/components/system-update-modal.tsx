"use client"

import { useEffect, useRef, useState } from "react"
import {
  Sparkles,
  ArrowUpCircle,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  GitBranch,
  RefreshCw,
  Terminal,
} from "lucide-react"
import { useSystemVersion, VersionData } from "@/hooks/use-system-version"
import { Button } from "@/components/ui/button"

interface SystemUpdateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  versionData?: VersionData | null
}

/** GET /api/system/update yanıtı (bkz. lib/self-update.ts → UpdateStatus). */
interface UpdateStatus {
  state: "idle" | "running" | "success" | "failed"
  ref: string | null
  message: string | null
  startedAt: string | null
  finishedAt: string | null
  log: string
}

type Phase = "idle" | "starting" | "running" | "completed" | "failed"

const POLL_INTERVAL_MS = 2500
/**
 * install.sh sonunda panel yeniden başlar; o sırada sorgular birkaç saniye
 * (bazen bir dakika) başarısız olur — bu normaldir ve yutulur. Ancak panel
 * hiç geri gelmezse (build kırıldı, servis kalkmadı) sonsuza kadar
 * beklenmez: art arda bu kadar başarısız sorgudan sonra hata gösterilir.
 */
const MAX_CONSECUTIVE_POLL_FAILURES = 120 // ≈ 5 dakika
const RELOAD_DELAY_MS = 2500

export function SystemUpdateModal({
  open,
  onOpenChange,
  versionData,
}: SystemUpdateModalProps) {
  const { data: hookData } = useSystemVersion()
  const data = versionData || hookData

  const [phase, setPhase] = useState<Phase>("idle")
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [log, setLog] = useState("")
  const logRef = useRef<HTMLPreElement | null>(null)

  // Sorgulama döngüsü: yalnızca "running" evresinde çalışır; evre değişince
  // (tamamlandı/başarısız/kapandı) temizlenir.
  useEffect(() => {
    if (phase !== "running") return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let consecutiveFailures = 0

    const tick = async () => {
      if (cancelled) return
      try {
        const res = await fetch("/api/system/update", { cache: "no-store" })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const status: UpdateStatus = await res.json()
        if (cancelled) return
        consecutiveFailures = 0
        setLog(status.log || "")
        if (status.message) setStatusMessage(status.message)

        if (status.state === "success") {
          setPhase("completed")
          setTimeout(() => window.location.reload(), RELOAD_DELAY_MS)
          return
        }
        if (status.state === "failed") {
          setError(status.message || "Güncelleme başarısız oldu. Ayrıntılar için günlüğe bakın.")
          setPhase("failed")
          return
        }
        if (status.state === "idle") {
          // Başlattık ama status dosyası hiç yazılmamış — betik hiç çalışmadı.
          setError(
            "Güncelleme süreci başlatılamadı (durum dosyası oluşmadı). Sunucuda: journalctl -u panel-self-update"
          )
          setPhase("failed")
          return
        }
      } catch {
        // Panel yeniden başlıyor olabilir — bir süre tolere et.
        consecutiveFailures += 1
        if (consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
          if (cancelled) return
          setError(
            "Panel uzun süredir yanıt vermiyor. Güncelleme arka planda sürüyor ya da servis kalkamadı — sunucuda 'journalctl -u panel -n 50' ve /var/log/panel-update/update.log dosyasına bakın, sonra sayfayı yenileyin."
          )
          setPhase("failed")
          return
        }
      }
      if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS)
    }

    timer = setTimeout(tick, 500)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [phase])

  // Modal açıldığında zaten süren bir güncelleme varsa (başka sekmeden
  // başlatılmış, ya da sayfa yenilendi) ona bağlan.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/system/update", { cache: "no-store" })
        if (!res.ok) return
        const status: UpdateStatus = await res.json()
        if (cancelled || status.state !== "running") return
        setLog(status.log || "")
        setStatusMessage(status.message)
        setPhase((current) => (current === "idle" ? "running" : current))
      } catch {}
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  // Log kutusunu her güncellemede en alta kaydır.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  if (!open || !data) return null

  const busy = phase === "starting" || phase === "running"

  const handleStartUpdate = async () => {
    setPhase("starting")
    setError(null)
    setLog("")
    setStatusMessage("Güncelleme başlatılıyor...")

    try {
      const res = await fetch("/api/system/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetVersion: data.latestVersion }),
      })
      const result = await res.json().catch(() => ({}))

      if (res.status === 409 && result?.alreadyRunning) {
        setStatusMessage("Zaten süren bir güncellemeye bağlanıldı.")
        setPhase("running")
        return
      }
      if (!res.ok || !result?.ok) {
        throw new Error(result?.error || "Güncelleme başlatılamadı.")
      }
      setPhase("running")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Güncelleme sırasında beklenmeyen bir hata oluştu.")
      setPhase("failed")
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-xs animate-in fade-in-0 duration-200">
      <div className="relative w-full max-w-xl rounded-3xl border border-slate-200/90 dark:border-[#1e3568] bg-white dark:bg-[#070c1a] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 my-auto">
        {/* Modal Başlığı */}
        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-slate-100 dark:border-[#16223f] bg-slate-50/50 dark:bg-[#050811]">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-2xl bg-sky-500/10 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center border border-sky-500/20 shadow-2xs">
              <Sparkles className="size-5" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-base sm:text-lg text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Rudder Cloud Güncellemesi
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-sans">
                GitHub üzerinden resmi sürüm yükseltme aracı
              </p>
            </div>
          </div>

          {!busy && (
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="size-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#16223f] transition-colors cursor-pointer"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Modal Gövdesi */}
        <div className="p-5 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Sürüm Karşılaştırma Bandı */}
          <div className="flex items-center justify-between p-4 rounded-2xl border border-sky-500/20 bg-sky-500/[0.04] dark:bg-sky-500/[0.08]">
            <div>
              <span className="text-[11px] font-mono text-slate-400 block mb-1">Mevcut Sürüm</span>
              <span className="text-sm sm:text-base font-bold text-slate-700 dark:text-slate-300 font-mono">
                {data.currentVersion}
              </span>
            </div>

            <div className="size-8 rounded-full bg-sky-500/10 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <ArrowUpCircle className="size-5" />
            </div>

            <div className="text-right">
              <span className="text-[11px] font-mono text-emerald-500 block mb-1">Yeni Sürüm (GitHub)</span>
              <span className="text-sm sm:text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                {data.latestVersion}
              </span>
            </div>
          </div>

          {/* Sürüm Notları (Changelog) */}
          {phase === "idle" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <GitBranch className="size-3.5 text-sky-400" />
                  Sürüm Başlığı: {data.releaseName}
                </span>
                <a
                  href={data.githubUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] font-mono text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
                >
                  GitHub&apos;da Gör
                  <ExternalLink className="size-3" />
                </a>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200/80 dark:border-[#16223f] bg-slate-50/70 dark:bg-[#060a17] text-xs text-slate-700 dark:text-slate-300 font-sans whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                {data.releaseNotes || "Bu sürüm için detaylı sürüm notu girilmemiş."}
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Güncelleme sunucuda arka planda çalışır: kaynak klonda etiket alınır, ardından resmi kurulum
                betiği (<span className="font-mono">install.sh</span>) bağımlılıkları kurar, paneli derler,
                veritabanı migration&apos;larını uygular ve servisi yeniden başlatır. Bu birkaç dakika sürebilir;
                panel kısa süreliğine erişilemez olur.
              </p>
            </div>
          )}

          {/* Güncelleme Çalışırken Canlı Durum + Log */}
          {busy && (
            <div className="space-y-3">
              <div className="p-4 rounded-2xl border border-sky-500/30 bg-sky-500/10 flex items-center gap-2.5 text-xs font-bold text-sky-700 dark:text-sky-300">
                <Loader2 className="size-4 animate-spin text-sky-500 shrink-0" />
                <span>{statusMessage || "Güncelleme adımları yürütülüyor, lütfen bekleyin..."}</span>
              </div>
              <LogBox log={log} logRef={logRef} placeholder="Günlük bekleniyor..." />
            </div>
          )}

          {/* Başarı Mesajı */}
          {phase === "completed" && (
            <div className="space-y-3">
              <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 flex items-center gap-3">
                <CheckCircle2 className="size-5 text-emerald-500 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    Güncelleme başarıyla tamamlandı!
                  </p>
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {statusMessage || "Yeni sürüm aktif edildi."} Sayfa birkaç saniye içinde yenilenecek...
                  </p>
                </div>
              </div>
              <LogBox log={log} logRef={logRef} />
            </div>
          )}

          {/* Hata Mesajı */}
          {phase === "failed" && (
            <div className="space-y-3">
              <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 flex items-start gap-3">
                <AlertCircle className="size-5 text-rose-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-rose-700 dark:text-rose-300">Güncelleme Hatası</p>
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5 break-words">{error}</p>
                </div>
              </div>
              {log && <LogBox log={log} logRef={logRef} />}
            </div>
          )}
        </div>

        {/* Modal Alt Aksiyonları */}
        <div className="p-4 sm:p-6 border-t border-slate-100 dark:border-[#16223f] bg-slate-50/50 dark:bg-[#050811] flex items-center justify-end gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="rounded-xl border-slate-200 dark:border-[#1e3568] dark:text-slate-300 text-xs font-semibold cursor-pointer"
          >
            Kapat
          </Button>

          <Button
            size="sm"
            onClick={handleStartUpdate}
            disabled={busy || phase === "completed"}
            className="rounded-xl bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white text-xs font-semibold px-4 border border-[#c8a87c]/40 dark:border-[#2a4687]/70 shadow-md cursor-pointer flex items-center gap-2"
          >
            {busy ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Güncelleniyor...
              </>
            ) : phase === "completed" ? (
              <>
                <CheckCircle2 className="size-3.5 text-emerald-400" />
                Tamamlandı
              </>
            ) : phase === "failed" ? (
              <>
                <RefreshCw className="size-3.5" />
                Tekrar Dene
              </>
            ) : (
              <>
                <RefreshCw className="size-3.5" />
                Şimdi Güncelle ve Yeniden Başlat
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

function LogBox({
  log,
  logRef,
  placeholder,
}: {
  log: string
  logRef: React.RefObject<HTMLPreElement | null>
  placeholder?: string
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-[#16223f] bg-slate-950 dark:bg-[#03050c] overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-slate-800 text-[10px] font-mono text-slate-400">
        <Terminal className="size-3" />
        /var/log/panel-update/update.log
      </div>
      <pre
        ref={logRef}
        className="p-3 text-[11px] leading-relaxed font-mono text-slate-200 whitespace-pre-wrap break-words max-h-56 overflow-y-auto"
      >
        {log || placeholder || ""}
      </pre>
    </div>
  )
}
