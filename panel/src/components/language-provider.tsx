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

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY) as Language | null
        if (saved === "en" || saved === "tr") return saved
      } catch {}
    }
    return "tr"
  })

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY) as Language | null
      if (saved === "en" || saved === "tr") {
        setLangState(saved)
        document.documentElement.lang = saved
      } else {
        setLangState("tr")
        document.documentElement.lang = "tr"
      }
    } catch {
      document.documentElement.lang = "tr"
    }
  }, [])

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang)
    if (typeof document !== "undefined") {
      document.documentElement.lang = newLang
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
