"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  ChevronLeft,
  ChevronRight,
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
        "sticky top-0 flex h-screen shrink-0 flex-col transition-[width] duration-200 z-30 shadow-xl",
        collapsed ? "w-16" : "w-60"
      )}
      style={{
        background: "#2e0911", // Gorsel 3'teki derin bordo tonu
        borderRight: "1px solid rgba(200, 168, 124, 0.2)",
      }}
    >
      {/* Brand Header */}
      <div
        className={cn(
          "flex h-20 items-center px-4 shrink-0",
          collapsed ? "justify-center px-0" : "justify-start"
        )}
        style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}
      >
        <RudderLogo
          size={collapsed ? "sm" : "md"}
          iconOnly={collapsed}
          href="/"
          className={collapsed ? "justify-center" : ""}
        />
      </div>

      {/* Navigation Links - All texts and icons in crisp white */}
      <nav className={cn("flex flex-1 flex-col gap-1.5 p-3 pt-4", collapsed && "items-center px-1.5")}>
        {navItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-150",
                collapsed ? "justify-center p-2.5" : "px-3.5 py-2.5",
                active
                  ? "bg-white/15 text-white font-semibold shadow-inner"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
              )}
              style={
                active
                  ? {
                      borderLeft: collapsed ? "none" : "3px solid #c8a87c",
                      paddingLeft: collapsed ? undefined : "12px",
                    }
                  : {
                      borderLeft: collapsed ? "none" : "3px solid transparent",
                    }
              }
            >
              <Icon
                className={cn(
                  "size-4 shrink-0 transition-colors",
                  active ? "text-white" : "text-white/80 group-hover:text-white"
                )}
              />
              {!collapsed && (
                <span className="font-sans text-[13px] tracking-wide text-white">
                  {item.label}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Collapse Toggle */}
      <button
        type="button"
        onClick={toggleCollapsed}
        title={collapsed ? "Menüyü genişlet" : "Menüyü daralt"}
        className={cn(
          "flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-white/70 transition-colors hover:text-white hover:bg-white/10",
          collapsed && "justify-center px-0"
        )}
        style={{ borderTop: "1px solid rgba(255, 255, 255, 0.1)" }}
      >
        {collapsed ? (
          <ChevronRight className="size-4 shrink-0 text-white" />
        ) : (
          <>
            <ChevronLeft className="size-4 shrink-0 text-white" />
            <span className="text-white">Daralt</span>
          </>
        )}
      </button>

      {/* Bottom User Section - White text */}
      <div
        className={cn("p-3", collapsed && "px-1.5")}
        style={{ borderTop: "1px solid rgba(255, 255, 255, 0.1)" }}
      >
        <div
          className={cn(
            "flex items-center justify-between gap-2.5 rounded-lg bg-black/20 p-2.5",
            collapsed && "justify-center p-1.5"
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar
              className="size-8 shrink-0"
              style={{
                border: "2px solid #c8a87c",
                boxShadow: "0 0 8px rgba(200, 168, 124, 0.3)",
              }}
            >
              <AvatarFallback
                className="text-xs font-bold text-white"
                style={{ background: "#4a0e1c" }}
              >
                {user ? initialsFor(user.username) : "?"}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white leading-tight">
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
              className="size-7 flex items-center justify-center rounded-md text-white/75 hover:text-white hover:bg-white/10 transition-colors"
            >
              <LogOut className="size-3.5 text-white" />
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}