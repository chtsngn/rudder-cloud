import type { ReactNode } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { TerminalDockProvider } from "@/components/terminal-dock-context"
import { SideTerminalDock } from "@/components/side-terminal-dock"
import { DashboardMain } from "@/components/dashboard-main"

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <TerminalDockProvider>
      <div className="flex h-screen w-full overflow-hidden bg-[#f8fafc] relative">
        <AppSidebar />
        <DashboardMain>
          {children}
        </DashboardMain>
        <SideTerminalDock />
      </div>
    </TerminalDockProvider>
  )
}