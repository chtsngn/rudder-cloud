"use client"

import Image from "next/image"
import { Menu } from "lucide-react"
import { useSidebar } from "@/components/sidebar-context"
import { useTheme } from "@/components/theme-provider"
import { useCurrentUser } from "@/hooks/use-current-user"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

export function MobileTopbar() {
  const { toggleMobile } = useSidebar()
  const { theme } = useTheme()
  const { user } = useCurrentUser()

  const isDark =
    theme === "dark" ||
    (typeof window !== "undefined" &&
      (document.documentElement.classList.contains("dark") ||
        document.documentElement.getAttribute("data-theme") === "dark"))

  return (
    <header
      className={cn(
        "lg:hidden fixed top-0 left-0 right-0 z-40 h-14 flex items-center justify-between px-4",
        "border-b",
        isDark
          ? "bg-[#0b1739] border-[#16223f]"
          : "bg-[#48030f] border-[#c8a87c]/30"
      )}
    >
      {/* Hamburger */}
      <button
        type="button"
        onClick={toggleMobile}
        className="size-9 flex items-center justify-center rounded-xl transition-colors text-white/80 hover:text-white hover:bg-white/10"
        aria-label="Menüyü aç/kapat"
      >
        <Menu className="size-5" />
      </button>

      {/* Logo */}
      <div className="flex items-center gap-2">
        <Image
          src="/rudder-helm-transparent.png"
          alt="Rudder Logo"
          width={28}
          height={28}
          className="object-contain"
        />
        <span
          className={cn(
            "font-heading font-extrabold text-[16px] tracking-[0.22em] uppercase",
            isDark ? "text-[#cbd5e1]" : "text-[#dfc9a0]"
          )}
        >
          RUDDER
        </span>
      </div>

      {/* Avatar */}
      <Avatar
        className="size-8 shrink-0"
        style={{
          border: isDark ? "2px solid #38bdf8" : "2px solid #dfc9a0",
        }}
      >
        <AvatarFallback
          className={cn("text-xs font-bold", isDark ? "text-[#38bdf8]" : "text-[#dfc9a0]")}
          style={{ background: isDark ? "#060e24" : "#38020b" }}
        >
          {user ? user.username.slice(0, 2).toUpperCase() : "?"}
        </AvatarFallback>
      </Avatar>
    </header>
  )
}
