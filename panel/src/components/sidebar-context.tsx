"use client"

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react"

interface SidebarContextValue {
  mobileOpen: boolean
  openMobile: () => void
  closeMobile: () => void
  toggleMobile: () => void
}

const SidebarContext = createContext<SidebarContextValue>({
  mobileOpen: false,
  openMobile: () => {},
  closeMobile: () => {},
  toggleMobile: () => {},
})

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  const openMobile = useCallback(() => setMobileOpen(true), [])
  const closeMobile = useCallback(() => setMobileOpen(false), [])
  const toggleMobile = useCallback(() => setMobileOpen((p) => !p), [])

  const value = useMemo(
    () => ({
      mobileOpen,
      openMobile,
      closeMobile,
      toggleMobile,
    }),
    [mobileOpen, openMobile, closeMobile, toggleMobile]
  )

  return (
    <SidebarContext.Provider value={value}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  return useContext(SidebarContext)
}
