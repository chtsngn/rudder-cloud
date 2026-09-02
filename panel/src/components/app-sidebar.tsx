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
  PanelLeftClose,
  PanelLeftOpen,
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

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col z-30 relative select-none overflow-visible",
        "transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
        collapsed ? "w-[78px]" : "w-[285px]"
      )}
    >
      {/* ═══ ORGANİK YELKEN VE KALIN ALTIN KENAR ÇİZGİSİ (SVG GÖVDE) ═══ */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none drop-shadow-2xl"
        viewBox={collapsed ? "0 0 78 1000" : "0 0 285 1000"}
        preserveAspectRatio="none"
      >
        <defs>
          {/* Zengin Bordo Degrade (Sol kenar sıfır çizgi, saf bordo) */}
          <linearGradient id="sailBurgundyGrad" x1="0" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor="#48030f" />
            <stop offset="35%" stopColor="#680b22" />
            <stop offset="70%" stopColor="#540516" />
            <stop offset="100%" stopColor="#320108" />
          </linearGradient>

          {/* Kalın Altın Çizgi Degradesi */}
          <linearGradient id="sailGoldStroke" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c5a059" />
            <stop offset="20%" stopColor="#fbedd0" />
            <stop offset="45%" stopColor="#dfc9a0" />
            <stop offset="75%" stopColor="#c8a87c" />
            <stop offset="100%" stopColor="#8e6425" />
          </linearGradient>
        </defs>

        {/* 1. YELKEN DOLGUSU */}
        <path
          d={
            collapsed
              ? "M 0,0 L 64,0 C 72,0 78,15 78,35 C 78,200 80,500 80,500 C 80,500 78,800 78,965 C 78,985 72,1000 64,1000 L 0,1000 Z"
              : "M 0,0 L 210,0 C 234,0 248,16 252,45 C 266,160 285,380 285,520 C 285,680 264,860 242,950 C 232,985 214,1000 184,1000 L 0,1000 Z"
          }
          fill="url(#sailBurgundyGrad)"
        />

        {/* 2. SADECE SAĞ KAVİSTEKİ KALIN ALTIN ÇİZGİ */}
        <path
          d={
            collapsed
              ? "M 64,0 C 72,0 78,15 78,35 C 78,200 80,500 80,500 C 80,500 78,800 78,965 C 78,985 72,1000 64,1000"
              : "M 210,0 C 234,0 248,16 252,45 C 266,160 285,380 285,520 C 285,680 264,860 242,950 C 232,985 214,1000 184,1000"
          }
          fill="none"
          stroke="url(#sailGoldStroke)"
          strokeWidth="5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* ═══ İÇERİK ALANI ═══ */}
      <div className="relative z-10 flex flex-1 flex-col h-full overflow-hidden">

        {/* ── 1. HEADER: LOGO + RUDDER + ŞERİTTEN UZAK ELİT BUTON ── */}
        <div
          className={cn(
            "flex items-center shrink-0 transition-all duration-300",
            collapsed ? "h-20 flex-col justify-center gap-1.5 px-0 pt-2" : "h-24 px-4 max-w-[215px] justify-between"
          )}
        >
          <Link href="/" className="flex items-center gap-2.5 group outline-none">
            <div className="relative shrink-0 flex items-center justify-center">
              <Image
                src="/rudder-helm-transparent.png"
                alt="Rudder Logo"
                width={collapsed ? 34 : 38}
                height={collapsed ? 34 : 38}
                className="object-contain drop-shadow-[0_3px_12px_rgba(0,0,0,0.7)] transition-transform duration-500 group-hover:rotate-90"
                priority
              />
            </div>

            {!collapsed && (
              <span
                className="font-heading font-extrabold text-[19px] tracking-[0.22em] uppercase text-[#dfc9a0] select-none leading-none"
                style={{
                  textShadow: "0 2px 8px rgba(0,0,0,0.7), 0 0 2px rgba(251, 237, 208, 0.4)",
                }}
              >
                RUDDER
              </span>
            )}
          </Link>

          {/* Şeritle ASLA çakışmayan, iç alana yerleşmiş elit altın buton */}
          <button
            type="button"
            onClick={toggle}
            title={collapsed ? "Menüyü Genişlet" : "Menüyü Daralt"}
            className={cn(
              "flex items-center justify-center rounded-lg transition-all cursor-pointer",
              "bg-[#dfc9a0]/15 hover:bg-[#dfc9a0]/30 border border-[#dfc9a0]/40 text-[#dfc9a0] hover:scale-105 active:scale-95 shadow-sm",
              collapsed ? "size-6 mt-1" : "size-7.5 ml-2"
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-3.5 text-[#dfc9a0]" />
            ) : (
              <PanelLeftClose className="size-3.5 text-[#dfc9a0]" />
            )}
          </button>
        </div>

        {/* İnce Ayırıcı Şerit */}
        <div
          className={cn("h-px transition-all duration-300", collapsed ? "mx-3" : "mx-4 max-w-[200px]")}
          style={{
            background: "linear-gradient(to right, transparent, rgba(223,201,160,0.25), transparent)",
          }}
        />

        {/* ── 2. NAVİGASYON LİNKLERİ ── */}
        <nav
          className={cn(
            "flex flex-1 flex-col gap-2 pt-6 transition-all duration-300",
            collapsed ? "items-center px-2" : "px-3.5 max-w-[245px]"
          )}
        >
          {navItems.map((item) => {
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
                    ? "justify-center rounded-xl p-3 size-12"
                    : "rounded-l-xl rounded-r-md px-3.5 py-2.5",
                  active
                    ? "text-white shadow-inner"
                    : "text-white/80 hover:text-white hover:bg-white/[0.08]"
                )}
                style={
                  active && !collapsed
                    ? {
                        background: "rgba(0, 0, 0, 0.4)",
                        boxShadow: "inset 0 1px 3px rgba(0,0,0,0.5)",
                      }
                    : undefined
                }
              >
                <Icon
                  className={cn(
                    "shrink-0 transition-all duration-200 group-hover:scale-110",
                    collapsed ? "size-5" : "size-[18px]",
                    active ? "text-[#dfc9a0]" : "text-white/80"
                  )}
                />

                {!collapsed && (
                  <span
                    className={cn(
                      "text-[13.5px] tracking-wide font-sans transition-all duration-200",
                      active ? "font-bold text-white" : "font-normal"
                    )}
                  >
                    {item.label}
                  </span>
                )}

                {/* ŞERİTLE BİRLEŞİK İÇE BAKAN ALTIN ÜÇGEN OK */}
                {active && !collapsed && (
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 z-20 flex items-center">
                    <div
                      className="w-0 h-0 border-solid"
                      style={{
                        borderTop: "6px solid transparent",
                        borderBottom: "6px solid transparent",
                        borderRight: "8px solid #dfc9a0",
                        filter: "drop-shadow(-1px 0 2px rgba(0,0,0,0.4))",
                      }}
                    />
                  </div>
                )}
              </Link>
            )
          })}
        </nav>

        {/* ── 3. ALT PROFİL KARTI (Kavis içine tam oturtulmuş, taşma sıfır) ── */}
        <div
          className={cn(
            "p-3.5 pb-6 transition-all duration-300",
            collapsed ? "px-2 pb-4" : "px-3.5 max-w-[215px]"
          )}
        >
          <div
            className={cn(
              "flex items-center gap-2.5 rounded-2xl p-2.5 transition-all shadow-inner",
              collapsed ? "justify-center" : "w-full"
            )}
            style={{
              background: "rgba(0,0,0,0.3)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <Avatar
              className="size-8.5 shrink-0"
              style={{
                border: "2px solid #dfc9a0",
                boxShadow: "0 0 8px rgba(223,201,160,0.4)",
              }}
            >
              <AvatarFallback
                className="text-xs font-bold text-[#dfc9a0]"
                style={{ background: "#38020b" }}
              >
                {user ? user.username.slice(0, 2).toUpperCase() : "?"}
              </AvatarFallback>
            </Avatar>

            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-bold text-white leading-tight">
                    {user?.username ?? "..."}
                  </p>
                  <p className="truncate text-[10px] text-[#dfc9a0]/90 leading-tight mt-0.5">
                    {user ? (ROLES[user.role] ?? user.role) : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  title="Çıkış Yap"
                  className="size-7 flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors shrink-0"
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