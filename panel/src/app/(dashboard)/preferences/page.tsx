"use client"

import { Check, Moon, Palette, Sun, Type } from "lucide-react"

import { useTheme } from "@/components/theme-provider"
import { useTranslation } from "@/components/language-provider"
import { ThemePalettePicker } from "@/components/theme-palette-picker"
import { FontPicker } from "@/components/font-picker"
import { cn } from "@/lib/utils"

/**
 * "Tercihlerim" — Ayarlar sayfasının aksine SUPER_ADMIN-only DEĞİL, tüm
 * kullanıcılara açık (bkz. docs/ARCHITECTURE.md 2026-09-08 güncellemesi).
 * Burada yalnızca GERÇEKTEN kişi bazlı (tarayıcının kendi localStorage'ında
 * tutulan — bkz. theme-provider.tsx/language-provider.tsx/font-theme.ts)
 * tercihler var: dil, tema, renk paleti, font. Terminal boşta-kalma süresi
 * KASITLI burada YOK — o hâlâ tek, global bir admin ayarı (PanelSettings),
 * kişi bazlı hale getirilmedi (bkz. proje hafızası — kullanıcı bunu açıkça
 * "global admin ayarı kalsın" diye onayladı), o yüzden Ayarlar'da kalmaya
 * devam ediyor.
 */
export default function PreferencesPage() {
  const { lang, setLang } = useTranslation()
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8">
      <div className="pb-2">
        <h1 className="font-heading text-2xl md:text-3xl font-extrabold tracking-tight text-[#580619] dark:text-slate-100">
          {lang === "en" ? "My Preferences" : "Tercihlerim"}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-0.5">
          {lang === "en"
            ? "These are personal to your browser — they don't affect other users."
            : "Bunlar kişisel tercihlerinizdir, sadece bu tarayıcıyı etkiler — diğer kullanıcıları etkilemez."}
        </p>
      </div>

      {/* ═══ DİL ═══ */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-5 md:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-4">
        <div>
          <h2 className="font-heading font-bold text-base md:text-lg text-slate-900 dark:text-slate-100">
            {lang === "en" ? "Panel Language" : "Panel Dili"}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-sans">
            {lang === "en" ? "Choose the language you want to use in the panel interface." : "Panel arayüzünde kullanmak istediğiniz dili seçin."}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setLang("tr")}
            className={cn(
              "relative flex flex-col p-5 rounded-2xl text-left border transition-all cursor-pointer",
              lang === "tr"
                ? "border-primary bg-primary/10 shadow-md ring-2 ring-primary/20"
                : "border-border bg-card hover:border-primary/50"
            )}
          >
            <div className="flex items-center justify-between w-full mb-2">
              <span className="text-2xl">🇹🇷</span>
              {lang === "tr" && (
                <span className="size-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xs">
                  <Check className="size-3.5 stroke-[3] text-primary-foreground" />
                </span>
              )}
            </div>
            <h3 className="font-heading font-bold text-sm text-slate-900 dark:text-slate-100">Türkçe</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Panel arayüzünü Türkçe olarak kullanın.</p>
          </button>

          <button
            type="button"
            onClick={() => setLang("en")}
            className={cn(
              "relative flex flex-col p-5 rounded-2xl text-left border transition-all cursor-pointer",
              lang === "en"
                ? "border-primary bg-primary/10 shadow-md ring-2 ring-primary/20"
                : "border-border bg-card hover:border-primary/50"
            )}
          >
            <div className="flex items-center justify-between w-full mb-2">
              <span className="text-2xl">🇬🇧</span>
              {lang === "en" && (
                <span className="size-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xs">
                  <Check className="size-3.5 stroke-[3] text-primary-foreground" />
                </span>
              )}
            </div>
            <h3 className="font-heading font-bold text-sm text-slate-900 dark:text-slate-100">English</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Use the control panel interface in English.</p>
          </button>
        </div>
      </div>

      {/* ═══ TEMA VE RENK PALETİ ═══ */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-5 md:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-heading font-bold text-base md:text-lg text-slate-900 dark:text-slate-100">
              {lang === "en" ? "Theme" : "Tema Seçimi"}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-sans">
              {lang === "en" ? "Set whether the app appears in light or dark mode." : "Uygulamanın açık veya koyu modda görünmesini ayarlayın."}
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {lang === "en" ? "Switch:" : "Değiştir:"}
            </span>
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === "dark" ? (lang === "en" ? "Switch to light mode" : "Açık Moda Geç") : (lang === "en" ? "Switch to dark mode" : "Koyu Moda Geç")}
              className="size-9 rounded-xl border border-slate-200 dark:border-[#1e3568] bg-slate-50 dark:bg-[#101c38] hover:bg-slate-100 dark:hover:bg-[#162752] text-slate-700 dark:text-blue-300 flex items-center justify-center transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-2xs"
            >
              {theme === "dark" ? <Sun className="size-4.5 text-amber-400" /> : <Moon className="size-4.5 text-blue-500" />}
            </button>
          </div>
        </div>

        <div className="border-t border-slate-100 dark:border-[#16223f]" />

        <div className="space-y-3.5">
          <div>
            <h3 className="font-heading font-bold text-sm md:text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Palette className="size-4 text-emerald-500 dark:text-emerald-400" />
              <span>{lang === "en" ? "Color Theme" : "Renk Teması"}</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-sans leading-relaxed">
              {lang === "en"
                ? "Pick the app's color family — backgrounds, cards, borders, and accents all adapt to it. Independent of light/dark mode: mix and match freely."
                : "Uygulamanın renk ailesini seç — zeminler, kartlar, kenarlıklar ve vurgular birlikte o renge uyarlanır. Koyu/açık moddan bağımsızdır: ikisini istediğin gibi birleştirebilirsin."}
            </p>
          </div>
          <ThemePalettePicker />
        </div>
      </div>

      {/* ═══ YAZI FONTU & TİPOGRAFİ ═══ */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] p-5 md:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-4">
        <div className="flex items-center gap-3.5">
          <div className="size-10 rounded-2xl bg-sky-500/10 text-sky-700 dark:text-sky-400 flex items-center justify-center border border-transparent dark:border-sky-500/20 shadow-2xs shrink-0">
            <Type className="size-5" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-base md:text-lg text-slate-900 dark:text-slate-100">
              {lang === "en" ? "Font & Typography" : "Yazı Fontu & Tipografi"}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-sans">
              {lang === "en" ? "Choose a Google Font for panel headers and interface." : "Panel başlıkları ve arayüz için Google Fonts seçimi."}
            </p>
          </div>
        </div>
        <FontPicker />
      </div>
    </div>
  )
}
