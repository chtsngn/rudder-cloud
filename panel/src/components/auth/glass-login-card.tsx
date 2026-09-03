"use client"

import { useState, type FormEvent } from "react"
import Image from "next/image"
import { Loader2, ShieldCheck, Lock, User, ArrowRight, Wind } from "lucide-react"
import { useTranslation } from "@/components/language-provider"

interface GlassLoginCardProps {
  progress: number
  onLoginSuccess?: () => void
}

export function GlassLoginCard({ progress }: GlassLoginCardProps) {
  const { t } = useTranslation()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // 🌪️ KASIRGA (VORTEX) GİRİŞ EŞİĞİ
  // Scroll 0.74'te başlar, 0.90'da tam merkeze oturur
  const appearStart = 0.74
  const appearEnd = 0.90
  const normalizedProgress = Math.min(
    1,
    Math.max(0, (progress - appearStart) / (appearEnd - appearStart))
  )

  const isVisible = normalizedProgress > 0.01
  const isInteractive = normalizedProgress > 0.7

  // Kasırgadan dönerek çıkış parametreleri
  const remaining = 1 - normalizedProgress
  const rotateZ = remaining * -20 // -20 dereceden 0'a spiral dönüş
  const rotateY = remaining * 15 // 3D perspektif eğimi
  const scale = 0.65 + normalizedProgress * 0.35 // Derinlikten büyüme (0.65 -> 1.0)
  const translateY = remaining * 60
  const blur = remaining * 10 // Girdaptan çıkarken netleşme
  const opacity = Math.min(1, normalizedProgress * 1.3)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body?.error ?? "Kullanıcı adı veya şifre yanlış.")
        return
      }
      window.location.href = "/"
    } catch {
      setError("Sunucuya bağlanılamadı. Lütfen tekrar deneyin.")
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
        willChange: "transform, opacity, filter",
      }}
      className="relative z-30 w-full max-w-md transition-all duration-75 ease-out px-4"
    >
      {/* ── Lüks Buzlu Cam (Frosted Obsidian Glass) Gövde ── */}
      <div className="relative overflow-hidden rounded-3xl backdrop-blur-2xl bg-black/60 border border-white/20 dark:border-[#c8a87c]/40 shadow-[0_25px_80px_rgba(0,0,0,0.92),0_0_60px_rgba(200,168,124,0.18)] p-7 md:p-8 space-y-6">
        {/* Kasırga Enerji Işıması (Aura Glows) */}
        <div className="absolute -top-24 -left-24 size-48 rounded-full bg-[#580619]/50 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 size-48 rounded-full bg-[#38bdf8]/25 blur-3xl pointer-events-none" />

        {/* ── 1. LOGO & BAŞLIK ALANI ── */}
        <div className="flex flex-col items-center text-center space-y-3 relative z-10">
          <div className="relative group">
            {/* Dümen Arkası Altın Işık Halesi */}
            <div className="absolute -inset-2 rounded-full bg-radial from-[#c8a87c]/45 to-transparent blur-md opacity-80 group-hover:opacity-100 transition-opacity" />
            <Image
              src="/rudder-helm-transparent.png"
              alt="Rudder Dümen"
              width={76}
              height={76}
              className="relative object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.7)] animate-in zoom-in-95 duration-500"
              priority
            />
          </div>

          <div>
            <h1
              className="font-heading text-3xl font-extrabold uppercase tracking-[0.25em]"
              style={{
                color: "#c8a87c",
                textShadow: "0 2px 14px rgba(0,0,0,0.8)",
              }}
            >
              Rudder
            </h1>
            <p className="text-xs mt-1 tracking-[0.18em] uppercase text-white/80 font-mono font-medium flex items-center justify-center gap-1.5">
              <ShieldCheck className="size-3.5 text-[#38bdf8]" />
              <span>Yönetici Doğrulama Konsolu</span>
            </p>
          </div>
        </div>

        {/* ── 2. HATA MESAJI (VARSA) ── */}
        {error && (
          <div className="rounded-xl bg-rose-950/70 border border-rose-700/60 p-3 text-xs text-rose-200 font-medium text-center shadow-lg animate-in fade-in-50 duration-200">
            {error}
          </div>
        )}

        {/* ── 3. GİRİŞ FORMU (YÜKSEK KONTRAST & OKUNABİLİRLİK) ── */}
        <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
          {/* Kullanıcı Adı */}
          <div className="space-y-1.5">
            <label
              htmlFor="username"
              className="block text-xs font-semibold text-slate-200 font-sans tracking-wide"
            >
              {t("auth.usernameLabel")}
            </label>
            <div className="relative flex items-center">
              <User className="absolute left-3.5 size-4 text-slate-400 pointer-events-none" />
              <input
                id="username"
                type="text"
                autoComplete="username"
                required
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl border border-white/20 bg-black/50 pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:border-[#c8a87c] focus:bg-black/65 focus:ring-2 focus:ring-[#c8a87c]/30 shadow-inner"
              />
            </div>
          </div>

          {/* Parola */}
          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="block text-xs font-semibold text-slate-200 font-sans tracking-wide"
            >
              {t("auth.passwordLabel")}
            </label>
            <div className="relative flex items-center">
              <Lock className="absolute left-3.5 size-4 text-slate-400 pointer-events-none" />
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-white/20 bg-black/50 pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:border-[#c8a87c] focus:bg-black/65 focus:ring-2 focus:ring-[#c8a87c]/30 shadow-inner font-mono"
              />
            </div>
          </div>

          {/* Giriş Butonu */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#580619] via-[#720a22] to-[#580619] hover:from-[#720a22] hover:to-[#8a0d2a] py-3.5 text-xs font-bold uppercase tracking-wider text-white shadow-[0_8px_25px_rgba(88,6,25,0.6)] transition-all disabled:opacity-60 mt-4 border border-[#c8a87c]/50 hover:border-[#dfc9a0] cursor-pointer active:scale-[0.98]"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin text-inherit" />
            ) : (
              <>
                <span className="tracking-widest">{t("auth.loginBtn")}</span>
                <ArrowRight className="size-4 text-inherit" />
              </>
            )}
          </button>
        </form>

        {/* ── 4. DİPNOT BİLGİLENDİRME ── */}
        <div className="pt-2 text-center text-[11px] text-white/50 font-mono flex items-center justify-center gap-2 border-t border-white/10">
          <span>Rudder Cloud</span>
          <span>•</span>
          <span>v1.1.0 Secured</span>
        </div>
      </div>
    </div>
  )
}
