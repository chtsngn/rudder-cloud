"use client"

import { useEffect, useState, useRef } from "react"
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
  Scroll,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useCurrentUser } from "@/hooks/use-current-user"
import { cn } from "@/lib/utils"

const SIDEBAR_KEY = "panel:sidebar-collapsed"

const BASE_NAV = [{ href: "/", label: "Anasayfa", icon: Home }]
const ADMIN_NAV = [
  { href: "/ports", label: "Portlar", icon: Network },
  { href: "/terminal", label: "Terminal", icon: Terminal },
  { href: "/settings", label: "Ayarlar", icon: Settings },
  { href: "/users", label: "Kullanıcılar", icon: Users },
  { href: "/audit", label: "Denetim Kaydı", icon: ClipboardList },
]

const ROLES: Record<string, string> = { SUPER_ADMIN: "Süper Admin", MEMBER: "Üye" }

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useCurrentUser()
  const [collapsed, setCollapsed] = useState(false)
  const navRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      try { setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1") } catch {}
    }, 0)
    return () => clearTimeout(t)
  }, [])

  function toggle() {
    setCollapsed(p => {
      const n = !p
      try { localStorage.setItem(SIDEBAR_KEY, n ? "1" : "0") } catch {}
      return n
    })
  }

  const navItems = user?.role === "SUPER_ADMIN" ? [...BASE_NAV, ...ADMIN_NAV] : BASE_NAV

  async function logout() {
    try { await fetch("/api/auth/logout", { method: "POST" }) } finally {
      router.push("/login"); router.refresh()
    }
  }

  // Aktif nav öğesinin index'ini bul (altın şerit konumu için)
  const activeIdx = navItems.findIndex(item =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
  )

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col z-30 relative select-none overflow-visible",
        "transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]",
        collapsed ? "w-[68px]" : "w-[256px]"
      )}
    >
      {/* ═══ ANA YELKEN GÖVDESİ ═══ */}
      <div
        className={cn(
          "absolute inset-0 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]",
          collapsed ? "rounded-r-[18px]" : "rounded-tr-[48px] rounded-br-[72px]"
        )}
        style={{
          background: "linear-gradient(180deg, #5a0618 0%, #6e0d25 40%, #520514 100%)",
          boxShadow: collapsed
            ? "3px 0 12px rgba(0,0,0,0.12)"
            : "6px 0 32px rgba(0,0,0,0.2), 2px 0 8px rgba(0,0,0,0.1)",
        }}
      />

      {/* ═══ SAĞ KENAR ALTIN ŞERİT (Yelkenin ucundan geçen) ═══ */}
      <div
        className={cn(
          "absolute right-0 inset-y-0 w-[3px] transition-all duration-500",
          "bg-gradient-to-b from-[#c8a87c]/50 via-[#dfc9a0] to-[#c8a87c]/50",
          collapsed ? "rounded-r-[18px]" : "rounded-r-[48px]"
        )}
      />

      {/* ═══ AKTİF SAYFA İMLECİ (Altın şerit üzerinde süzülen imleç) ═══ */}
      {activeIdx >= 0 && (
        <div
          className="absolute right-[-5px] z-50 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{
            top: collapsed
              ? `${120 + activeIdx * 52}px`
              : `${98 + activeIdx * 44}px`,
          }}
        >
          {/* Altın damla/imleç şekli */}
          <div
            className="relative"
            style={{
              width: 13,
              height: 28,
            }}
          >
            {/* Altın parlayan nokta */}
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[10px] rounded-full"
              style={{
                background: "radial-gradient(circle, #e8d5a8 0%, #c8a87c 70%)",
                boxShadow: "0 0 8px 2px rgba(200,168,124,0.6), 0 0 16px 4px rgba(200,168,124,0.3)",
              }}
            />
            {/* Üst ve alt ince uzantılar */}
            <div
              className="absolute left-1/2 -translate-x-1/2 top-0 w-[2px] h-[10px] rounded-full"
              style={{ background: "linear-gradient(to bottom, transparent, #c8a87c)" }}
            />
            <div
              className="absolute left-1/2 -translate-x-1/2 bottom-0 w-[2px] h-[10px] rounded-full"
              style={{ background: "linear-gradient(to top, transparent, #c8a87c)" }}
            />
          </div>
        </div>
      )}

      {/* ═══ SAĞ ÜST AÇMA/KAPAMA BUTONU ═══ */}
      <button
        type="button"
        onClick={toggle}
        title={collapsed ? "Yelkeni Aç" : "Yelkeni Katla"}
        className={cn(
          "absolute z-50 flex items-center justify-center cursor-pointer transition-all duration-300",
          "hover:scale-110 active:scale-95",
          collapsed
            ? "right-[-14px] top-5 size-7 rounded-full"
            : "right-[-14px] top-8 size-7 rounded-full"
        )}
        style={{
          background: "linear-gradient(135deg, #dfc9a0 0%, #c8a87c 100%)",
          border: "2px solid #520514",
          boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
        }}
      >
        <Scroll
          className={cn(
            "size-3.5 transition-transform duration-500",
            collapsed ? "rotate-0" : "rotate-180"
          )}
          style={{ color: "#520514" }}
        />
      </button>

      {/* ═══ İÇERİK (Z-index yüksek, overlay üzerinde) ═══ */}
      <div className="relative z-10 flex flex-1 flex-col h-full">

        {/* ── HEADER: Küçük dümen + "Rudder" ── */}
        <div
          className={cn(
            "flex items-center shrink-0 transition-all duration-500",
            collapsed ? "h-16 justify-center px-0" : "h-[72px] px-5"
          )}
        >
          <Link href="/" className="flex items-center gap-2.5 group outline-none">
            <Image
              src="/rudder-helm-transparent.png"
              alt="Rudder"
              width={collapsed ? 28 : 30}
              height={collapsed ? 28 : 30}
              className="shrink-0 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)] transition-transform duration-300 group-hover:rotate-[30deg]"
              priority
            />
            {!collapsed && (
              <span
                className="font-heading font-bold text-[17px] tracking-[0.2em] uppercase transition-opacity duration-300"
                style={{
                  color: "#c8a87c",
                  textShadow: "0 1px 6px rgba(0,0,0,0.5)",
                }}
              >
                Rudder
              </span>
            )}
          </Link>
        </div>

        {/* ── İNCE AYIRICI ── */}
        <div className={cn("h-px mx-3 transition-all", collapsed ? "mx-2" : "mx-4")}
          style={{ background: "linear-gradient(to right, transparent, rgba(200,168,124,0.2), transparent)" }}
        />

        {/* ── NAVİGASYON ── */}
        <nav
          ref={navRef}
          className={cn(
            "flex flex-1 flex-col gap-1 pt-5 transition-all duration-500",
            collapsed ? "items-center px-1.5" : "px-3"
          )}
        >
          {navItems.map((item, idx) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "relative flex items-center gap-3 font-medium transition-all duration-200 group",
                  collapsed
                    ? "justify-center rounded-lg p-3 mx-0.5"
                    : "rounded-xl px-4 py-2.5",
                  active
                    ? "text-white"
                    : "text-white/70 hover:text-white hover:bg-white/[0.08]"
                )}
                style={active ? {
                  background: "rgba(0,0,0,0.2)",
                  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)",
                } : undefined}
              >
                <Icon
                  className={cn(
                    "shrink-0 transition-all duration-200 group-hover:scale-110",
                    collapsed ? "size-5" : "size-[18px]",
                    active ? "text-[#c8a87c]" : "text-white/75"
                  )}
                />
                {!collapsed && (
                  <span className={cn(
                    "text-[13px] tracking-wide font-sans transition-all duration-300",
                    active ? "font-semibold text-white" : "font-normal"
                  )}>
                    {item.label}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* ── ALT KULLANICI ALANI ── */}
        <div className={cn("p-3 pb-4", collapsed && "px-1.5 pb-3")}>
          {/* İnce çizgi */}
          <div className={cn("h-px mb-3", collapsed ? "mx-1" : "mx-1")}
            style={{ background: "linear-gradient(to right, transparent, rgba(255,255,255,0.08), transparent)" }}
          />
          <div
            className={cn(
              "flex items-center gap-2.5 rounded-xl p-2 transition-all",
              collapsed ? "justify-center" : ""
            )}
            style={{
              background: "rgba(0,0,0,0.15)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <Avatar
              className="size-8 shrink-0"
              style={{
                border: "2px solid rgba(200,168,124,0.6)",
                boxShadow: "0 0 6px rgba(200,168,124,0.3)",
              }}
            >
              <AvatarFallback
                className="text-[11px] font-bold text-[#c8a87c]"
                style={{ background: "#3a040e" }}
              >
                {user ? user.username.slice(0, 2).toUpperCase() : "?"}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-white/95 leading-tight">
                    {user?.username ?? "..."}
                  </p>
                  <p className="truncate text-[10px] text-[#c8a87c]/80 leading-tight mt-0.5">
                    {user ? (ROLES[user.role] ?? user.role) : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  title="Çıkış Yap"
                  className="size-7 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                >
                  <LogOut className="size-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}