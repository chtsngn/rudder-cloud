"use client"

import type { ReactNode } from "react"
import { useTerminalDock } from "@/components/terminal-dock-context"
import { usePathname } from "next/navigation"

export function DashboardMain({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { isOpen, isMinimized, width, isDragging } = useTerminalDock()

  const isTerminalPage = pathname === "/terminal"
  const isDockActive = isOpen && !isMinimized && !isTerminalPage

  return (
    <main
      style={{
        marginRight: isDockActive ? `${width}px` : 0,
        transition: isDragging
          ? "none"
          : "margin-right 200ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      className="flex-1 h-screen overflow-y-auto bg-background text-foreground p-6 md:p-8 lg:p-10 min-w-0 transition-colors duration-200"
    >
      {children}
    </main>
  )
}