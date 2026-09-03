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
  X,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useCurrentUser } from "@/hooks/use-current-user"
import { useTheme } from "@/components/theme-provider"
import { useTranslation } from "@/components/language-provider"
import { useSidebar } from "@/components/sidebar-context"
import { cn } from "@/lib/utils"

const SIDEBAR_KEY = "panel:sidebar-collapsed"

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useCurrentUser()
  const { theme } = useTheme()
  const { t, lang, setLang } = useTranslation()
  const { mobileOpen, closeMobile, toggleMobile } = useSidebar()
  const [collapsed, setCollapsed] = useState(false)
  const [isSpinning, setIsSpinning] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const isDark =
    theme === "dark" ||
    (typeof window !== "undefined" &&
      (document.documentElement.classList.contains("dark") ||
        document.documentElement.getAttribute("data-theme") === "dark"))

  useEffect(() => {
    const tTimer = setTimeout(() => {
      try { setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1") } catch {}
    }, 0)
    return () => clearTimeout(tTimer)
  }, [])

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024)
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  // Close mobile sidebar on route change
  useEffect(() => {
    closeMobile()
  }, [pathname, closeMobile])

  const effectivelyCollapsed = collapsed && !isMobile

  function handleToggle() {
    setIsSpinning(true)
    setTimeout(() => setIsSpinning(false), 600)
    const isMobileNow = typeof window !== "undefined" ? window.innerWidth < 1024 : isMobile
    if (isMobileNow) {
      toggleMobile()
    } else {
      setCollapsed(p => {
        const n = !p
        try { localStorage.setItem(SIDEBAR_KEY, n ? "1" : "0") } catch {}
        return n
      })
    }
  }

  const navItems = [
    { href: "/", label: t("nav.home"), icon: Home },
    { href: "/sites", label: t("nav.sites"), icon: Globe },
    ...(user?.role === "SUPER_ADMIN"
      ? [
          { href: "/terminal", label: t("nav.terminal"), icon: Terminal },
          { href: "/settings", label: t("nav.settings"), icon: Settings },
          { href: "/users", label: t("nav.users"), icon: Users },
          { href: "/audit", label: t("nav.audit"), icon: ClipboardList },
        ]
      : []),
  ]

  async function logout() {
    try { await fetch("/api/auth/logout", { method: "POST" }) } finally {
      router.push("/login"); router.refresh()
    }
  }

  const activeIdx = navItems.findIndex(item =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
  )

  const isMenuOpen = isMobile ? mobileOpen : !effectivelyCollapsed

  return (
    <>
      {/* ═══ MOBİL BACKDROP (lg altında sidebar açıkken karartma) ═══ */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden backdrop-blur-xs transition-opacity duration-300"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      {/* ═══ SIDEBAR ═══
          Mobil (< lg): fixed overlay — mobileOpen ile slide-in/out
          Desktop (≥ lg): sticky — collapsed/expanded push davranışı
      */}
      <aside
        className={cn(
          "flex h-screen shrink-0 flex-col select-none overflow-visible pointer-events-auto",
          "transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
          // --- Desktop: sticky, push content ---
          "lg:sticky lg:top-0 lg:z-30 lg:relative lg:translate-x-0",
          effectivelyCollapsed ? "lg:w-[80px]" : "lg:w-[285px]",
          // --- Mobile: fixed overlay ---
          "fixed top-0 left-0 z-50 h-full w-[285px]",
          mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full shadow-none"
        )}
      >
      {/* ═══ ORGANİK YELKEN VE KALIN ALTIN/AY IŞIĞI KENAR ÇİZGİSİ (SVG GÖVDE) ═══ */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none drop-shadow-2xl"
        viewBox={effectivelyCollapsed ? "0 0 80 1000" : "0 0 285 1000"}
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
          <linearGradient id="sailDynamicStroke" x1="0" y1="0" x2="0.8" y2="1">
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
            effectivelyCollapsed
              ? "M 0,0 L 66,0 C 74,0 80,15 80,35 C 80,200 82,500 82,500 C 82,500 80,800 80,965 C 80,985 74,1000 66,1000 L 0,1000 Z"
              : "M 0,0 L 210,0 C 234,0 248,16 252,45 C 266,160 285,380 285,520 C 285,680 264,860 242,950 C 232,985 214,1000 184,1000 L 0,1000 Z"
          }
          fill="url(#sailDynamicGrad)"
        />

        {/* 2. SADECE SAĞ KAVİSTEKİ KALIN ÇİZGİ */}
        <path
          d={
            effectivelyCollapsed
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
        onClick={handleToggle}
        title={isMenuOpen ? "Yelkeni Katla" : "Yelkeni Aç"}
        aria-label={isMenuOpen ? "Menüyü Kapat" : "Menüyü Aç"}
        className={cn(
          "absolute z-50 top-1/2 -translate-y-1/2 flex items-center justify-center cursor-pointer transition-all duration-300 group select-none",
          "hover:scale-125 active:scale-90",
          // Desktop positioning
          "lg:-right-4 lg:size-9",
          effectivelyCollapsed && "lg:-right-3.5 lg:size-7.5",
          // Mobile positioning: exactly -right-[18px] so half is tucked in when closed (visible on left border), and sits on the sail edge when open
          "-right-[18px] size-9"
        )}
      >
        {/* Genişletilmiş görünmez dokunma alanı (mobilde rahat tıklanabilmesi için) */}
        <span className="absolute -inset-4 rounded-full pointer-events-auto" aria-hidden="true" />

        {/* Işıma Halosu */}
        <div
          className={cn(
            "absolute inset-0 rounded-full blur-sm transition-all pointer-events-none",
            isDark
              ? "bg-[#38bdf8]/30 group-hover:bg-[#38bdf8]/60"
              : "bg-[#dfc9a0]/30 group-hover:bg-[#dfc9a0]/60",
            !isMenuOpen && isMobile && "bg-[#38bdf8]/60 shadow-[0_0_12px_rgba(56,189,248,0.5)]"
          )}
        />

        {/* Madalyon Gövdesi */}
        <div
          className="relative size-full rounded-full flex items-center justify-center p-1 pointer-events-none"
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
              isMenuOpen ? "rotate-180" : "rotate-0"
            )}
          />
        </div>
      </button>

      {/* ═══ İÇERİK ALANI ═══ */}
      <div className="relative z-10 flex flex-1 flex-col h-full overflow-hidden">

        {/* ── 1. HEADER: BÜYÜK & BELİRGİN LOGO + RUDDER YAZISI + MOBİL KAPAT BUTONU ── */}
        <div
          className={cn(
            "flex items-center shrink-0 transition-all duration-300",
            effectivelyCollapsed ? "h-20 justify-center px-0" : "h-24 px-5 justify-between"
          )}
        >
          <Link href="/" onClick={closeMobile} className="flex items-center gap-3.5 group outline-none">
            <div className="relative shrink-0 flex items-center justify-center">
              <Image
                src="/rudder-helm-transparent.png"
                alt="Rudder Logo"
                width={effectivelyCollapsed ? 36 : 42}
                height={effectivelyCollapsed ? 36 : 42}
                className="object-contain drop-shadow-[0_3px_12px_rgba(0,0,0,0.7)] transition-transform duration-500 group-hover:rotate-90"
                priority
              />
            </div>

            {!effectivelyCollapsed && (
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

          {/* Mobilde sağ üstte Kapat X butonu */}
          {!effectivelyCollapsed && (
            <button
              type="button"
              onClick={closeMobile}
              className="lg:hidden size-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors mr-2 cursor-pointer"
              aria-label="Menüyü Kapat"
            >
              <X className="size-5" />
            </button>
          )}
        </div>

        {/* İnce Ayırıcı Şerit */}
        <div
          className={cn("h-px transition-all duration-300", effectivelyCollapsed ? "mx-3" : "mx-5 mr-8")}
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
            effectivelyCollapsed ? "items-center px-2" : "px-3.5 pr-8"
          )}
        >
          {navItems.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMobile}
                title={effectivelyCollapsed ? item.label : undefined}
                className={cn(
                  "relative flex items-center gap-3.5 font-medium transition-all duration-200 group",
                  effectivelyCollapsed
                    ? "justify-center rounded-xl p-3 size-12"
                    : "rounded-l-xl rounded-r-md px-4 py-3",
                  active
                    ? "text-white shadow-inner"
                    : "text-white/80 hover:text-white hover:bg-white/[0.08]"
                )}
                style={
                  active && !effectivelyCollapsed
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
                    effectivelyCollapsed ? "size-5" : "size-[19px]",
                    active ? (isDark ? "text-[#38bdf8]" : "text-[#dfc9a0]") : "text-white/80"
                  )}
                />

                {!effectivelyCollapsed && (
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
                {active && !effectivelyCollapsed && (
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

        {/* ── 2.5 DİL GEÇİŞ DÜĞMESİ (TR | EN) ── */}
        <div className={cn("px-3.5 pb-2 transition-all duration-300", effectivelyCollapsed ? "px-2" : "pr-8 pl-3.5")}>
          <div
            className={cn(
              "flex items-center rounded-xl p-1 shadow-inner",
              effectivelyCollapsed ? "justify-center" : "max-w-[215px] justify-between"
            )}
            style={{
              background: "rgba(0,0,0,0.3)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {effectivelyCollapsed ? (
              <button
                type="button"
                onClick={() => setLang(lang === "tr" ? "en" : "tr")}
                title={lang === "tr" ? "Switch to English" : "Türkçe'ye Geç"}
                className={cn(
                  "size-8 rounded-lg text-xs font-bold font-mono uppercase transition-all flex items-center justify-center cursor-pointer",
                  isDark
                    ? "bg-[#101c38] text-[#38bdf8] border border-[#2a4687]/70 shadow-[0_0_8px_rgba(56,189,248,0.3)]"
                    : "bg-[#580619] text-[#dfc9a0] border border-[#dfc9a0]/40 shadow-[0_0_8px_rgba(223,201,160,0.3)]"
                )}
              >
                {lang.toUpperCase()}
              </button>
            ) : (
              <div className="flex items-center w-full gap-1">
                <button
                  type="button"
                  onClick={() => setLang("tr")}
                  className={cn(
                    "flex-1 py-1 px-2 rounded-lg text-xs font-semibold font-mono tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                    lang === "tr"
                      ? isDark
                        ? "bg-[#101c38] text-[#38bdf8] border border-[#2a4687]/80 shadow-[0_0_8px_rgba(56,189,248,0.3)]"
                        : "bg-[#580619] text-[#dfc9a0] border border-[#dfc9a0]/50 shadow-[0_0_8px_rgba(223,201,160,0.3)]"
                      : "text-white/60 hover:text-white hover:bg-white/5 border border-transparent"
                  )}
                >
                  <span>🇹🇷</span>
                  <span>TR</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLang("en")}
                  className={cn(
                    "flex-1 py-1 px-2 rounded-lg text-xs font-semibold font-mono tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                    lang === "en"
                      ? isDark
                        ? "bg-[#101c38] text-[#38bdf8] border border-[#2a4687]/80 shadow-[0_0_8px_rgba(56,189,248,0.3)]"
                        : "bg-[#580619] text-[#dfc9a0] border border-[#dfc9a0]/50 shadow-[0_0_8px_rgba(223,201,160,0.3)]"
                      : "text-white/60 hover:text-white hover:bg-white/5 border border-transparent"
                  )}
                >
                  <span>🇬🇧</span>
                  <span>EN</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── 3. ALT PROFİL KARTI (Kavis içine tam oturtulmuş, taşma sıfır) ── */}
        <div
          className={cn(
            "p-3.5 pb-6 transition-all duration-300",
            effectivelyCollapsed ? "px-2 pb-4" : "pr-8 pl-3.5"
          )}
        >
          <div
            className={cn(
              "flex items-center gap-2.5 rounded-2xl p-2.5 transition-all shadow-inner",
              effectivelyCollapsed ? "justify-center" : "max-w-[215px]"
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

            {!effectivelyCollapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-bold text-white leading-tight">
                    {user?.username ?? "..."}
                  </p>
                  <p className={cn("truncate text-[10.5px] leading-tight mt-0.5", isDark ? "text-slate-300" : "text-[#dfc9a0]/90")}>
                    {user ? (user.role === "SUPER_ADMIN" ? t("nav.superAdmin") : t("nav.member")) : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  title={t("nav.logout")}
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
    </>
  )
}