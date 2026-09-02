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
  { href: "/users", label: "Kullanicilar", icon: Users },
  { href: "/audit", label: "Denetim Kaydi", icon: ClipboardList },
]

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  MEMBER: "Uye",
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
      } catch { /* ignore */ }
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      try { window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, next ? "1" : "0") } catch { /* ignore */ }
      return next
    })
  }

  const navItems = user?.role === "SUPER_ADMIN" ? [...BASE_NAV_ITEMS, ...SUPER_ADMIN_NAV_ITEMS] : BASE_NAV_ITEMS

  async function handleLogout() {
    try { await fetch("/api/auth/logout", { method: "POST" }) } finally {
      router.push("/login")
      router.refresh()
    }
  }

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col transition-[width] duration-150 z-30",
        collapsed ? "w-16" : "w-60"
      )}
      style={{
        background: "linear-gradient(180deg, #3d0f14 0%, #2d0a0e 60%, #200709 100%)",
        borderRight: "1px solid rgba(201,169,110,0.15)",
        boxShadow: "2px 0 20px rgba(0,0,0,0.5)",
      }}
    >
      {/* Brand Logo */}
      <div
        className={cn(
          "flex h-20 items-center px-4 shrink-0",
          collapsed ? "justify-center px-0" : "justify-start"
        )}
        style={{ borderBottom: "1px solid rgba(201,169,110,0.1)" }}
      >
        <RudderLogo
          size={collapsed ? "sm" : "md"}
          iconOnly={collapsed}
          href="/"
          className={collapsed ? "justify-center" : ""}
        />
      </div>

      {/* Navigation */}
      <nav className={cn("flex flex-1 flex-col gap-1 p-2 pt-3", collapsed && "items-center px-1.5")}>
        {navItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-150 group",
                collapsed ? "justify-center p-2.5" : "px-3 py-2.5",
                active
                  ? "text-[#f0e6d0]"
                  : "text-[#8a7560] hover:text-[#c9a96e] hover:bg-[rgba(201,169,110,0.06)]"
              )}
              style={active ? {
                background: "linear-gradient(90deg, rgba(201,169,110,0.12) 0%, rgba(201,169,110,0.03) 100%)",
                borderLeft: collapsed ? "none" : "2px solid #c9a96e",
                boxShadow: "inset 0 0 20px rgba(201,169,110,0.04)",
              } : { borderLeft: collapsed ? "none" : "2px solid transparent" }}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0 transition-colors",
                  active ? "text-[#c9a96e]" : "text-[#6b5540] group-hover:text-[#c9a96e]"
                )}
              />
              {!collapsed && <span className="font-sans text-[13px]">{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Collapse Toggle */}
      <button
        type="button"
        onClick={toggleCollapsed}
        title={collapsed ? "Menuyu genislet" : "Menuyu daralt"}
        className={cn(
          "flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-colors",
          collapsed && "justify-center px-0"
        )}
        style={{ color: "#5a4535", borderTop: "1px solid rgba(201,169,110,0.08)" }}
      >
        {collapsed
          ? <ChevronRight className="size-4 shrink-0" style={{ color: "#5a4535" }} />
          : <><ChevronLeft className="size-4 shrink-0" /><span>Daralt</span></>
        }
      </button>

      {/* User Section */}
      <div
        className={cn("p-2.5", collapsed && "px-1.5")}
        style={{ borderTop: "1px solid rgba(201,169,110,0.1)" }}
      >
        <div
          className={cn(
            "flex items-center justify-between gap-2 rounded-lg p-2 transition-colors",
            collapsed && "justify-center p-1.5"
          )}
          style={{ background: "rgba(0,0,0,0.2)" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Avatar
              className="size-8 shrink-0"
              style={{ border: "1.5px solid rgba(201,169,110,0.5)", boxShadow: "0 0 8px rgba(201,169,110,0.15)" }}
            >
              <AvatarFallback
                className="text-xs font-bold"
                style={{ background: "#3d0f14", color: "#c9a96e" }}
              >
                {user ? initialsFor(user.username) : "?"}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold leading-tight" style={{ color: "#f0e6d0" }}>
                  {user?.username ?? "..."}
                </p>
                <p className="truncate text-[11px] leading-tight" style={{ color: "#7a6a55" }}>
                  {user ? (ROLE_LABELS[user.role] ?? user.role) : ""}
                </p>
              </div>
            )}
          </div>
          {!collapsed && (
            <button
              type="button"
              onClick={handleLogout}
              title="Cikis Yap"
              className="size-7 flex items-center justify-center rounded-md transition-colors"
              style={{ color: "#5a4535" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#c9a96e")}
              onMouseLeave={e => (e.currentTarget.style.color = "#5a4535")}
            >
              <LogOut className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
