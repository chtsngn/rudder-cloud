"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ClipboardList,
  Home,
  LogOut,
  Network,
  Server,
  Settings,
  Terminal,
  Users,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { RudderLogo } from "@/components/rudder-logo"
import { useCurrentUser } from "@/hooks/use-current-user"
import { cn } from "@/lib/utils"

// Acik/kapali (daraltilmis) tercihi tarayicida saklanir -- sunucu tarafinda
// bir karsiligi yok, yalnizca bu cihaz/tarayici icin bir kolaylik.
const SIDEBAR_COLLAPSED_STORAGE_KEY = "panel:sidebar-collapsed"

const BASE_NAV_ITEMS = [{ href: "/", label: "Anasayfa", icon: Home }]

// Sistem geneli ayarlar, sunucu terminali ve kullanıcı/denetim yönetimi —
// hepsi SADECE SUPER_ADMIN'e açık (bkz. Aşama G — ilgili API route'ları da
// ayrıca `isSuperAdmin()` ile korunuyor, buradaki liste yalnızca navigasyonu
// gizliyor). MEMBER kullanıcılar site sayfalarına anasayfadaki site
// kartlarından ulaşır — ayrı bir nav öğesi gerekmez.
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

  // Varsayilan acik -- localStorage okunana kadar (ilk render, SSR dahil)
  // her zaman genis halde gosterilir, boylece layout kaymasi (flash) olmaz.
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    // setTimeout ile bir sonraki makrotaska erteleniyor -- ayni "setState-in-effect"
    // kacinma deseni sites/[id]/page.tsx ve settings/page.tsx'te de kullaniliyor.
    const timer = setTimeout(() => {
      try {
        setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1")
      } catch {
        // localStorage kapaliysa (gizli sekme vb.) sessizce yoksay, varsayilan acik kalir
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
        // yoksay -- yalnizca bu oturum icin tercih kaybolur, islevi etkilemez
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
        "sticky top-0 flex h-screen shrink-0 flex-col border-r border-white/[0.07] bg-[#121317]/95 backdrop-blur-md transition-[width] duration-150 z-30",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Top Brand Logo */}
      <div className={cn("flex h-20 items-center px-5", collapsed ? "justify-center px-0" : "justify-start")}>
        <RudderLogo
          size={collapsed ? "sm" : "md"}
          iconOnly={collapsed}
          href="/"
          className={collapsed ? "justify-center" : ""}
        />
      </div>

      <div className="h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

      {/* Navigation Items */}
      <nav className={cn("flex flex-1 flex-col gap-1.5 p-3 pt-4", collapsed && "items-center px-2")}>
        {navItems.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
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
                  ? "bg-gradient-to-r from-red-950/50 via-red-900/20 to-transparent text-white border-l-2 border-red-500 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]"
                  : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
              )}
            >
              <Icon className={cn("size-4 shrink-0", active ? "text-red-400" : "text-zinc-400")} />
              {!collapsed && <span>{item.label}</span>}
              {active && !collapsed && (
                <div className="absolute right-2 size-1.5 rounded-full bg-red-500 shadow-[0_0_6px_#ef4444]" />
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
          "flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-300",
          collapsed && "justify-center px-0"
        )}
      >
        {collapsed ? <ChevronRight className="size-4 shrink-0" /> : <ChevronLeft className="size-4 shrink-0" />}
        {!collapsed && <span>Daralt</span>}
      </button>

      <div className="h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

      {/* Bottom User Profile Section */}
      <div className={cn("p-3.5", collapsed && "px-2")}>
        <div className={cn("flex items-center justify-between gap-3 rounded-xl bg-white/[0.02] border border-white/[0.05] p-2", collapsed && "justify-center p-1.5")}>
          <div className="flex items-center gap-3 min-w-0">
            <Avatar className="size-9 shrink-0 border-2 border-red-600/80 shadow-[0_0_10px_rgba(220,38,38,0.35)]">
              <AvatarFallback className="bg-red-950 text-red-200 text-xs font-black">
                {user ? initialsFor(user.username) : "?"}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white leading-tight">
                  {user?.username ?? "..."}
                </p>
                <p className="truncate text-[11px] text-zinc-400 leading-tight">
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
              className="size-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-950/30 transition-colors"
            >
              <LogOut className="size-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
