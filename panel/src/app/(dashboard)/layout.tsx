import type { ReactNode } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { TerminalDockProvider } from "@/components/terminal-dock-context"
import { SideTerminalDock } from "@/components/side-terminal-dock"

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <TerminalDockProvider>
      <div className="flex h-screen w-full overflow-hidden bg-[#f8fafc] relative">
        <AppSidebar />
        <main className="flex-1 h-screen overflow-y-auto bg-[#f8fafc] p-6 md:p-8 lg:p-10">
          {children}
        </main>
        <SideTerminalDock />
      </div>
    </TerminalDockProvider>
  )
}