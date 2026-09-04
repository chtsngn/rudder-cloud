"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useTerminalDock } from "@/components/terminal-dock-context"
import { usePathname } from "next/navigation"

export function DashboardMain({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { isOpen, isMinimized, width, isDragging } = useTerminalDock()
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  const isTerminalPage = pathname === "/terminal"
  const isDockActive = isOpen && !isMinimized && !isTerminalPage && isDesktop

  return (
    <main
      style={{
        marginRight: isDockActive ? `${width}px` : 0,
        transition: isDragging
          ? "none"
          : "margin-right 200ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      className="flex-1 h-screen overflow-y-auto bg-background text-foreground min-w-0 transition-colors duration-200 p-4 sm:p-6 lg:p-8"
    >
      {children}
    </main>
  )
}