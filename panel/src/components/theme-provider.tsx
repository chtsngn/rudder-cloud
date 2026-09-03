"use client"

import * as React from "react"
import { createContext, useContext, useEffect, useState } from "react"

export type Theme = "light" | "dark"

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const THEME_STORAGE_KEY = "rudder:theme"

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null
        if (saved === "light") return "light"
        return "dark"
      } catch {}
    }
    return "dark"
  })
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null
      if (savedTheme === "light") {
        setThemeState("light")
        applyTheme("light")
      } else {
        // Varsayılan: koyu tema (Gece Mavisi / Okyanus)
        setThemeState("dark")
        applyTheme("dark")
      }
    } catch {
      applyTheme("dark")
    }
    setMounted(true)
  }, [])

  const applyTheme = (t: Theme) => {
    const root = document.documentElement
    if (t === "dark") {
      root.classList.add("dark")
      root.setAttribute("data-theme", "dark")
      root.style.colorScheme = "dark"
    } else {
      root.classList.remove("dark")
      root.setAttribute("data-theme", "light")
      root.style.colorScheme = "light"
    }
  }

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme)
    applyTheme(newTheme)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme)
    } catch {}
  }

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light")
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}