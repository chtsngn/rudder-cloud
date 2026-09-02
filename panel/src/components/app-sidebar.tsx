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

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col z-30 relative select-none overflow-visible",
        "transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
        collapsed ? "w-[76px]" : "w-[275px]"
      )}
    >
      {/* ═══ ORGANİK YELKEN VE ALTIN KENAR ÇİZGİSİ (SVG GÖVDE) ═══ */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none drop-shadow-xl"
        viewBox={collapsed ? "0 0 76 1000" : "0 0 275 1000"}
        preserveAspectRatio="none"
      >
        <defs>
          {/* Zengin Bordo Degrade */}
          <linearGradient id="sailBurgundyGrad" x1="0" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor="#500412" />
            <stop offset="35%" stopColor="#680b22" />
            <stop offset="70%" stopColor="#580619" />
            <stop offset="100%" stopColor="#38020b" />
          </linearGradient>

          {/* Yelkeni Saran Parlak Altın Çizgi */}
          <linearGradient id="sailGoldStroke" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d4b27d" />
            <stop offset="20%" stopColor="#fae5bf" />
            <stop offset="50%" stopColor="#dfc9a0" />
            <stop offset="80%" stopColor="#c8a87c" />
            <stop offset="100%" stopColor="#9a733e" />
          </linearGradient>
        </defs>

        {collapsed ? (
          /* Dürülmüş Defter / Katlanmış Yelken Formu */
          <path
            d="M 0,0 L 62,0 C 70,0 76,15 76,35 C 76,200 78,500 78,500 C 78,500 76,800 76,965 C 76,985 70,1000 62,1000 L 0,1000 Z"
            fill="url(#sailBurgundyGrad)"
            stroke="url(#sailGoldStroke)"
            strokeWidth="3.5"
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          /* Görsel 3'teki Gibi Yayvan, Geniş Göbekli Organik Yelken Formu */
          <path
            d="M 0,0 L 205,0 C 228,0 242,16 246,45 C 258,160 275,380 275,520 C 275,680 256,860 236,950 C 226,985 208,1000 180,1000 L 0,1000 Z"
            fill="url(#sailBurgundyGrad)"
            stroke="url(#sailGoldStroke)"
            strokeWidth="3.5"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/* ═══ SAĞ ÜST AÇMA/KAPAMA BUTONU (< / > CHEVRON İKONLU ALTIN BUTON) ═══ */}
      <button
        type="button"
        onClick={toggle}
        title={collapsed ? "Menüyü Aç" : "Menüyü Kapat"}
        className={cn(
          "absolute z-50 flex items-center justify-center cursor-pointer transition-all duration-300 shadow-lg",
          "hover:scale-110 active:scale-95 border-2 border-[#500412]",
          collapsed
            ? "right-[-12px] top-20 size-7 rounded-full bg-[#dfc9a0] text-[#500412]"
            : "right-[-12px] top-6 size-7 rounded-full bg-[#dfc9a0] text-[#500412]"
        )}
        style={{
          boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
        }}
      >
        {collapsed ? (
          <ChevronRight className="size-4 stroke-[3]" />
        ) : (
          <ChevronLeft className="size-4 stroke-[3]" />
        )}
      </button>

      {/* ═══ İÇERİK KATMANI ═══ */}
      <div className="relative z-10 flex flex-1 flex-col h-full overflow-hidden">

        {/* ── 1. HEADER: BELİRGİN, BÜYÜK LOGO + ALTIN RUDDER YAZISI ── */}
        <div
          className={cn(
            "flex items-center shrink-0 transition-all duration-300",
            collapsed ? "h-20 justify-center px-0" : "h-24 px-5"
          )}
        >
          <Link href="/" className="flex items-center gap-3.5 group outline-none">
            {/* Büyük Belirgin Dümen Logosu */}
            <div className="relative shrink-0 flex items-center justify-center">
              <Image
                src="/rudder-helm-transparent.png"
                alt="Rudder Dümen"
                width={collapsed ? 36 : 42}
                height={collapsed ? 36 : 42}
                className="object-contain drop-shadow-[0_3px_10px_rgba(0,0,0,0.6)] transition-transform duration-500 group-hover:rotate-90"
                priority
              />
            </div>

            {!collapsed && (
              <span
                className="font-heading font-extrabold text-[22px] tracking-[0.24em] uppercase text-[#dfc9a0] select-none leading-none"
                style={{
                  textShadow: "0 2px 8px rgba(0,0,0,0.6), 0 0 1px #fae5bf",
                }}
              >
                RUDDER
              </span>
            )}
          </Link>
        </div>

        {/* İnce Ayırıcı Şerit */}
        <div
          className={cn("h-px transition-all duration-300", collapsed ? "mx-3" : "mx-5")}
          style={{
            background: "linear-gradient(to right, transparent, rgba(223,201,160,0.25), transparent)",
          }}
        />

        {/* ── 2. NAVİGASYON LİNKLERİ ── */}
        <nav
          className={cn(
            "flex flex-1 flex-col gap-2 pt-6 transition-all duration-300",
            collapsed ? "items-center px-2" : "px-3.5"
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
                    : "rounded-r-2xl rounded-l-xl px-4 py-3",
                  active
                    ? "text-white shadow-inner"
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
                    active ? "text-[#dfc9a0]" : "text-white/80"
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

                {/* Görsel 3'teki gibi aktif öğenin sağındaki imleç ucu */}
                {active && !collapsed && (
                  <div className="ml-auto flex items-center pr-1">
                    <span
                      className="size-2 rounded-full bg-[#dfc9a0]"
                      style={{
                        boxShadow: "0 0 8px #dfc9a0, 0 0 16px rgba(223,201,160,0.5)",
                      }}
                    />
                  </div>
                )}
              </Link>
            )
          })}
        </nav>

        {/* ── 3. ALT PROFİL ALANI ── */}
        <div className={cn("p-4 pb-6 transition-all duration-300", collapsed && "px-2 pb-4")}>
          <div
            className={cn(
              "flex items-center gap-2.5 rounded-2xl p-2.5 transition-all shadow-inner",
              collapsed ? "justify-center" : ""
            )}
            style={{
              background: "rgba(0,0,0,0.22)",
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