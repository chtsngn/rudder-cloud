"use client"

import * as React from "react"
import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { Language, getTranslation } from "@/i18n"

interface LanguageContextType {
  lang: Language
  setLang: (lang: Language) => void
  toggleLang: () => void
  t: (path: string, params?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

const LANGUAGE_STORAGE_KEY = "rudder:lang"

export function LanguageProvider({
  children,
  initialLang = "tr",
}: {
  children: React.ReactNode
  initialLang?: Language
}) {
  const [lang, setLangState] = useState<Language>(initialLang)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY) as Language | null
      if (saved === "en" || saved === "tr") {
        if (saved !== lang) {
          setLangState(saved)
          document.documentElement.lang = saved
        }
        document.cookie = `rudder_lang=${saved}; path=/; max-age=31536000; SameSite=Lax`
      } else {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, initialLang)
        document.cookie = `rudder_lang=${initialLang}; path=/; max-age=31536000; SameSite=Lax`
      }
    } catch {
      document.documentElement.lang = initialLang
    }
  }, [initialLang, lang])

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang)
    if (typeof document !== "undefined") {
      document.documentElement.lang = newLang
      document.cookie = `rudder_lang=${newLang}; path=/; max-age=31536000; SameSite=Lax`
    }
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, newLang)
    } catch {}
  }, [])

  const toggleLang = useCallback(() => {
    setLang(lang === "tr" ? "en" : "tr")
  }, [lang, setLang])

  const t = useCallback(
    (path: string, params?: Record<string, string | number>) => {
      return getTranslation(lang, path, params)
    },
    [lang]
  )

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useTranslation(): LanguageContextType {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error("useTranslation must be used within a LanguageProvider")
  }
  return context
}

export const useLanguage = useTranslation
