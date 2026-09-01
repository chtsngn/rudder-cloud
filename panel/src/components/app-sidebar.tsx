"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
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
import { useCurrentUser } from "@/hooks/use-current-user"
import { cn } from "@/lib/utils"

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
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-16 items-center gap-2 px-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Server className="size-4" />
        </div>
        <span className="font-heading text-sm font-semibold text-foreground">
          Sunucu Paneli
        </span>
      </div>

      <Separator />

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <Separator />

      <div className="p-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left outline-none hover:bg-accent">
            <Avatar className="size-8">
              <AvatarFallback className="bg-secondary text-xs font-medium">
                {user ? initialsFor(user.username) : "?"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {user?.username ?? "..."}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user ? (ROLE_LABELS[user.role] ?? user.role) : ""}
              </p>
            </div>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
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
