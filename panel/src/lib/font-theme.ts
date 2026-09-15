"use client"

import { useEffect, useState, useTransition } from "react"
import { APP_VERSION } from "@/lib/version"

export const FONT_STORAGE_KEY = "app_font_family"
export const DEFAULT_FONT_ID = "grenze"

export interface FontOption {
  id: string
  name: string
  family: string
  className: string
  category: "Serif" | "Cursive"
  isDefault?: boolean
  badge?: string
  description: string
  googleUrl: string
  previewText: string
  sampleHeading: string
  tags: string[]
}

export const FONT_OPTIONS: FontOption[] = [
  {
    id: "grenze",
    name: "Grenze",
    family: "'Grenze', serif",
    className: "font-grenze",
    category: "Serif",
    isDefault: true,
    badge: "Varsayılan",
    description: "Gotik ve denizcilik ruhunu taşıyan yüksek kontrastlı, asil başlık fontu.",
    googleUrl: "https://fonts.google.com/specimen/Grenze",
    previewText: "Puslu göklerin derinliklerinde, sislerin arasından doğan dümenin başında.",
    sampleHeading: `Rudder Cloud ${APP_VERSION}`,
    tags: ["Varsayılan", "Gotik Asalet", "Yüksek Kontrast"],
  },
  {
    id: "jim-nightshade",
    name: "Jim Nightshade",
    family: "'Jim Nightshade', cursive",
    className: "font-jim-nightshade",
    category: "Cursive",
    description: "Gizemli, dramatik ve fırtınalı kaptan seyir defteri el yazısı tarzı.",
    googleUrl: "https://fonts.google.com/specimen/Jim+Nightshade",
    previewText: "Puslu göklerin derinliklerinde, sislerin arasından doğan dümenin başında.",
    sampleHeading: `Rudder Cloud ${APP_VERSION}`,
    tags: ["Dramatik", "El Yazısı", "Korsan & Macera"],
  },
  {
    id: "cormorant-upright",
    name: "Cormorant Upright",
    family: "'Cormorant Upright', serif",
    className: "font-cormorant",
    category: "Serif",
    description: "Zarif, dik eksenli kaligrafik kıvrımlara sahip lüks ve klasik tipografi.",
    googleUrl: "https://fonts.google.com/specimen/Cormorant+Upright",
    previewText: "Puslu göklerin derinliklerinde, sislerin arasından doğan dümenin başında.",
    sampleHeading: `Rudder Cloud ${APP_VERSION}`,
    tags: ["Lüks", "Kaligrafik", "Klasik Zarafet"],
  },
  {
    id: "joan",
    name: "Joan",
    family: "'Joan', serif",
    className: "font-joan",
    category: "Serif",
    description: "Sıcak, dengeli, yuvarlatılmış harf yapısıyla zamansız edebi bir dokunuş.",
    googleUrl: "https://fonts.google.com/specimen/Joan",
    previewText: "Puslu göklerin derinliklerinde, sislerin arasından doğan dümenin başında.",
    sampleHeading: `Rudder Cloud ${APP_VERSION}`,
    tags: ["Sıcak", "Edebi", "Modern Serif"],
  },
  {
    id: "twinkle-star",
    name: "Twinkle Star",
    family: "'Twinkle Star', cursive",
    className: "font-twinkle",
    category: "Cursive",
    description: "Yıldızlı gecelerin neşesini ve samimiyetini yansıtan serbest el yazısı.",
    googleUrl: "https://fonts.google.com/specimen/Twinkle+Star",
    previewText: "Puslu göklerin derinliklerinde, sislerin arasından doğan dümenin başında.",
    sampleHeading: `Rudder Cloud ${APP_VERSION}`,
    tags: ["Neşeli", "Samimi", "Yıldızlı Gece"],
  },
]

const FONT_CSS_VARS = ["--app-font", "--font-sans", "--font-heading", "--app-font-heading"] as const

/** Fontu DOM'a uygular — kalıcılık YOK (applyFont ve previewFont ortak kullanır). */
function setDocumentFont(font: FontOption) {
  const root = document.documentElement
  root.setAttribute("data-font", font.id)
  for (const target of [root, document.body]) {
    if (!target) continue
    for (const cssVar of FONT_CSS_VARS) target.style.setProperty(cssVar, font.family)
  }
}

function resolveFont(fontId: string | null | undefined): FontOption {
  return FONT_OPTIONS.find((f) => f.id === fontId) ?? FONT_OPTIONS[0]
}

/**
 * Seçilen fontu DOM'a uygular, localStorage ve cookie'ye kaydeder.
 */
export function applyFont(fontId: string) {
  if (typeof document === "undefined") return

  const font = resolveFont(fontId)
  setDocumentFont(font)

  try {
    localStorage.setItem(FONT_STORAGE_KEY, font.id)
    document.cookie = `rudder_font=${font.id}; path=/; max-age=31536000; SameSite=Lax`
  } catch {}

  // Uygulama içi dinleyicileri tetikle
  window.dispatchEvent(new CustomEvent("rudder:font-change", { detail: font.id }))
}

/**
 * GEÇİCİ önizleme (Tercihlerim → font kartı üzerine gelince): tüm arayüzü
 * anlık olarak o fontla gösterir ama HİÇBİR ŞEY kaydetmez ve olay yaymaz —
 * kayıtlı seçim değişmez. `null` → kayıtlı fonta geri döner. Kullanıcı
 * "seçmeden önce nasıl görünüyor" diye bakabilsin diye (2026-09-15).
 */
export function previewFont(fontId: string | null) {
  if (typeof document === "undefined") return
  setDocumentFont(fontId ? resolveFont(fontId) : resolveFont(getSavedFont()))
}

/**
 * Kayıtlı font ID'sini döndürür (varsayılan: grenze)
 */
export function getSavedFont(): string {
  if (typeof window === "undefined") return DEFAULT_FONT_ID
  try {
    const saved = localStorage.getItem(FONT_STORAGE_KEY)
    if (saved && FONT_OPTIONS.some((f) => f.id === saved)) {
      return saved
    }
  } catch {}
  return DEFAULT_FONT_ID
}

/**
 * React hook: Seçili fontu izler ve değiştirilmesini sağlar.
 */
export function useFontTheme() {
  const [currentFont, setCurrentFont] = useState<string>(DEFAULT_FONT_ID)
  const [, startTransition] = useTransition()

  useEffect(() => {
    // Bir sonraki makrotaska ertelenir (projedeki diğer effect'lerle aynı
    // disiplin — react-hooks/set-state-in-effect); SSR ile ilk render'da
    // varsayılan font gösterilip hydration sonrası kayıtlı font uygulanır.
    const timer = setTimeout(() => {
      const saved = getSavedFont()
      setCurrentFont(saved)
      applyFont(saved)
    }, 0)

    const handleFontChange = (e: Event) => {
      const customEvent = e as CustomEvent<string>
      if (customEvent.detail) {
        setCurrentFont(customEvent.detail)
      }
    }

    window.addEventListener("rudder:font-change", handleFontChange)
    return () => {
      clearTimeout(timer)
      window.removeEventListener("rudder:font-change", handleFontChange)
    }
  }, [])

  const setFont = (fontId: string) => {
    startTransition(() => {
      setCurrentFont(fontId)
      applyFont(fontId)
    })
  }

  const activeOption = FONT_OPTIONS.find((f) => f.id === currentFont) ?? FONT_OPTIONS[0]

  return {
    currentFont,
    activeOption,
    setFont,
    fontOptions: FONT_OPTIONS,
  }
}
