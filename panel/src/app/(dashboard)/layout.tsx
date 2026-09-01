import type { ReactNode } from "react"

import { AppSidebar } from "@/components/app-sidebar"

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto p-6 md:p-8">{children}</main>
    </div>
  )
}
