"use client"

import React, { createContext, useContext, useEffect, useState, useCallback } from "react"

interface TerminalDockContextType {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  toggleDock: () => void
  openDock: () => void
  closeDock: () => void
  width: number
  setWidth: (width: number) => void
  isMinimized: boolean
  setIsMinimized: (minimized: boolean) => void
}

const TerminalDockContext = createContext<TerminalDockContextType | null>(null)

const DOCK_STORAGE_KEY = "rudder:terminal:dock-open"
const DOCK_WIDTH_KEY = "rudder:terminal:dock-width"

export function TerminalDockProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpenState] = useState(false)
  const [width, setWidthState] = useState(520)
  const [isMinimized, setIsMinimized] = useState(false)

  useEffect(() => {
    try {
      const savedOpen = localStorage.getItem(DOCK_STORAGE_KEY)
      if (savedOpen !== null) {
        setIsOpenState(savedOpen === "true")
      }
      const savedWidth = localStorage.getItem(DOCK_WIDTH_KEY)
      if (savedWidth) {
        const parsed = parseInt(savedWidth, 10)
        if (!isNaN(parsed) && parsed >= 360 && parsed <= 1200) {
          setWidthState(parsed)
        }
      }
    } catch {}
  }, [])

  const setIsOpen = useCallback((open: boolean) => {
    setIsOpenState(open)
    if (open) setIsMinimized(false)
    try {
      localStorage.setItem(DOCK_STORAGE_KEY, open ? "true" : "false")
    } catch {}
  }, [])

  const toggleDock = useCallback(() => {
    setIsOpenState((prev) => {
      const next = !prev
      if (next) setIsMinimized(false)
      try {
        localStorage.setItem(DOCK_STORAGE_KEY, next ? "true" : "false")
      } catch {}
      return next
    })
  }, [])

  const openDock = useCallback(() => {
    setIsOpen(true)
    setIsMinimized(false)
  }, [setIsOpen])

  const closeDock = useCallback(() => {
    setIsOpen(false)
  }, [setIsOpen])

  const setWidth = useCallback((newWidth: number) => {
    const clamped = Math.max(380, Math.min(window.innerWidth * 0.75, newWidth))
    setWidthState(clamped)
    try {
      localStorage.setItem(DOCK_WIDTH_KEY, clamped.toString())
    } catch {}
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "" || e.key === "j" || e.key === "J")) {
        e.preventDefault()
        toggleDock()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleDock])

  return (
    <TerminalDockContext.Provider
      value={{
        isOpen,
        setIsOpen,
        toggleDock,
        openDock,
        closeDock,
        width,
        setWidth,
        isMinimized,
        setIsMinimized,
      }}
    >
      {children}
    </TerminalDockContext.Provider>
  )
}

export function useTerminalDock() {
  const context = useContext(TerminalDockContext)
  if (!context) {
    throw new Error("useTerminalDock must be used within a TerminalDockProvider")
  }
  return context
}