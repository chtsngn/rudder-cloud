"use client"

import { useState, useRef, useEffect, type FormEvent } from "react"
import { Loader2 } from "lucide-react"
import { useTranslation } from "@/components/language-provider"
import { APP_VERSION } from "@/lib/version"

interface GlassLoginCardProps {
  progress: number
  onLoginSuccess?: () => void
}

export function GlassLoginCard({ progress }: GlassLoginCardProps) {
  const { t, lang } = useTranslation()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const usernameInputRef = useRef<HTMLInputElement>(null)

  // 🌪️ KASIRGA (VORTEX) GİRİŞ EŞİĞİ
  // Daha erken başlar (0.58), daha geniş ve dengeli bir geçişle (0.92) merkeze oturur
  const appearStart = 0.58
  const appearEnd = 0.92
  const normalizedProgress = Math.min(
    1,
    Math.max(0, (progress - appearStart) / (appearEnd - appearStart))
  )

  const isVisible = normalizedProgress > 0.01
  const isInteractive = normalizedProgress > 0.7

  // Kart oturduğunda kullanıcı adına otomatik odaklan
  useEffect(() => {
    if (isInteractive && usernameInputRef.current) {
      const timer = setTimeout(() => {
        usernameInputRef.current?.focus()
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [isInteractive])

  // Kasırgadan dönerek çıkış parametreleri
  const remaining = 1 - normalizedProgress
  const rotateZ = remaining * -18
  const rotateY = remaining * 12
  const scale = 0.7 + normalizedProgress * 0.3
  const translateY = remaining * 50
  const blur = remaining * 8
  const opacity = Math.min(1, normalizedProgress * 1.3)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, lang }),
      })
      if (!res.ok) {
        setError(t("auth.errorInvalid"))
        return
      }
      window.location.href = "/"
    } catch {
      setError(t("auth.errorConnection"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        opacity,
        transform: `perspective(1200px) translate3d(0, ${translateY}px, 0) scale(${scale}) rotateZ(${rotateZ}deg) rotateY(${rotateY}deg)`,
        filter: blur > 0.5 ? `blur(${blur}px)` : "none",
        pointerEvents: isInteractive ? "auto" : "none",
        visibility: isVisible ? "visible" : "hidden",
        willChange: "transform, opacity",
      }}
      className="relative z-30 w-full max-w-md px-4"
    >
      {/* ── Lüks Buzlu Obsidyen Gece Camı (Kahverengisiz, Saf Gece Tonları) ── */}
      <div className="relative overflow-hidden rounded-3xl backdrop-blur-2xl bg-slate-950/70 border border-slate-700/60 shadow-[0_25px_80px_rgba(0,0,0,0.95),0_0_50px_rgba(30,41,59,0.5)] p-7 md:p-8 space-y-6">
        {/* Gece ve Fırtına Aurası */}
        <div className="absolute -top-24 -left-24 size-48 rounded-full bg-slate-800/35 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 size-48 rounded-full bg-sky-950/40 blur-3xl pointer-events-none" />

        {/* ── 1. BAŞLIK ALANI (KARTTA DÜMEN LOGOSU YOK, GRENZE FONTU, PUSLU GRİ) ── */}
        <div className="flex flex-col items-center text-center space-y-2 relative z-10">
          <h1
            className="font-grenze text-4xl sm:text-5xl font-black uppercase tracking-[0.22em]"
            style={{
              color: "#cbd5e1",
              textShadow:
                "0 0 35px rgba(203, 213, 225, 0.4), 0 2px 14px rgba(0,0,0,0.9)",
            }}
          >
            Rudder
          </h1>
          <p className="text-[11px] tracking-[0.2em] uppercase text-slate-400 font-mono font-medium">
            {t("auth.consoleSubtitle")}
          </p>
        </div>

        {/* ── 2. HATA MESAJI (VARSA) ── */}
        {error && (
          <div className="rounded-xl bg-rose-950/70 border border-rose-700/60 p-3 text-xs text-rose-200 font-medium text-center shadow-lg animate-in fade-in-50 duration-200">
            {error}
          </div>
        )}

        {/* ── 3. GİRİŞ FORMU (İKONSUZ, MİNİMALİST, YÜKSEK KONTRAST) ── */}
        <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
          {/* Kullanıcı Adı */}
          <div className="space-y-1.5">
            <label
              htmlFor="username"
              className="block text-xs font-semibold text-slate-300 font-sans tracking-wide"
            >
              {t("auth.usernameLabel")}
            </label>
            <input
              ref={usernameInputRef}
              id="username"
              type="text"
              autoComplete="username"
              required
              placeholder="admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:border-slate-400 focus:bg-slate-900/85 focus:ring-2 focus:ring-slate-400/20 shadow-inner"
            />
          </div>

          {/* Parola */}
          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="block text-xs font-semibold text-slate-300 font-sans tracking-wide"
            >
              {t("auth.passwordLabel")}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:border-slate-400 focus:bg-slate-900/85 focus:ring-2 focus:ring-slate-400/20 shadow-inner font-mono"
            />
          </div>

          {/* Giriş Butonu (İkonsuz, Sade, Lüks Gece Tonu) */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 hover:from-slate-800 hover:to-slate-700 py-3.5 text-xs font-bold uppercase tracking-wider text-white shadow-[0_6px_25px_rgba(0,0,0,0.8)] hover:shadow-[0_8px_30px_rgba(148,163,184,0.15)] transition-all disabled:opacity-60 mt-4 border border-slate-600/60 hover:border-slate-400 cursor-pointer active:scale-[0.98]"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin text-inherit" />
            ) : (
              <span className="tracking-[0.2em]">{t("auth.loginBtn")}</span>
            )}
          </button>
        </form>

        {/* ── 4. DİPNOT BİLGİLENDİRME ── */}
        <div className="pt-2 text-center text-[11px] text-slate-400 font-mono flex items-center justify-center gap-2 border-t border-slate-800/80">
          <span>Rudder Cloud</span>
          <span>•</span>
          <span>{t("auth.secured", { version: APP_VERSION })}</span>
        </div>
      </div>
    </div>
  )
}
