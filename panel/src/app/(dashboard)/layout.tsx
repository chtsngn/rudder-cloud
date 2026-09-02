import type { ReactNode } from "react"
import { AppSidebar } from "@/components/app-sidebar"

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#f8fafc]">
      <AppSidebar />
      <main className="flex-1 h-screen overflow-y-auto bg-[#f8fafc] p-6 md:p-8 lg:p-10">{children}</main>
    </div>
  )
}