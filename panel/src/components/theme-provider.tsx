"use client"

import * as React from "react"
import { createContext, useContext, useEffect, useState } from "react"
import { applyTheme as applyColorTheme } from "@/lib/color-theme"

export type Theme = "light" | "dark"

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const THEME_STORAGE_KEY = "rudder:theme"

export function ThemeProvider({
  children,
  initialTheme = "dark",
}: {
  children: React.ReactNode
  initialTheme?: Theme
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null
      if (savedTheme === "light" || savedTheme === "dark") {
        if (savedTheme !== theme) {
          setThemeState(savedTheme)
          applyTheme(savedTheme)
        } else {
          applyTheme(savedTheme)
        }
        document.cookie = `rudder_theme=${savedTheme}; path=/; max-age=31536000; SameSite=Lax`
      } else {
        applyTheme(initialTheme)
        document.cookie = `rudder_theme=${initialTheme}; path=/; max-age=31536000; SameSite=Lax`
      }
    } catch {
      applyTheme(initialTheme)
    }
    setMounted(true)
  }, [initialTheme, theme])

  const applyTheme = (t: Theme) => {
    const root = document.documentElement
    if (t === "dark") {
      root.classList.add("dark")
      root.classList.remove("light")
      root.setAttribute("data-theme", "dark")
      root.style.colorScheme = "dark"
    } else {
      root.classList.remove("dark")
      root.classList.add("light")
      root.setAttribute("data-theme", "light")
      root.style.colorScheme = "light"
    }
    applyColorTheme()
  }

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme)
    applyTheme(newTheme)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme)
      document.cookie = `rudder_theme=${newTheme}; path=/; max-age=31536000; SameSite=Lax`
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