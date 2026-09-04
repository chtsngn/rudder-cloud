"use client"

import { useState } from "react"
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
import { cn } from "@/lib/utils"

interface SystemUpdateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  versionData?: VersionData | null
}

export function SystemUpdateModal({
  open,
  onOpenChange,
  versionData,
}: SystemUpdateModalProps) {
  const { data: hookData } = useSystemVersion()
  const data = versionData || hookData

  const [updating, setUpdating] = useState(false)
  const [currentStep, setCurrentStep] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)
  const [stepLogs, setStepLogs] = useState<Array<{ step: string; status: string; output: string }>>([])

  if (!open || !data) return null

  const handleStartUpdate = async () => {
    setUpdating(true)
    setError(null)
    setCurrentStep("git_pull")
    setStepLogs([])

    try {
      const res = await fetch("/api/system/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetVersion: data.latestVersion }),
      })

      const result = await res.json()

      if (!res.ok || !result.ok) {
        throw new Error(result.error || "Güncelleme tamamlanamadı.")
      }

      setStepLogs(result.steps || [])
      setCompleted(true)

      // 3 saniye sonra sayfayı otomatik yenile
      setTimeout(() => {
        window.location.reload()
      }, 2500)
    } catch (err: any) {
      setError(err?.message || "Güncelleme sırasında beklenmeyen bir hata oluştu.")
    } finally {
      setUpdating(false)
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

          {!updating && (
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
                GitHub'da Gör
                <ExternalLink className="size-3" />
              </a>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200/80 dark:border-[#16223f] bg-slate-50/70 dark:bg-[#060a17] text-xs text-slate-700 dark:text-slate-300 font-sans whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
              {data.releaseNotes || "Bu sürüm için detaylı sürüm notu girilmemiş."}
            </div>
          </div>

          {/* Güncelleme Çalışırken Canlı Durum */}
          {updating && (
            <div className="p-4 rounded-2xl border border-sky-500/30 bg-sky-500/10 space-y-3 animate-pulse">
              <div className="flex items-center gap-2.5 text-xs font-bold text-sky-600 dark:text-sky-300">
                <Loader2 className="size-4 animate-spin text-sky-500" />
                <span>Güncelleme adımları yürütülüyor, lütfen bekleyin...</span>
              </div>
              <ul className="text-[11px] font-mono text-slate-600 dark:text-slate-400 space-y-1 pl-6 list-disc">
                <li>GitHub'dan güncel kodlar çekiliyor (`git pull`)</li>
                <li>Gerekli paketler ve şemalar eşitleniyor</li>
                <li>Uygulama yeniden derleniyor (`next build`)</li>
              </ul>
            </div>
          )}

          {/* Başarı Mesajı */}
          {completed && (
            <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 flex items-center gap-3">
              <CheckCircle2 className="size-5 text-emerald-500 shrink-0" />
              <div>
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  Güncelleme başarıyla tamamlandı!
                </p>
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                  Yeni özellikler aktif edildi. Sayfa birkaç saniye içinde yenilenecek...
                </p>
              </div>
            </div>
          )}

          {/* Hata Mesajı */}
          {error && (
            <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 flex items-center gap-3">
              <AlertCircle className="size-5 text-rose-500 shrink-0" />
              <div>
                <p className="text-xs font-bold text-rose-700 dark:text-rose-300">Güncelleme Hatası</p>
                <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Alt Aksiyonları */}
        <div className="p-4 sm:p-6 border-t border-slate-100 dark:border-[#16223f] bg-slate-50/50 dark:bg-[#050811] flex items-center justify-end gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={updating}
            className="rounded-xl border-slate-200 dark:border-[#1e3568] dark:text-slate-300 text-xs font-semibold cursor-pointer"
          >
            Kapat
          </Button>

          <Button
            size="sm"
            onClick={handleStartUpdate}
            disabled={updating || completed}
            className="rounded-xl bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white text-xs font-semibold px-4 border border-[#c8a87c]/40 dark:border-[#2a4687]/70 shadow-md cursor-pointer flex items-center gap-2"
          >
            {updating ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Güncelleniyor...
              </>
            ) : completed ? (
              <>
                <CheckCircle2 className="size-3.5 text-emerald-400" />
                Tamamlandı
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
