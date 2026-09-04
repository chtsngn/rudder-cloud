"use client"

import { useEffect, useRef, useState } from "react"
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
  Sparkles,
  Terminal,
  Users,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useCurrentUser } from "@/hooks/use-current-user"
import { useTheme } from "@/components/theme-provider"
import { useTranslation } from "@/components/language-provider"
import { useSidebar } from "@/components/sidebar-context"
import { useSystemVersion } from "@/hooks/use-system-version"
import { SystemUpdateModal } from "@/components/system-update-modal"
import { APP_VERSION } from "@/lib/version"
import { cn } from "@/lib/utils"

const SIDEBAR_KEY = "panel:sidebar-collapsed"

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useCurrentUser()
  const { theme } = useTheme()
  const { t, lang, setLang } = useTranslation()
  const { mobileOpen, closeMobile, toggleMobile, openMobile } = useSidebar()
  const [collapsed, setCollapsed] = useState(false)
  const [isSpinning, setIsSpinning] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const { data: versionData } = useSystemVersion()
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false)

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

  // Close mobile sidebar on route change only
  const prevPathname = useRef(pathname)
  useEffect(() => {
    if (prevPathname.current !== pathname) {
      prevPathname.current = pathname
      closeMobile()
    }
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
          { href: "/users", label: t("nav.users"), icon: Users },
          { href: "/audit", label: t("nav.audit"), icon: ClipboardList },
          { href: "/settings", label: t("nav.settings"), icon: Settings },
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
      {/* ═══ MOBİLDE KAPALIYKEN SOL KENARDAKİ YARIM DÜMEN BUTONU ═══ */}
      {!mobileOpen && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            openMobile()
          }}
          className="lg:hidden fixed left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-[9999] size-12 rounded-full cursor-pointer hover:scale-110 active:scale-95 transition-all outline-none"
          title="Menüyü Aç"
          aria-label="Menüyü Aç"
        >
          {/* Dokunma alanını ekranın içine doğru genişleten görünmez katman */}
          <span className="absolute -inset-y-3 -left-2 -right-6 pointer-events-auto" aria-hidden="true" />

          {/* Işıma Halosu */}
          <div
            className={cn(
              "absolute inset-0 rounded-full blur-md transition-all pointer-events-none",
              isDark ? "bg-[#38bdf8]/60" : "bg-[#dfc9a0]/60"
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
              boxShadow: "0 4px 14px rgba(0,0,0,0.8), inset 0 2px 4px rgba(255,255,255,0.8)",
            }}
          >
            <Image
              src="/rudder-helm-transparent.png"
              alt="Dümen"
              width={28}
              height={28}
              className="object-contain"
            />
          </div>
        </button>
      )}

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
          {/* Dinamik Renk Temasına Duyarlı Yelken Degradesi */}
          <linearGradient id="sailDynamicGrad" x1="0" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor="var(--sail-bg-0, #0b1739)" />
            <stop offset="35%" stopColor="var(--sail-bg-1, #0e1f4d)" />
            <stop offset="70%" stopColor="var(--sail-bg-2, #0a1536)" />
            <stop offset="100%" stopColor="var(--sail-bg-3, #060e24)" />
          </linearGradient>

          {/* Dinamik Renk Temasına Duyarlı Kenar Çizgi Degradesi */}
          <linearGradient id="sailDynamicStroke" x1="0" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor="var(--sail-stroke-0, #38bdf8)" />
            <stop offset="20%" stopColor="var(--sail-stroke-1, #e2e8f0)" />
            <stop offset="45%" stopColor="var(--sail-stroke-2, #7dd3fc)" />
            <stop offset="75%" stopColor="var(--sail-stroke-0, #38bdf8)" />
            <stop offset="100%" stopColor="var(--sail-stroke-3, #0284c7)" />
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

      {/* ═══ MENÜNÜN İÇİNDEKİ DÜMEN BUTONU (Masaüstünde toggle, Mobilde açıkken kapatma butonu) ═══ */}
      <button
        type="button"
        onClick={handleToggle}
        title={isMenuOpen ? "Yelkeni Katla" : "Yelkeni Aç"}
        aria-label={isMenuOpen ? "Menüyü Kapat" : "Menüyü Aç"}
        className={cn(
          "absolute z-50 top-1/2 -translate-y-1/2 items-center justify-center cursor-pointer transition-all duration-300 group select-none",
          "hover:scale-125 active:scale-90",
          // Desktop positioning
          "lg:flex",
          effectivelyCollapsed ? "lg:-right-3.5 lg:size-7.5" : "lg:-right-4 lg:size-9",
          // Mobile: only visible when sidebar is open
          mobileOpen ? "flex -right-4 size-9" : "hidden"
        )}
      >
        {/* Işıma Halosu */}
        <div
          className="absolute inset-0 rounded-full blur-sm transition-all pointer-events-none opacity-40 group-hover:opacity-80"
          style={{
            backgroundColor: "var(--sidebar-accent, #38bdf8)",
            boxShadow: "0 0 16px var(--accent-subtle)",
          }}
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
                className="rudder-brand-title font-extrabold text-[22px] tracking-[0.24em] uppercase select-none leading-none transition-all duration-300"
                style={{
                  fontFamily: "'Grenze', serif",
                  color: "var(--sidebar-logo-text, #cbd5e1)",
                  textShadow: "0 0 14px var(--sidebar-logo-glow, rgba(203, 213, 225, 0.45)), 0 2px 6px rgba(0,0,0,0.9)",
                }}
              >
                RUDDER
              </span>
            )}
          </Link>
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
                    active ? "" : "text-white/80"
                  )}
                  style={active ? { color: "var(--sidebar-accent, #38bdf8)" } : undefined}
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
                        borderRight: "10px solid var(--sidebar-accent, #38bdf8)",
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
                className="size-8 rounded-lg text-xs font-bold font-mono uppercase transition-all flex items-center justify-center cursor-pointer border"
                style={{
                  backgroundColor: "var(--sidebar-accent-bg, #101c38)",
                  color: "var(--sidebar-accent, #38bdf8)",
                  borderColor: "var(--sidebar-accent, #2a4687)",
                  boxShadow: "0 0 8px var(--accent-subtle)",
                }}
              >
                {lang.toUpperCase()}
              </button>
            ) : (
              <div className="flex items-center w-full gap-1">
                <button
                  type="button"
                  onClick={() => setLang("tr")}
                  className={cn(
                    "flex-1 py-1 px-2 rounded-lg text-xs font-semibold font-mono tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer border",
                    lang === "tr"
                      ? ""
                      : "text-white/60 hover:text-white hover:bg-white/5 border-transparent"
                  )}
                  style={
                    lang === "tr"
                      ? {
                          backgroundColor: "var(--sidebar-accent-bg, #101c38)",
                          color: "var(--sidebar-accent, #38bdf8)",
                          borderColor: "var(--sidebar-accent, #2a4687)",
                          boxShadow: "0 0 8px var(--accent-subtle)",
                        }
                      : undefined
                  }
                >
                  <span>🇹🇷</span>
                  <span>TR</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLang("en")}
                  className={cn(
                    "flex-1 py-1 px-2 rounded-lg text-xs font-semibold font-mono tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer border",
                    lang === "en"
                      ? ""
                      : "text-white/60 hover:text-white hover:bg-white/5 border-transparent"
                  )}
                  style={
                    lang === "en"
                      ? {
                          backgroundColor: "var(--sidebar-accent-bg, #101c38)",
                          color: "var(--sidebar-accent, #38bdf8)",
                          borderColor: "var(--sidebar-accent, #2a4687)",
                          boxShadow: "0 0 8px var(--accent-subtle)",
                        }
                      : undefined
                  }
                >
                  <span>🇬🇧</span>
                  <span>EN</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── 2.6 SİSTEM GÜNCELLEME BİLDİRİMİ / SÜRÜM BİLGİSİ ── */}
        <div className={cn("px-3.5 pb-2 transition-all duration-300", effectivelyCollapsed ? "px-2" : "pr-8 pl-3.5")}>
          {versionData?.hasUpdate ? (
            <button
              type="button"
              onClick={() => setIsUpdateModalOpen(true)}
              title={`Yeni Sürüm: ${versionData.latestVersion} (Güncellemek için tıklayın)`}
              className={cn(
                "w-full flex items-center gap-2 rounded-xl px-2.5 py-1.5 transition-all text-xs font-semibold cursor-pointer border shadow-sm group",
                effectivelyCollapsed ? "justify-center px-0 py-2" : "justify-between"
              )}
              style={{
                background: "linear-gradient(135deg, rgba(234, 179, 8, 0.22), rgba(249, 115, 22, 0.22))",
                borderColor: "rgba(234, 179, 8, 0.55)",
                color: "#fef08a",
                boxShadow: "0 0 12px rgba(234, 179, 8, 0.25)",
              }}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Sparkles className="size-3.5 shrink-0 text-amber-300 animate-pulse" />
                {!effectivelyCollapsed && (
                  <span className="truncate text-[11px] font-bold tracking-tight text-amber-200 group-hover:text-white transition-colors">
                    {versionData.latestVersion} Yayında
                  </span>
                )}
              </div>
              {!effectivelyCollapsed && (
                <span className="text-[10px] bg-amber-500/30 text-amber-200 px-1.5 py-0.5 rounded-md uppercase tracking-wider font-mono border border-amber-400/30 shrink-0">
                  Güncelle
                </span>
              )}
            </button>
          ) : (
            !effectivelyCollapsed && (
              <div className="flex items-center justify-between px-1.5 py-0.5 text-[10.5px] font-mono text-white/40">
                <span className="tracking-wide">Rudder Cloud</span>
                <button
                  type="button"
                  onClick={() => setIsUpdateModalOpen(true)}
                  className="hover:text-white/80 transition-colors cursor-pointer text-white/50"
                  title="Sistem ve Sürüm Detayları"
                >
                  {versionData?.currentVersion || APP_VERSION}
                </button>
              </div>
            )
          )}
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
                border: "2px solid var(--sidebar-accent, #38bdf8)",
                boxShadow: "0 0 8px var(--accent-subtle)",
              }}
            >
              <AvatarFallback
                className="text-xs font-bold"
                style={{
                  color: "var(--sidebar-accent, #38bdf8)",
                  background: "var(--sidebar-accent-bg, #060e24)",
                }}
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
                  <p
                    className="truncate text-[10.5px] leading-tight mt-0.5"
                    style={{ color: "var(--sidebar-accent-light, #cbd5e1)" }}
                  >
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

    {/* Güncelleme Modal'ı */}
    <SystemUpdateModal
      open={isUpdateModalOpen}
      onOpenChange={setIsUpdateModalOpen}
      versionData={versionData}
    />
    </>
  )
}