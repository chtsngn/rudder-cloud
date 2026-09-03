import type { ReactNode } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { TerminalDockProvider } from "@/components/terminal-dock-context"
import { SideTerminalDock } from "@/components/side-terminal-dock"
import { DashboardMain } from "@/components/dashboard-main"
import { SidebarProvider } from "@/components/sidebar-context"

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <TerminalDockProvider>
        <div className="flex h-screen w-full overflow-hidden bg-background text-foreground relative">
          <AppSidebar />
          <DashboardMain>
            {children}
          </DashboardMain>
          <SideTerminalDock />
        </div>
      </TerminalDockProvider>
    </SidebarProvider>
  )
}