"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import {
  ClipboardList,
  Home,
  LogOut,
  Network,
  Settings,
  Terminal,
  Users,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { RudderLogo } from "@/components/rudder-logo"
import { useCurrentUser } from "@/hooks/use-current-user"
import { cn } from "@/lib/utils"

const SIDEBAR_COLLAPSED_STORAGE_KEY = "panel:sidebar-collapsed"

const BASE_NAV_ITEMS = [{ href: "/", label: "Anasayfa", icon: Home }]

const SUPER_ADMIN_NAV_ITEMS = [
  { href: "/ports", label: "Portlar", icon: Network },
  { href: "/terminal", label: "Terminal", icon: Terminal },
  { href: "/settings", label: "Ayarlar", icon: Settings },
  { href: "/users", label: "Kullanıcılar", icon: Users },
  { href: "/audit", label: "Denetim Kaydı", icon: ClipboardList },
]

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Süper Admin",
  MEMBER: "Üye",
}

function initialsFor(username: string): string {
  return username.slice(0, 2).toUpperCase()
}

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useCurrentUser()
  const [collapsed, setCollapsed] = useState(false)
  const [rotating, setRotating] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1")
      } catch {
        // ignore
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  function toggleCollapsed() {
    setRotating(true)
    setTimeout(() => setRotating(false), 500)
    setCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, next ? "1" : "0")
      } catch {
        // ignore
      }
      return next
    })
  }

  const navItems = user?.role === "SUPER_ADMIN" ? [...BASE_NAV_ITEMS, ...SUPER_ADMIN_NAV_ITEMS] : BASE_NAV_ITEMS

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } finally {
      router.push("/login")
      router.refresh()
    }
  }

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col z-30 shadow-2xl transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] relative",
        collapsed ? "w-20" : "w-64"
      )}
      style={{
        background: "linear-gradient(180deg, #63081e 0%, #6e0d25 45%, #520618 100%)",
        borderRight: "1px solid rgba(200, 168, 124, 0.3)",
      }}
    >
      {/* Sail Edge Decorative Contour */}
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-1.5 bg-gradient-to-b from-[#c8a87c]/30 via-[#c8a87c]/60 to-[#c8a87c]/30"
      />

      {/* Floating Helm Toggle Button (Yelken / Dümen Açma-Kapama Butonu) */}
      <button
        type="button"
        onClick={toggleCollapsed}
        title={collapsed ? "Menüyü Yelken Gibi Aç" : "Menüyü Daralt"}
        className="group absolute -right-4 top-24 z-40 size-8 rounded-full bg-[#520618] border-2 border-[#c8a87c] shadow-lg flex items-center justify-center p-1 cursor-pointer transition-transform hover:scale-110 active:scale-95"
      >
        <Image
          src="/rudder-helm-transparent.png"
          alt="Dümen Açma/Kapama"
          width={22}
          height={22}
          className={cn(
            "object-contain transition-transform duration-500",
            rotating && "rotate-[360deg]",
            collapsed ? "rotate-0" : "rotate-180"
          )}
        />
      </button>

      {/* Brand Header */}
      <div
        className={cn(
          "flex h-20 items-center px-5 shrink-0 transition-all",
          collapsed ? "justify-center px-0" : "justify-start"
        )}
        style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.12)" }}
      >
        <RudderLogo
          size={collapsed ? "sm" : "md"}
          iconOnly={collapsed}
          href="/"
          className={collapsed ? "justify-center" : ""}
        />
      </div>

      {/* Navigation Links */}
      <nav className={cn("flex flex-1 flex-col gap-1.5 p-3.5 pt-5", collapsed && "items-center px-2")}>
        {navItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-150 group",
                collapsed ? "justify-center p-3" : "px-3.5 py-2.5",
                active
                  ? "bg-white/20 text-white font-semibold shadow-inner border-l-4 border-[#c8a87c]"
                  : "text-white/85 hover:bg-white/10 hover:text-white border-l-4 border-transparent"
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0 transition-transform group-hover:scale-110",
                  active ? "text-[#c8a87c]" : "text-white/90"
                )}
              />
              {!collapsed && (
                <span className="font-sans text-[13px] tracking-wide text-white">
                  {item.label}
                </span>
              )}
              {active && !collapsed && (
                <span className="ml-auto size-1.5 rounded-full bg-[#c8a87c] shadow-[0_0_6px_#c8a87c]" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom User Section */}
      <div
        className={cn("p-3.5", collapsed && "px-2")}
        style={{ borderTop: "1px solid rgba(255, 255, 255, 0.12)" }}
      >
        <div
          className={cn(
            "flex items-center justify-between gap-2.5 rounded-xl bg-black/25 p-2.5 shadow-inner",
            collapsed && "justify-center p-1.5"
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar
              className="size-8 shrink-0"
              style={{
                border: "2px solid #c8a87c",
                boxShadow: "0 0 10px rgba(200, 168, 124, 0.4)",
              }}
            >
              <AvatarFallback
                className="text-xs font-bold text-white"
                style={{ background: "#3d0510" }}
              >
                {user ? initialsFor(user.username) : "?"}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-white leading-tight">
                  {user?.username ?? "..."}
                </p>
                <p className="truncate text-[11px] text-white/70 leading-tight mt-0.5">
                  {user ? (ROLE_LABELS[user.role] ?? user.role) : ""}
                </p>
              </div>
            )}
          </div>
          {!collapsed && (
            <button
              type="button"
              onClick={handleLogout}
              title="Çıkış Yap"
              className="size-7 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors"
            >
              <LogOut className="size-3.5 text-white" />
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}