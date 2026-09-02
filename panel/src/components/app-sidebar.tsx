"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
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
        "sticky top-0 flex h-screen shrink-0 flex-col z-30 transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] relative shadow-2xl select-none",
        collapsed ? "w-20" : "w-64"
      )}
      style={{
        background: "linear-gradient(180deg, #580619 0%, #680b22 45%, #4a0413 100%)",
        // Görseldeki gibi kavisli yelken kenarı ve altın bordür
        borderTopRightRadius: collapsed ? "24px" : "44px",
        borderBottomRightRadius: collapsed ? "30px" : "64px",
        boxShadow: "4px 0 24px rgba(0,0,0,0.18), inset -2px 0 0 rgba(200,168,124,0.6)",
      }}
    >
      {/* Sağ Kavisli Kenardaki Altın Çizgi / Yelken Vurgusu */}
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-[3px] bg-gradient-to-b from-[#c8a87c] via-[#e2c79f] to-[#c8a87c]",
          collapsed ? "rounded-r-[24px]" : "rounded-r-[44px]"
        )}
      />

      {/* Görseldeki Üst Sağ Kavis Başındaki Altın Kapsül Buton */}
      <button
        type="button"
        onClick={toggleCollapsed}
        title={collapsed ? "Menüyü Aç" : "Menüyü Daralt"}
        className="absolute -right-3.5 top-6 z-40 size-7 rounded-full bg-[#c8a87c] hover:bg-[#e2c79f] text-[#4a0413] shadow-md flex items-center justify-center cursor-pointer transition-all hover:scale-110 active:scale-95 border-2 border-[#580619]"
      >
        {collapsed ? (
          <ChevronRight className="size-4 stroke-[2.5]" />
        ) : (
          <ChevronLeft className="size-4 stroke-[2.5]" />
        )}
      </button>

      {/* Brand Header (Görseldeki gibi: Dümen + Rudder + Server Panel) */}
      <div
        className={cn(
          "flex h-20 items-center px-5 shrink-0 transition-all",
          collapsed ? "justify-center px-0" : "justify-start"
        )}
      >
        <Link href="/" className="flex items-center gap-3 group outline-none">
          <Image
            src="/rudder-helm-transparent.png"
            alt="Rudder Logo"
            width={34}
            height={34}
            className="shrink-0 object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition-transform group-hover:rotate-45"
            priority
          />
          {!collapsed && (
            <div className="flex flex-col">
              <span
                className="font-heading font-bold text-lg leading-tight text-white tracking-wider"
                style={{ textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}
              >
                Rudder
              </span>
              <span className="text-[11px] font-sans font-medium text-[#c8a87c] tracking-wide leading-tight">
                Server Panel
              </span>
            </div>
          )}
        </Link>
      </div>

      {/* İnce Ayırıcı Çizgi */}
      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Navigation Menü (Görseldeki Yerleşim ve Buton Stili) */}
      <nav className={cn("flex flex-1 flex-col gap-1.5 p-3 pt-6", collapsed && "items-center px-2")}>
        {navItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "relative flex items-center gap-3.5 rounded-xl text-[13.5px] font-medium transition-all duration-150 group",
                collapsed ? "justify-center p-3" : "px-4 py-2.5",
                active
                  ? "bg-black/25 text-white font-semibold shadow-inner border-l-4 border-[#c8a87c]"
                  : "text-white/80 hover:bg-white/10 hover:text-white border-l-4 border-transparent"
              )}
              style={
                active && !collapsed
                  ? {
                      background: "rgba(0, 0, 0, 0.25)",
                      borderLeft: "3px solid #c8a87c",
                    }
                  : undefined
              }
            >
              <Icon
                className={cn(
                  "size-4 shrink-0 transition-transform group-hover:scale-110",
                  active ? "text-[#c8a87c]" : "text-white/85"
                )}
              />
              {!collapsed && (
                <span className="font-sans tracking-wide text-white">
                  {item.label}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom User Section */}
      <div className={cn("p-3.5 pb-5", collapsed && "px-2")}>
        <div
          className={cn(
            "flex items-center justify-between gap-2.5 rounded-xl bg-black/20 p-2.5 shadow-inner border border-white/5",
            collapsed && "justify-center p-1.5"
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar
              className="size-8 shrink-0"
              style={{
                border: "2px solid #c8a87c",
                boxShadow: "0 0 8px rgba(200, 168, 124, 0.4)",
              }}
            >
              <AvatarFallback
                className="text-xs font-bold text-white"
                style={{ background: "#3d040f" }}
              >
                {user ? initialsFor(user.username) : "?"}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-white leading-tight">
                  {user?.username ?? "..."}
                </p>
                <p className="truncate text-[10.5px] text-[#c8a87c] leading-tight mt-0.5">
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
              className="size-7 flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <LogOut className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}