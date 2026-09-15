"use client"

import { useEffect, useState, type CSSProperties } from "react"
import { Check, ExternalLink, Eye, Sparkles } from "lucide-react"
import { FONT_OPTIONS, previewFont, useFontTheme, type FontOption } from "@/lib/font-theme"
import { useTranslation } from "@/components/language-provider"
import { cn } from "@/lib/utils"

const FONT_PREVIEWS: Record<string, { titleTr: string; titleEn: string; subTr: string; subEn: string }> = {
  grenze: {
    titleTr: "Sunucu Paneli",
    titleEn: "Server Panel",
    subTr: "%99.9 Çevrimiçi • 2026",
    subEn: "99.9% Online • 2026",
  },
  "jim-nightshade": {
    titleTr: "Seyir Defteri",
    titleEn: "Captain's Log",
    subTr: "Rotada 18 Mil • 1840",
    subEn: "18 Miles On Route",
  },
  "cormorant-upright": {
    titleTr: "Bulut Altyapısı",
    titleEn: "Cloud Infra",
    subTr: "SSL & Nginx Aktif",
    subEn: "SSL & Nginx Active",
  },
  joan: {
    titleTr: "Sistem Servisleri",
    titleEn: "System Services",
    subTr: "Duru & Denge • 24/7",
    subEn: "Clean & Modern • 24/7",
  },
  "twinkle-star": {
    titleTr: "Yıldızlı Gökyüzü",
    titleEn: "Starry Night",
    subTr: "Hızlı Dağıtım • Canlı",
    subEn: "Fast Deploy • Live",
  },
}

/**
 * Bir elemanı (ve altındakileri) belirli bir fontla render eder — globals.css'teki
 * "her şey seçili fontta" `!important` kuralını `[data-font-preview]` istisnası
 * aşar (bkz. globals.css). Font ailesi `--preview-font` CSS değişkeniyle geçer:
 * inline custom property'yi hiçbir stylesheet kuralı ezemez.
 */
function previewStyle(font: FontOption, weight?: number): CSSProperties {
  return { "--preview-font": font.family, fontWeight: weight } as CSSProperties
}

function titleWeight(font: FontOption): number {
  return font.category === "Cursive" || font.id === "joan" ? 400 : 700
}

function bodyWeight(font: FontOption): number {
  return font.category === "Cursive" || font.id === "joan" ? 400 : 600
}

export function FontPicker() {
  const { currentFont, setFont, activeOption } = useFontTheme()
  const { lang } = useTranslation()
  const [customText, setCustomText] = useState("")
  // Üzerine gelinen/odaklanılan kart: hem üstteki şeritte hem TÜM arayüzde
  // geçici olarak gösterilir (previewFont) — tıklanana kadar kayıtlı seçim
  // değişmez. Sayfadan ayrılırken kayıtlı fonta geri dönülür.
  const [hovered, setHovered] = useState<string | null>(null)

  useEffect(() => {
    return () => previewFont(null)
  }, [])

  const hoveredOption = hovered ? FONT_OPTIONS.find((f) => f.id === hovered) ?? null : null
  const shownOption = hoveredOption ?? activeOption
  const isPreviewing = hoveredOption !== null && hoveredOption.id !== currentFont

  function startPreview(fontId: string) {
    setHovered(fontId)
    previewFont(fontId)
  }

  function endPreview() {
    setHovered(null)
    previewFont(null)
  }

  function select(fontId: string) {
    setFont(fontId)
  }

  const sampleSentence =
    customText ||
    (lang === "en" ? "Rudder Cloud — Noble helm rising through the mists" : "Rudder Cloud — Sislerin arasından doğan asil dümen")

  return (
    <div className="space-y-4 pt-3">
      {/* ═══ 1. CANLI TEST ŞERİDİ — üzerine gelinen (yoksa seçili) fontla ═══ */}
      <div
        className={cn(
          "flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border transition-colors",
          isPreviewing
            ? "border-amber-300/80 dark:border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20"
            : "border-slate-200/80 dark:border-[#16223f] bg-slate-50/60 dark:bg-[#060a17]/70"
        )}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <div
            className={cn(
              "px-2.5 py-1 rounded-lg border text-[11px] font-mono font-semibold shrink-0 flex items-center gap-1.5",
              isPreviewing
                ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300"
                : "bg-sky-500/10 border-sky-500/20 text-sky-700 dark:text-sky-300"
            )}
          >
            {isPreviewing && <Eye className="size-3" />}
            {isPreviewing ? (lang === "en" ? `Previewing: ${shownOption.name}` : `Önizleme: ${shownOption.name}`) : shownOption.name}
          </div>
          <p
            data-font-preview
            style={previewStyle(shownOption, bodyWeight(shownOption))}
            className="text-base sm:text-lg text-slate-900 dark:text-slate-100 truncate"
          >
            {sampleSentence}
          </p>
        </div>

        {/* Canlı Test Kutusu — yazılan metin şeritte ve her kartta o kartın fontuyla görünür */}
        <input
          type="text"
          placeholder={lang === "en" ? "Type to test all fonts..." : "Yazın, tüm fontlarda görün..."}
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          className="w-full sm:w-52 px-3 py-1 text-xs rounded-lg bg-white dark:bg-[#090e1f] border border-slate-200 dark:border-[#1e3568] text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all font-sans shrink-0"
        />
      </div>

      {/* ═══ 2. FONT KARTLARI — her kart KENDİ fontuyla; hover = tüm arayüzde önizleme, tık = seç ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3" onMouseLeave={endPreview}>
        {FONT_OPTIONS.map((font: FontOption) => {
          const isSelected = font.id === currentFont
          const isHovered = font.id === hovered
          const preview = FONT_PREVIEWS[font.id] ?? {
            titleTr: font.name,
            titleEn: font.name,
            subTr: font.category,
            subEn: font.category,
          }

          return (
            <div
              key={font.id}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              onClick={() => select(font.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  select(font.id)
                }
              }}
              onMouseEnter={() => startPreview(font.id)}
              onFocus={() => startPreview(font.id)}
              onBlur={endPreview}
              className={cn(
                "group relative flex flex-col justify-between rounded-xl p-3.5 border transition-all duration-150 cursor-pointer select-none outline-none",
                isSelected
                  ? "bg-sky-500/[0.08] dark:bg-sky-500/[0.12] border-sky-500 dark:border-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.15)] ring-1.5 ring-sky-500"
                  : "bg-white dark:bg-[#090e1f] border-slate-200/80 dark:border-[#16223f] hover:border-slate-300 dark:hover:border-[#2a4687] hover:bg-slate-50/50 dark:hover:bg-[#0d1633]/50 shadow-2xs hover:-translate-y-0.5",
                !isSelected && isHovered && "border-amber-300 dark:border-amber-500/50"
              )}
            >
              {/* Kart Üstü: Başlık (kendi fontuyla) & Seçim İkonu */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4
                    data-font-preview
                    style={previewStyle(font, titleWeight(font))}
                    className="text-lg text-slate-900 dark:text-slate-100 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors leading-tight"
                  >
                    {font.name}
                  </h4>
                  <span className="text-[10px] font-mono text-slate-400 block mt-0.5">{font.category}</span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {font.isDefault && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      {lang === "en" ? "Default" : "Varsayılan"}
                    </span>
                  )}
                  {isSelected ? (
                    <div className="size-5 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-xs">
                      <Check className="size-3 stroke-[3]" />
                    </div>
                  ) : (
                    <div className="size-5 rounded-full border border-slate-200 dark:border-[#1e3568] group-hover:border-slate-400 dark:group-hover:border-sky-400 transition-colors" />
                  )}
                </div>
              </div>

              {/* ═══ ÖRNEK: harf seti + arayüz metni, hepsi bu kartın fontuyla ═══ */}
              <div
                data-font-preview
                style={previewStyle(font)}
                className="my-2.5 p-2 rounded-lg bg-slate-100/70 dark:bg-[#05091a]/80 border border-slate-200/70 dark:border-[#16223f] space-y-1.5"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    style={{ fontWeight: titleWeight(font) }}
                    className="size-8.5 rounded-md bg-white dark:bg-[#0d1633] border border-slate-200 dark:border-[#1e3568]/60 flex items-center justify-center text-lg text-sky-600 dark:text-sky-400 shadow-2xs shrink-0 select-none"
                  >
                    Aa
                  </div>
                  <div className="min-w-0 flex-1">
                    <div style={{ fontWeight: bodyWeight(font) }} className="text-xs text-slate-800 dark:text-slate-200 truncate leading-tight">
                      {customText || (lang === "en" ? preview.titleEn : preview.titleTr)}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate leading-tight mt-0.5">
                      {lang === "en" ? preview.subEn : preview.subTr}
                    </div>
                  </div>
                </div>
                <div className="text-[13px] leading-snug text-slate-700 dark:text-slate-300 truncate border-t border-slate-200/70 dark:border-[#16223f] pt-1.5">
                  AaBbÇçĞğİıÖöŞşÜü 0123456789
                </div>
              </div>

              {/* Kart Altı: Tek Etiket & Google Fonts Bağlantısı */}
              <div className="pt-2 border-t border-slate-100 dark:border-[#16223f] flex items-center justify-between gap-1 text-[10px] font-mono text-slate-400">
                <span className="truncate">{font.tags[1] || font.tags[0]}</span>
                <a
                  href={font.googleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title={`${font.name} Google Fonts`}
                  className="size-5 rounded text-slate-400 hover:text-sky-500 dark:hover:text-sky-400 flex items-center justify-center transition-colors"
                >
                  <ExternalLink className="size-3" />
                </a>
              </div>
            </div>
          )
        })}
      </div>

      {/* İnce Bilgi İpucu */}
      <p className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1.5 pt-1">
        <Sparkles className="size-3 text-sky-400 shrink-0" />
        <span>
          {lang === "en"
            ? "Hover a card to preview that font across the whole panel; click to apply. The selection is saved instantly (the top-left logo keeps its own font)."
            : "Bir kartın üzerine gelince o font tüm panelde geçici olarak görünür; tıklayınca uygulanır ve anında kaydedilir (sol üst logo kendi fontunda kalır)."}
        </span>
      </p>
    </div>
  )
}
