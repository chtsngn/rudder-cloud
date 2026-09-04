"use client"

import { useState } from "react"
import { Check, ExternalLink, Sparkles, Type } from "lucide-react"
import { FONT_OPTIONS, useFontTheme, type FontOption } from "@/lib/font-theme"
import { cn } from "@/lib/utils"

export function FontPicker() {
  const { currentFont, setFont, activeOption } = useFontTheme()
  const [customPreview, setCustomPreview] = useState("")

  return (
    <div className="space-y-5">
      {/* ═══ 1. SEÇİLİ FONT CANLI VİTRİNİ (LIVE SHOWCASE BANNER) ═══ */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-slate-50/80 dark:bg-[#060a17]/90 p-5 md:p-6 space-y-4 shadow-inner">
        {/* Arka plan hafif ışıma efekti */}
        <div className="absolute top-0 right-0 size-64 bg-radial from-sky-500/10 dark:from-sky-400/10 via-transparent to-transparent blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10 border-b border-slate-200/60 dark:border-[#16223f] pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-xl bg-slate-200/70 dark:bg-[#101c38] text-slate-800 dark:text-sky-400 flex items-center justify-center border border-slate-300/60 dark:border-[#1e3568]/50 shadow-2xs">
              <Type className="size-4" />
            </div>
            <div>
              <span className="text-[11px] font-mono uppercase tracking-widest text-slate-500 dark:text-slate-400 font-semibold">
                Aktif Başlık Fontu
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  style={{ fontFamily: activeOption.family }}
                  className="text-lg md:text-xl font-bold text-slate-900 dark:text-slate-100"
                >
                  {activeOption.name}
                </span>
                {activeOption.isDefault && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/20">
                    Varsayılan
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-200/60 dark:bg-[#101c38]">
                  {activeOption.category}
                </span>
              </div>
            </div>
          </div>

          {/* Hızlı Önizleme Girişi */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Önizleme metni yazın..."
              value={customPreview}
              onChange={(e) => setCustomPreview(e.target.value)}
              className="w-full sm:w-56 px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-[#090e1f] border border-slate-200 dark:border-[#1e3568] text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-all font-sans"
            />
            {customPreview && (
              <button
                type="button"
                onClick={() => setCustomPreview("")}
                className="text-[11px] font-mono text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer underline px-1"
              >
                Sıfırla
              </button>
            )}
          </div>
        </div>

        {/* Canlı Tipografi Alanı */}
        <div className="space-y-2.5 relative z-10">
          <h2
            style={{ fontFamily: activeOption.family }}
            className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-slate-100 tracking-wide transition-all duration-200"
          >
            {customPreview || "Rudder Cloud v1.1.0"}
          </h2>

          <p
            style={{ fontFamily: activeOption.family }}
            className="text-sm sm:text-base text-slate-700 dark:text-slate-300 font-medium leading-relaxed transition-all duration-200"
          >
            {customPreview
              ? customPreview
              : "Bulut sunucularınızın mutlak kontrolü; puslu göklerin derinliklerinde, sislerin arasından doğan asil dümenin başında."}
          </p>

          <div className="pt-2 text-[11px] font-mono text-slate-500 dark:text-slate-400 tracking-wider flex flex-wrap gap-x-3 gap-y-1">
            <span>Aa Bb Cc Çç Dd Ee Ff Gg Ğğ Hh Iı İi Jj Kk Ll Mm Nn Oo Öö Pp Rr Ss Şş Tt Uu Üü Vv Yy Zz</span>
            <span>•</span>
            <span>0123456789</span>
          </div>
        </div>
      </div>

      {/* ═══ 2. 5 FONT SEÇİM KARTLARI (GRID OF FONT PREVIEWS) ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {FONT_OPTIONS.map((font: FontOption) => {
          const isSelected = font.id === currentFont

          return (
            <div
              key={font.id}
              onClick={() => setFont(font.id)}
              className={cn(
                "group relative flex flex-col justify-between rounded-2xl p-4 md:p-4.5 border transition-all duration-200 cursor-pointer select-none",
                isSelected
                  ? "bg-sky-500/[0.06] dark:bg-sky-500/[0.08] border-sky-500 dark:border-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.18)] ring-2 ring-sky-500/20"
                  : "bg-white dark:bg-[#090e1f] border-slate-200/90 dark:border-[#16223f] hover:border-slate-300 dark:hover:border-[#2a4687] hover:bg-slate-50/60 dark:hover:bg-[#0d1633]/60 shadow-2xs hover:shadow-xs hover:-translate-y-0.5"
              )}
            >
              {/* Kart Üst Başlığı & İkon */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3
                      style={{ fontFamily: font.family }}
                      className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors"
                    >
                      {font.name}
                    </h3>
                  </div>
                  <span className="inline-block mt-0.5 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    {font.category}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {font.isDefault && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                      Varsayılan
                    </span>
                  )}
                  {isSelected ? (
                    <div className="size-6 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-xs animate-in zoom-in-50 duration-150">
                      <Check className="size-3.5 stroke-[3]" />
                    </div>
                  ) : (
                    <div className="size-6 rounded-full border border-slate-200 dark:border-[#1e3568] group-hover:border-slate-400 dark:group-hover:border-[#38bdf8]/50 transition-colors" />
                  )}
                </div>
              </div>

              {/* Canlı Font Önizleme Paragrafı */}
              <div className="space-y-1.5 my-2">
                <p
                  style={{ fontFamily: font.family }}
                  className="text-base md:text-lg font-semibold text-slate-800 dark:text-slate-200 leading-snug line-clamp-2"
                >
                  {font.sampleHeading}
                </p>
                <p
                  style={{ fontFamily: font.family }}
                  className="text-xs md:text-sm text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2"
                >
                  {font.previewText}
                </p>
              </div>

              {/* Kart Altı: Etiketler & Google Fonts Bağlantısı */}
              <div className="pt-3 border-t border-slate-100 dark:border-[#16223f] flex items-center justify-between gap-2 mt-2">
                <div className="flex flex-wrap items-center gap-1">
                  {font.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.5 rounded-md text-[9px] font-mono bg-slate-100 dark:bg-[#101c38] text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-[#1e3568]/40"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <a
                  href={font.googleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title={`${font.name} Google Fonts Sayfası`}
                  className="size-7 rounded-lg text-slate-400 hover:text-sky-500 dark:hover:text-sky-400 hover:bg-slate-100 dark:hover:bg-[#101c38] flex items-center justify-center transition-colors shrink-0"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
            </div>
          )
        })}
      </div>

      {/* Bilgilendirme Notu */}
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100/70 dark:bg-[#0c142b]/70 border border-slate-200/80 dark:border-[#16223f] text-xs text-slate-600 dark:text-slate-400">
        <Sparkles className="size-3.5 text-sky-500 shrink-0" />
        <span>
          Seçtiğiniz yazı tipi; sayfa başlıklarına, panel kartlarına, sayaçlara ve modal pencerelerine anında uygulanır ve tarayıcınıza kaydedilir.
        </span>
      </div>
    </div>
  )
}
