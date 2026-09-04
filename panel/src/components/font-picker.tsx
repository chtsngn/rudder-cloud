"use client"

import { useState } from "react"
import { Check, ExternalLink, Sparkles } from "lucide-react"
import { FONT_OPTIONS, useFontTheme, type FontOption } from "@/lib/font-theme"
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

export function FontPicker() {
  const { currentFont, setFont, activeOption } = useFontTheme()
  const { lang } = useTranslation()
  const [customText, setCustomText] = useState("")

  return (
    <div className="space-y-4 pt-3">
      {/* ═══ 1. KOMPAKT CANLI TEST ŞERİDİ (TEK SATIRLIK KİBAR ÖNİZLEME) ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200/80 dark:border-[#16223f] bg-slate-50/60 dark:bg-[#060a17]/70">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/20 text-[11px] font-mono font-semibold text-sky-700 dark:text-sky-300 shrink-0">
            {activeOption.name}
          </div>
          <p
            style={{
              fontFamily: activeOption.family,
              fontWeight: activeOption.category === "Cursive" || activeOption.id === "joan" ? 400 : 600,
            }}
            className="text-base sm:text-lg text-slate-900 dark:text-slate-100 truncate"
          >
            {customText || (lang === "en" ? "Rudder Cloud — Noble helm rising through the mists" : "Rudder Cloud — Sislerin arasından doğan asil dümen")}
          </p>
        </div>

        {/* Canlı Test Kutusu */}
        <input
          type="text"
          placeholder={lang === "en" ? "Type to test font..." : "Yazıp test edin..."}
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          className="w-full sm:w-44 px-3 py-1 text-xs rounded-lg bg-white dark:bg-[#090e1f] border border-slate-200 dark:border-[#1e3568] text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all font-sans shrink-0"
        />
      </div>

      {/* ═══ 2. 5 FONT KOMPAKT SEÇİM KARTLARI (KİBAR & ŞIK 5'Lİ GRID) ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {FONT_OPTIONS.map((font: FontOption) => {
          const isSelected = font.id === currentFont
          const preview = FONT_PREVIEWS[font.id] ?? {
            titleTr: font.name,
            titleEn: font.name,
            subTr: font.category,
            subEn: font.category,
          }

          return (
            <div
              key={font.id}
              onClick={() => setFont(font.id)}
              className={cn(
                "group relative flex flex-col justify-between rounded-xl p-3.5 border transition-all duration-150 cursor-pointer select-none",
                isSelected
                  ? "bg-sky-500/[0.08] dark:bg-sky-500/[0.12] border-sky-500 dark:border-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.15)] ring-1.5 ring-sky-500"
                  : "bg-white dark:bg-[#090e1f] border-slate-200/80 dark:border-[#16223f] hover:border-slate-300 dark:hover:border-[#2a4687] hover:bg-slate-50/50 dark:hover:bg-[#0d1633]/50 shadow-2xs hover:-translate-y-0.5"
              )}
            >
              {/* Kart Üstü: Başlık & Seçim İkonu */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4
                    style={{
                      fontFamily: font.family,
                      fontWeight: font.category === "Cursive" || font.id === "joan" ? 400 : 700,
                    }}
                    className="text-lg text-slate-900 dark:text-slate-100 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors leading-tight"
                  >
                    {font.name}
                  </h4>
                  <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                    {font.category}
                  </span>
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

              {/* ═══ KÜÇÜK TİPOGRAFİ & ARAYÜZ ÖNİZLEMESİ ═══ */}
              <div className="my-2.5 p-2 rounded-lg bg-slate-100/70 dark:bg-[#05091a]/80 border border-slate-200/70 dark:border-[#16223f] flex items-center gap-2.5">
                <div
                  style={{
                    fontFamily: font.family,
                    fontWeight: font.category === "Cursive" || font.id === "joan" ? 400 : 700,
                  }}
                  className="size-8.5 rounded-md bg-white dark:bg-[#0d1633] border border-slate-200 dark:border-[#1e3568]/60 flex items-center justify-center text-lg font-bold text-sky-600 dark:text-sky-400 shadow-2xs shrink-0 select-none"
                >
                  Aa
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    style={{
                      fontFamily: font.family,
                      fontWeight: font.category === "Cursive" || font.id === "joan" ? 400 : 600,
                    }}
                    className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate leading-tight"
                  >
                    {lang === "en" ? preview.titleEn : preview.titleTr}
                  </div>
                  <div
                    style={{ fontFamily: font.family }}
                    className="text-[11px] text-slate-500 dark:text-slate-400 truncate leading-tight mt-0.5"
                  >
                    {lang === "en" ? preview.subEn : preview.subTr}
                  </div>
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
        <span>{lang === "en" ? "Selected font applies instantly to menus, cards, dialogs, and pages." : "Seçilen font (sol üst logo hariç) menü, kartlar, pencereler ve tüm sayfalara anında yansır."}</span>
      </p>
    </div>
  )
}
