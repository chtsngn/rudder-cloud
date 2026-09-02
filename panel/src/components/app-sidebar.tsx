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
        "sticky top-0 flex h-screen shrink-0 flex-col border-r border-border bg-card transition-[width] duration-150",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className={cn("flex h-20 items-center px-4", collapsed ? "justify-center px-0" : "justify-start")}>
        <RudderLogo
          size={collapsed ? "sm" : "md"}
          iconOnly={collapsed}
          href="/"
          className={collapsed ? "justify-center" : "pl-1"}
        />
      </div>

      <Separator />

      <nav className={cn("flex flex-1 flex-col gap-1 p-3", collapsed && "items-center px-2")}>
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
                "flex items-center gap-3 rounded-md text-sm font-medium transition-colors",
                collapsed ? "justify-center p-2.5" : "px-3 py-2",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && item.label}
            </Link>
          )
        })}
      </nav>

      <Separator />

      <button
        type="button"
        onClick={toggleCollapsed}
        title={collapsed ? "Menüyü genişlet" : "Menüyü daralt"}
        className={cn(
          "flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
          collapsed && "justify-center px-0"
        )}
      >
        {collapsed ? <ChevronRight className="size-4 shrink-0" /> : <ChevronLeft className="size-4 shrink-0" />}
        {!collapsed && "Daralt"}
      </button>

      <Separator />

      <div className={cn("p-3", collapsed && "px-2")}>
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "flex w-full items-center gap-3 rounded-md text-left outline-none hover:bg-accent",
              collapsed ? "justify-center p-2" : "px-2 py-2"
            )}
          >
            <Avatar className="size-8 shrink-0">
              <AvatarFallback className="bg-secondary text-xs font-medium">
                {user ? initialsFor(user.username) : "?"}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {user?.username ?? "..."}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {user ? (ROLE_LABELS[user.role] ?? user.role) : ""}
                  </p>
                </div>
                <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
              </>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {user?.role === "SUPER_ADMIN" && (
              <>
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Settings className="size-4" />
                    Ayarlar
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onSelect={handleLogout}>
              <LogOut className="size-4" />
              Çıkış Yap
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  )
}
