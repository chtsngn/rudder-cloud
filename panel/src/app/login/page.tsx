"use client"

import { useState, useCallback } from "react"
import Image from "next/image"
import { ChevronDown, Compass, FastForward } from "lucide-react"
import { useTranslation } from "@/components/language-provider"
import { FrameSequencePlayer } from "@/components/auth/frame-sequence-player"
import { GlassLoginCard } from "@/components/auth/glass-login-card"

export default function LoginPage() {
  const { lang, setLang } = useTranslation()
  const [scrollProgress, setScrollProgress] = useState(0)

  // Scroll ilerlemesi değiştikçe state güncelle
  const handleProgress = useCallback((progress: number) => {
    setScrollProgress(progress)
  }, [])

  // Hızlıca login penceresine atla
  const handleSkipToLogin = () => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "smooth",
    })
  }

  // İlk sahne (Gökyüzü & Yıldızlar) metin opaklığı
  const introOpacity = Math.max(0, 1 - scrollProgress * 3.2)
  const isIntroVisible = introOpacity > 0.02

  return (
    <div className="relative min-h-[380vh] bg-black selection:bg-[#c8a87c]/30 selection:text-white">
      {/* ═══ 1. ARKA PLAN KARE DİZİSİ (CANVAS FRAME SEQUENCE) ═══ */}
      <FrameSequencePlayer
        manifestUrl="/frames/manifest.json"
        onProgress={handleProgress}
      />

      {/* ═══ 2. SABİT GÖRÜNÜM ALANI (FIXED VIEWPORT) ═══ */}
      <div className="fixed inset-0 z-20 flex flex-col justify-between p-5 md:p-8 pointer-events-none">
        {/* ── Üst Bar (Header Bar) ── */}
        <header className="flex items-center justify-between w-full pointer-events-auto">
          {/* Sol: Rudder Minimal Brand */}
          <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 shadow-lg">
            <Image
              src="/rudder-helm-transparent.png"
              alt="Rudder"
              width={24}
              height={24}
              className="object-contain"
            />
            <span className="font-heading font-black tracking-[0.2em] text-[#c8a87c] text-xs uppercase">
              Rudder
            </span>
          </div>

          {/* Sağ: Dil Seçici & Hızlı Giriş Butonu */}
          <div className="flex items-center gap-2.5">
            {/* Hızlı Giriş Butonu (Animasyonu Atla) */}
            {scrollProgress < 0.7 && (
              <button
                type="button"
                onClick={handleSkipToLogin}
                className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/45 backdrop-blur-md border border-white/15 text-slate-300 hover:text-white hover:border-[#c8a87c]/60 text-xs font-semibold shadow-lg transition-all cursor-pointer hover:scale-105 active:scale-95"
              >
                <FastForward className="size-3.5 text-[#c8a87c] transition-transform group-hover:translate-x-0.5" />
                <span className="hidden sm:inline">Hızlı Giriş</span>
              </button>
            )}

            {/* Dil Seçici */}
            <div className="flex items-center gap-1 bg-black/45 backdrop-blur-md p-1 rounded-xl border border-white/15 shadow-lg">
              <button
                type="button"
                onClick={() => setLang("tr")}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                  lang === "tr"
                    ? "bg-[#c8a87c] text-[#3d0510] shadow-sm font-bold"
                    : "text-white/70 hover:text-white"
                }`}
              >
                TR
              </button>
              <button
                type="button"
                onClick={() => setLang("en")}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                  lang === "en"
                    ? "bg-[#c8a87c] text-[#3d0510] shadow-sm font-bold"
                    : "text-white/70 hover:text-white"
                }`}
              >
                EN
              </button>
            </div>
          </div>
        </header>

        {/* ── Orta Alan: Senaryo Başlangıç Yazısı & Login Kartı ── */}
        <main className="flex flex-1 items-center justify-center relative w-full">
          {/* SAHNE 1: Gökyüzü Karşılama Yazısı (Scroll ettikçe kaybolur) */}
          <div
            style={{
              opacity: introOpacity,
              transform: `translate3d(0, ${scrollProgress * -60}px, 0)`,
              display: isIntroVisible ? "flex" : "none",
            }}
            className="flex-col items-center text-center space-y-4 max-w-lg select-none pointer-events-none px-4"
          >
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-[#c8a87c]/30 text-[11px] font-mono tracking-wider text-[#dfc9a0] uppercase shadow-lg animate-pulse">
              <Compass className="size-3.5 text-[#c8a87c]" />
              <span>Rotanızı Belirleyin</span>
            </div>

            <h1
              className="font-heading text-4xl sm:text-6xl font-black uppercase tracking-[0.25em]"
              style={{
                color: "#c8a87c",
                textShadow: "0 4px 30px rgba(0,0,0,0.8), 0 0 20px rgba(200,168,124,0.4)",
              }}
            >
              Rudder
            </h1>

            <p className="text-sm sm:text-base text-slate-300 font-sans tracking-wide leading-relaxed drop-shadow-md">
              Bulut sunucularınızın kontrolü, okyanusun derinliklerinde güvenle dönen dümenin başında.
            </p>
          </div>

          {/* SAHNE 2: Dümene Varış & Lüks Glassmorphism Login Kartı */}
          <GlassLoginCard progress={scrollProgress} />
        </main>

        {/* ── Alt Bar: Scroll Aşağı İpucu Göstergesi ── */}
        <footer className="flex flex-col items-center justify-center w-full select-none">
          {isIntroVisible && (
            <div
              style={{ opacity: introOpacity }}
              className="flex flex-col items-center gap-2 pointer-events-auto cursor-pointer animate-bounce"
              onClick={handleSkipToLogin}
            >
              <span className="text-[11px] tracking-[0.2em] font-mono uppercase text-[#dfc9a0]/80">
                Dümeni Keşfetmek İçin Kaydırın
              </span>
              <div className="size-8 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center text-[#c8a87c] shadow-lg">
                <ChevronDown className="size-4" />
              </div>
            </div>
          )}

          {/* İlerleme Çubuğu (Minimal Alt Çizgi) */}
          <div className="w-48 h-1 rounded-full bg-white/10 overflow-hidden mt-3 backdrop-blur-xs">
            <div
              className="h-full bg-gradient-to-r from-[#c8a87c] to-[#38bdf8] transition-all duration-75"
              style={{ width: `${Math.round(scrollProgress * 100)}%` }}
            />
          </div>
        </footer>
      </div>
    </div>
  )
}