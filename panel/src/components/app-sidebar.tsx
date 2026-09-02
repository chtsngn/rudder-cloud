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
function initialsFor(u: string) { return u.slice(0, 2).toUpperCase() }

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useCurrentUser()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      try { setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1") } catch { /* ignore */ }
    }, 0)
    return () => clearTimeout(t)
  }, [])

  function toggleCollapsed() {
    setCollapsed(prev => {
      const next = !prev
      try { window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, next ? "1" : "0") } catch { /* ignore */ }
      return next
    })
  }

  const navItems = user?.role === "SUPER_ADMIN"
    ? [...BASE_NAV_ITEMS, ...SUPER_ADMIN_NAV_ITEMS]
    : BASE_NAV_ITEMS

  async function handleLogout() {
    try { await fetch("/api/auth/logout", { method: "POST" }) } finally {
      router.push("/login"); router.refresh()
    }
  }

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col transition-[width] duration-150 z-30",
        collapsed ? "w-16" : "w-56"
      )}
      style={{
        /* Gorsel 3: cok derin koyu bordo */
        background: "#160008",
        borderRight: "1px solid rgba(184,149,106,0.12)",
      }}
    >
      {/* Logo */}
      <div
        className={cn("flex h-[72px] items-center px-4 shrink-0", collapsed ? "justify-center px-0" : "")}
        style={{ borderBottom: "1px solid rgba(184,149,106,0.08)" }}
      >
        <RudderLogo size={collapsed ? "sm" : "md"} iconOnly={collapsed} href="/" />
      </div>

      {/* Nav */}
      <nav className={cn("flex flex-1 flex-col gap-0.5 p-2 pt-3", collapsed && "items-center px-1.5")}>
        {navItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md text-[13px] font-medium transition-colors duration-100",
                collapsed ? "justify-center p-2.5" : "px-3 py-2.5",
              )}
              style={active
                ? {
                    background: "rgba(184,149,106,0.1)",
                    borderLeft: collapsed ? "none" : "2px solid #b8956a",
                    color: "#e8d5b0",
                  }
                : {
                    borderLeft: collapsed ? "none" : "2px solid transparent",
                    color: "#5a4030",
                  }
              }
            >
              <Icon
                className="size-4 shrink-0"
                style={{ color: active ? "#b8956a" : "#3d2a1a" }}
              />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Collapse */}
      <button
        type="button"
        onClick={toggleCollapsed}
        className={cn("flex items-center gap-2 px-4 py-2.5 text-xs transition-colors", collapsed && "justify-center px-0")}
        style={{ color: "#3d2a1a", borderTop: "1px solid rgba(184,149,106,0.06)" }}
      >
        {collapsed
          ? <ChevronRight className="size-4" style={{ color: "#3d2a1a" }} />
          : <><ChevronLeft className="size-4" /><span>Daralt</span></>
        }
      </button>

      {/* User */}
      <div
        className={cn("p-2.5", collapsed && "px-1.5")}
        style={{ borderTop: "1px solid rgba(184,149,106,0.08)" }}
      >
        <div className={cn("flex items-center justify-between gap-2 rounded-md p-2", collapsed && "justify-center p-1.5")}
          style={{ background: "rgba(0,0,0,0.25)" }}>
          <div className="flex items-center gap-2 min-w-0">
            <Avatar className="size-8 shrink-0" style={{ border: "1.5px solid rgba(184,149,106,0.4)" }}>
              <AvatarFallback className="text-xs font-bold" style={{ background: "#200010", color: "#b8956a" }}>
                {user ? initialsFor(user.username) : "?"}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold leading-tight" style={{ color: "#e8d5b0" }}>
                  {user?.username ?? "..."}
                </p>
                <p className="truncate text-[11px] leading-tight" style={{ color: "#4a3020" }}>
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
              className="size-7 flex items-center justify-center rounded transition-colors"
              style={{ color: "#3d2a1a" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#b8956a")}
              onMouseLeave={e => (e.currentTarget.style.color = "#3d2a1a")}
            >
              <LogOut className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}