"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import {
  ClipboardList,
  Globe,
  Home,
  LogOut,
  Network,
  Settings,
  Terminal,
  Users,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useCurrentUser } from "@/hooks/use-current-user"
import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

const SIDEBAR_KEY = "panel:sidebar-collapsed"

const BASE_NAV = [
  { href: "/", label: "Anasayfa", icon: Home },
  { href: "/sites", label: "Siteler", icon: Globe },
]
const ADMIN_NAV = [
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
  const { theme } = useTheme()
  const [collapsed, setCollapsed] = useState(false)
  const [isSpinning, setIsSpinning] = useState(false)

  const isDark = theme === "dark"

  useEffect(() => {
    const t = setTimeout(() => {
      try { setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1") } catch {}
    }, 0)
    return () => clearTimeout(t)
  }, [])

  function toggle() {
    setIsSpinning(true)
    setTimeout(() => setIsSpinning(false), 600)
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

  const activeIdx = navItems.findIndex(item =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
  )

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col z-30 relative select-none overflow-visible",
        "transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
        collapsed ? "w-[80px]" : "w-[285px]"
      )}
    >
      {/* ═══ ORGANİK YELKEN VE KALIN ALTIN/AY IŞIĞI KENAR ÇİZGİSİ (SVG GÖVDE) ═══ */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none drop-shadow-2xl"
        viewBox={collapsed ? "0 0 80 1000" : "0 0 285 1000"}
        preserveAspectRatio="none"
      >
        <defs>
          {/* Açık Tema: Zengin Bordo Degrade / Koyu Tema: Gece Mavisi (Midnight Blue) */}
          <linearGradient id="sailDynamicGrad" x1="0" y1="0" x2="0.8" y2="1">
            {isDark ? (
              <>
                <stop offset="0%" stopColor="#0b1739" />
                <stop offset="35%" stopColor="#0e1f4d" />
                <stop offset="70%" stopColor="#0a1536" />
                <stop offset="100%" stopColor="#060e24" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#48030f" />
                <stop offset="35%" stopColor="#680b22" />
                <stop offset="70%" stopColor="#540516" />
                <stop offset="100%" stopColor="#320108" />
              </>
            )}
          </linearGradient>

          {/* Kenar Çizgi Degradesi (Açık: Altın, Koyu: Ay Işığı & Okyanus) */}
          <linearGradient id="sailDynamicStroke" x1="0" y1="0" x2="0" y2="1">
            {isDark ? (
              <>
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="20%" stopColor="#e2e8f0" />
                <stop offset="45%" stopColor="#7dd3fc" />
                <stop offset="75%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#0284c7" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#c5a059" />
                <stop offset="20%" stopColor="#fbedd0" />
                <stop offset="45%" stopColor="#dfc9a0" />
                <stop offset="75%" stopColor="#c8a87c" />
                <stop offset="100%" stopColor="#8e6425" />
              </>
            )}
          </linearGradient>
        </defs>

        {/* 1. YELKEN DOLGUSU */}
        <path
          d={
            collapsed
              ? "M 0,0 L 66,0 C 74,0 80,15 80,35 C 80,200 82,500 82,500 C 82,500 80,800 80,965 C 80,985 74,1000 66,1000 L 0,1000 Z"
              : "M 0,0 L 210,0 C 234,0 248,16 252,45 C 266,160 285,380 285,520 C 285,680 264,860 242,950 C 232,985 214,1000 184,1000 L 0,1000 Z"
          }
          fill="url(#sailDynamicGrad)"
        />

        {/* 2. SADECE SAĞ KAVİSTEKİ KALIN ÇİZGİ */}
        <path
          d={
            collapsed
              ? "M 66,0 C 74,0 80,15 80,35 C 80,200 82,500 82,500 C 82,500 80,800 80,965 C 80,985 74,1000 66,1000"
              : "M 210,0 C 234,0 248,16 252,45 C 266,160 285,380 285,520 C 285,680 264,860 242,950 C 232,985 214,1000 184,1000"
          }
          fill="none"
          stroke="url(#sailDynamicStroke)"
          strokeWidth="5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* ═══ MENÜNÜN TAM ORTASINDAKİ ÖZGÜN DÜMEN AÇMA-KAPAMA BUTONU ═══ */}
      <button
        type="button"
        onClick={toggle}
        title={collapsed ? "Yelkeni Aç" : "Yelkeni Katla"}
        className={cn(
          "absolute z-50 top-1/2 -translate-y-1/2 flex items-center justify-center cursor-pointer transition-all duration-300 group",
          "hover:scale-125 active:scale-90",
          collapsed ? "-right-3.5 size-7.5" : "-right-4 size-9"
        )}
      >
        {/* Işıma Halosu */}
        <div
          className={cn(
            "absolute inset-0 rounded-full blur-sm transition-all",
            isDark
              ? "bg-[#38bdf8]/30 group-hover:bg-[#38bdf8]/60"
              : "bg-[#dfc9a0]/30 group-hover:bg-[#dfc9a0]/60"
          )}
        />

        {/* Madalyon Gövdesi */}
        <div
          className="relative size-full rounded-full flex items-center justify-center p-1"
          style={{
            background: isDark
              ? "radial-gradient(circle at 35% 35%, #e2e8f0 0%, #94a3b8 50%, #1e293b 100%)"
              : "radial-gradient(circle at 35% 35%, #fcedd2 0%, #dfc9a0 50%, #9e7535 100%)",
            border: isDark ? "2px solid #080d1a" : "2px solid #3d020a",
            boxShadow: "0 4px 14px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.9)",
          }}
        >
          <Image
            src="/rudder-helm-transparent.png"
            alt="Dümen Kontrolü"
            width={24}
            height={24}
            className={cn(
              "object-contain transition-transform duration-700 ease-out",
              isSpinning && "rotate-[360deg]",
              collapsed ? "rotate-0" : "rotate-180"
            )}
          />
        </div>
      </button>

      {/* ═══ İÇERİK ALANI ═══ */}
      <div className="relative z-10 flex flex-1 flex-col h-full overflow-hidden">

        {/* ── 1. HEADER: BÜYÜK & BELİRGİN LOGO + RUDDER YAZISI ── */}
        <div
          className={cn(
            "flex items-center shrink-0 transition-all duration-300",
            collapsed ? "h-20 justify-center px-0" : "h-24 px-5"
          )}
        >
          <Link href="/" className="flex items-center gap-3.5 group outline-none">
            <div className="relative shrink-0 flex items-center justify-center">
              <Image
                src="/rudder-helm-transparent.png"
                alt="Rudder Logo"
                width={collapsed ? 36 : 42}
                height={collapsed ? 36 : 42}
                className="object-contain drop-shadow-[0_3px_12px_rgba(0,0,0,0.7)] transition-transform duration-500 group-hover:rotate-90"
                priority
              />
            </div>

            {!collapsed && (
              <span
                className={cn(
                  "font-heading font-extrabold text-[22px] tracking-[0.24em] uppercase select-none leading-none transition-all duration-300",
                  isDark
                    ? "text-[#cbd5e1] tracking-[0.26em]"
                    : "text-[#dfc9a0]"
                )}
                style={{
                  textShadow: isDark
                    ? "0 0 14px rgba(203, 213, 225, 0.45), 0 2px 6px rgba(0,0,0,0.9)"
                    : "0 2px 8px rgba(0,0,0,0.7), 0 0 2px rgba(251, 237, 208, 0.4)",
                }}
              >
                RUDDER
              </span>
            )}
          </Link>
        </div>

        {/* İnce Ayırıcı Şerit */}
        <div
          className={cn("h-px transition-all duration-300", collapsed ? "mx-3" : "mx-5 mr-8")}
          style={{
            background: isDark
              ? "linear-gradient(to right, transparent, rgba(148,163,184,0.25), transparent)"
              : "linear-gradient(to right, transparent, rgba(223,201,160,0.25), transparent)",
          }}
        />

        {/* ── 2. NAVİGASYON LİNKLERİ ── */}
        <nav
          className={cn(
            "flex flex-1 flex-col gap-2 pt-6 transition-all duration-300",
            collapsed ? "items-center px-2" : "px-3.5 pr-8"
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
                  "relative flex items-center gap-3.5 font-medium transition-all duration-200 group",
                  collapsed
                    ? "justify-center rounded-xl p-3 size-12"
                    : "rounded-l-xl rounded-r-md px-4 py-3",
                  active
                    ? "text-white shadow-inner"
                    : "text-white/80 hover:text-white hover:bg-white/[0.08]"
                )}
                style={
                  active && !collapsed
                    ? {
                        background: "rgba(0, 0, 0, 0.4)",
                        boxShadow: "inset 0 1px 3px rgba(0,0,0,0.5)",
                        marginRight: "4px",
                      }
                    : undefined
                }
              >
                <Icon
                  className={cn(
                    "shrink-0 transition-all duration-200 group-hover:scale-110",
                    collapsed ? "size-5" : "size-[19px]",
                    active ? (isDark ? "text-[#38bdf8]" : "text-[#dfc9a0]") : "text-white/80"
                  )}
                />

                {!collapsed && (
                  <span
                    className={cn(
                      "text-[14px] tracking-wide font-sans transition-all duration-200",
                      active ? "font-bold text-white" : "font-normal"
                    )}
                  >
                    {item.label}
                  </span>
                )}

                {/* ŞERİTLE BİRLEŞİK İÇE BAKAN ALTIN / AY IŞIĞI ÜÇGEN OK İMLECİ */}
                {active && !collapsed && (
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 z-20 flex items-center">
                    <div
                      className="w-0 h-0 border-solid"
                      style={{
                        borderTop: "7px solid transparent",
                        borderBottom: "7px solid transparent",
                        borderRight: isDark ? "10px solid #38bdf8" : "10px solid #dfc9a0",
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
            collapsed ? "px-2 pb-4" : "pr-8 pl-3.5"
          )}
        >
          <div
            className={cn(
              "flex items-center gap-2.5 rounded-2xl p-2.5 transition-all shadow-inner",
              collapsed ? "justify-center" : "max-w-[215px]"
            )}
            style={{
              background: "rgba(0,0,0,0.3)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <Avatar
              className="size-8.5 shrink-0"
              style={{
                border: isDark ? "2px solid #38bdf8" : "2px solid #dfc9a0",
                boxShadow: isDark ? "0 0 8px rgba(56,189,248,0.4)" : "0 0 8px rgba(223,201,160,0.4)",
              }}
            >
              <AvatarFallback
                className={cn("text-xs font-bold", isDark ? "text-[#38bdf8]" : "text-[#dfc9a0]")}
                style={{ background: isDark ? "#060e24" : "#38020b" }}
              >
                {user ? user.username.slice(0, 2).toUpperCase() : "?"}
              </AvatarFallback>
            </Avatar>

            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-bold text-white leading-tight">
                    {user?.username ?? "..."}
                  </p>
                  <p className={cn("truncate text-[10.5px] leading-tight mt-0.5", isDark ? "text-slate-300" : "text-[#dfc9a0]/90")}>
                    {user ? (ROLES[user.role] ?? user.role) : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  title="Çıkış Yap"
                  className="size-7 flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
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