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

  const activeIdx = navItems.findIndex(item =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
  )

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col z-30 relative select-none overflow-visible",
        "transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
        collapsed ? "w-[78px]" : "w-[280px]"
      )}
    >
      {/* ═══ ORGANİK YELKEN VE KALIN ALTIN KENAR ÇİZGİSİ (SVG) ═══ */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none drop-shadow-2xl"
        viewBox={collapsed ? "0 0 78 1000" : "0 0 280 1000"}
        preserveAspectRatio="none"
      >
        <defs>
          {/* Zengin Bordo Degrade - Sol kenar tertemiz bordo */}
          <linearGradient id="sailBurgundyGrad" x1="0" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor="#48030f" />
            <stop offset="35%" stopColor="#680b22" />
            <stop offset="70%" stopColor="#540516" />
            <stop offset="100%" stopColor="#320108" />
          </linearGradient>

          {/* Kalın ve Parlak Altın Çizgi Degradesi (2. Görsel Kalınlığında) */}
          <linearGradient id="sailGoldStroke" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c5a059" />
            <stop offset="20%" stopColor="#fbedd0" />
            <stop offset="45%" stopColor="#dfc9a0" />
            <stop offset="75%" stopColor="#c8a87c" />
            <stop offset="100%" stopColor="#8e6425" />
          </linearGradient>

          {/* İçeriklerin dışarı taşmasını %100 engelleyen tam yelken maskesi */}
          <clipPath id="sailClip">
            <path
              d={
                collapsed
                  ? "M 0,0 L 64,0 C 72,0 78,15 78,35 C 78,200 80,500 80,500 C 80,500 78,800 78,965 C 78,985 72,1000 64,1000 L 0,1000 Z"
                  : "M 0,0 L 208,0 C 230,0 244,16 248,45 C 262,160 280,380 280,520 C 280,680 260,860 238,950 C 228,985 210,1000 180,1000 L 0,1000 Z"
              }
            />
          </clipPath>
        </defs>

        {/* 1. YELKEN GÖVDESİ (Stroke YOK - En soldaki çizgi tamamen silindi, sadece bordo kaldı) */}
        <path
          d={
            collapsed
              ? "M 0,0 L 64,0 C 72,0 78,15 78,35 C 78,200 80,500 80,500 C 80,500 78,800 78,965 C 78,985 72,1000 64,1000 L 0,1000 Z"
              : "M 0,0 L 208,0 C 230,0 244,16 248,45 C 262,160 280,380 280,520 C 280,680 260,860 238,950 C 228,985 210,1000 180,1000 L 0,1000 Z"
          }
          fill="url(#sailBurgundyGrad)"
        />

        {/* 2. SADECE SAĞ KAVİSİ SARAN KALIN ALTIN ÇİZGİ (2. Görseldeki gibi 5px) */}
        <path
          d={
            collapsed
              ? "M 64,0 C 72,0 78,15 78,35 C 78,200 80,500 80,500 C 80,500 78,800 78,965 C 78,985 72,1000 64,1000"
              : "M 208,0 C 230,0 244,16 248,45 C 262,160 280,380 280,520 C 280,680 260,860 238,950 C 228,985 210,1000 180,1000"
          }
          fill="none"
          stroke="url(#sailGoldStroke)"
          strokeWidth="5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* ═══ 2. GÖRSELDEKİ GİBİ ALTIN ÇİZGİDEN ÇIKAN OK İMLECİ (ACTIVE INDICATOR) ═══ */}
      {activeIdx >= 0 && !collapsed && (
        <div
          className="absolute right-0 z-40 transition-all duration-300 pointer-events-none"
          style={{
            top: `${114 + activeIdx * 54}px`,
          }}
        >
          {/* Görsel 2'deki gibi altın şeritten içeri doğru uzanan üçgen altın ok */}
          <div
            className="w-0 h-0 border-solid"
            style={{
              borderTop: "8px solid transparent",
              borderBottom: "8px solid transparent",
              borderRight: "11px solid #dfc9a0",
              filter: "drop-shadow(-2px 0 4px rgba(223, 201, 160, 0.6))",
            }}
          />
        </div>
      )}

      {/* ═══ ELİT PİRİNÇ / ALTIN DENİZCİ AÇMA-KAPAMA BUTONU (LUXURY NAUTICAL TOGGLE) ═══ */}
      <button
        type="button"
        onClick={toggle}
        title={collapsed ? "Yelkeni Aç" : "Yelkeni Kapat"}
        className={cn(
          "absolute z-50 flex items-center justify-center cursor-pointer transition-all duration-300 group",
          "hover:scale-110 active:scale-95",
          collapsed
            ? "right-[-13px] top-24 size-7.5 rounded-full"
            : "right-[-13px] top-6 size-8 rounded-full"
        )}
        style={{
          background: "radial-gradient(circle at 35% 35%, #fcedd2 0%, #dfc9a0 50%, #9e7535 100%)",
          border: "2px solid #3d020a",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.8)",
        }}
      >
        <div className="flex items-center justify-center size-full rounded-full bg-[#48030f]/15">
          {collapsed ? (
            <ChevronRight className="size-4 stroke-[3] text-[#48030f] transition-transform group-hover:translate-x-0.5" />
          ) : (
            <ChevronLeft className="size-4 stroke-[3] text-[#48030f] transition-transform group-hover:-translate-x-0.5" />
          )}
        </div>
      </button>

      {/* ═══ İÇERİK KATMANI (clip-path ile yelken sınırına kilitli, asla dışarı taşmaz) ═══ */}
      <div
        className="relative z-10 flex flex-1 flex-col h-full overflow-hidden"
        style={{
          clipPath: collapsed ? undefined : "polygon(0 0, 94% 0, 99% 10%, 100% 50%, 97% 90%, 88% 100%, 0 100%)",
        }}
      >
        {/* ── 1. HEADER: BÜYÜK LOGO + ALTIN RUDDER YAZISI ── */}
        <div
          className={cn(
            "flex items-center shrink-0 transition-all duration-300",
            collapsed ? "h-20 justify-center px-0" : "h-24 px-5"
          )}
        >
          <Link href="/" className="flex items-center gap-3 group outline-none">
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
                className="font-heading font-extrabold text-[22px] tracking-[0.24em] uppercase text-[#dfc9a0] select-none leading-none"
                style={{
                  textShadow: "0 2px 8px rgba(0,0,0,0.7), 0 0 2px rgba(251, 237, 208, 0.4)",
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
            background: "linear-gradient(to right, transparent, rgba(223,201,160,0.25), transparent)",
          }}
        />

        {/* ── 2. NAVİGASYON LİNKLERİ (Kavis içine tam oturtulmuş, taşma sıfır) ── */}
        <nav
          className={cn(
            "flex flex-1 flex-col gap-2 pt-5 transition-all duration-300",
            collapsed ? "items-center px-2" : "px-3.5 pr-6"
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
                    : "rounded-xl px-4 py-3",
                  active
                    ? "text-white"
                    : "text-white/80 hover:text-white hover:bg-white/[0.08]"
                )}
                style={
                  active
                    ? {
                        background: "rgba(0, 0, 0, 0.35)",
                        boxShadow: "inset 0 1px 3px rgba(0,0,0,0.4)",
                      }
                    : undefined
                }
              >
                <Icon
                  className={cn(
                    "shrink-0 transition-all duration-200 group-hover:scale-110",
                    collapsed ? "size-5" : "size-[19px]",
                    active ? "text-[#dfc9a0]" : "text-white/85"
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
              </Link>
            )
          })}
        </nav>

        {/* ── 3. ALT PROFİL KARTI (Yelken kavisinin içinde, taşma sıfır) ── */}
        <div className={cn("p-3.5 pb-6 transition-all duration-300", collapsed ? "px-2 pb-4" : "pr-7")}>
          <div
            className={cn(
              "flex items-center gap-2.5 rounded-2xl p-2.5 transition-all shadow-inner",
              collapsed ? "justify-center" : ""
            )}
            style={{
              background: "rgba(0,0,0,0.25)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <Avatar
              className="size-9 shrink-0"
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
                  <p className="truncate text-[13px] font-bold text-white leading-tight">
                    {user?.username ?? "..."}
                  </p>
                  <p className="truncate text-[11px] text-[#dfc9a0]/90 leading-tight mt-0.5">
                    {user ? (ROLES[user.role] ?? user.role) : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  title="Çıkış Yap"
                  className="size-7 flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                >
                  <LogOut className="size-4" />
                </button>
              </>
            )}
          </div>
        </div>

      </div>
    </aside>
  )
}