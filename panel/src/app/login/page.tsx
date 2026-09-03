"use client"

import { useState, useCallback } from "react"
import Image from "next/image"
import { ChevronDown, Compass, FastForward, Wind } from "lucide-react"
import { useTranslation } from "@/components/language-provider"
import { CinematicCanvasScene } from "@/components/auth/cinematic-canvas-scene"
import { GlassLoginCard } from "@/components/auth/glass-login-card"

export default function LoginPage() {
  const { lang, setLang } = useTranslation()
  const [scrollProgress, setScrollProgress] = useState(0)

  // Scroll ilerlemesi değiştikçe state güncelle
  const handleProgress = useCallback((progress: number) => {
    setScrollProgress(progress)
  }, [])

  // Hızlıca kasırgaya ve login penceresine atla
  const handleSkipToLogin = () => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "smooth",
    })
  }

  // 1. Sahne (Yıldızlı Gece & Solda Sisli Rudder Yazısı) opaklığı
  const introOpacity = Math.max(0, 1 - scrollProgress * 2.8)
  const isIntroVisible = introOpacity > 0.02

  return (
    <div className="relative min-h-[850vh] bg-black selection:bg-[#c8a87c]/30 selection:text-white">
      {/* ═══ 1. SİNEMATİK KANVAS SAHNESİ (YILDIZLAR, SİS, OKYANUS, DÜMEN, KASIRGA) ═══ */}
      <CinematicCanvasScene onProgress={handleProgress} />

      {/* ═══ 2. SABİT GÖRÜNÜM ALANI (FIXED VIEWPORT) ═══ */}
      <div className="fixed inset-0 z-20 flex flex-col justify-between p-5 md:p-10 pointer-events-none">
        {/* ── Üst Bar (Header Bar) ── */}
        <header className="flex items-center justify-between w-full pointer-events-auto">
          {/* Sol: Rudder Minimal Brand */}
          <div className="flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 shadow-lg">
            <Image
              src="/rudder-helm-transparent.png"
              alt="Rudder"
              width={26}
              height={26}
              className="object-contain"
            />
            <span className="font-heading font-black tracking-[0.2em] text-[#c8a87c] text-xs uppercase">
              Rudder
            </span>
          </div>

          {/* Sağ: Dil Seçici & Hızlı Giriş Butonu */}
          <div className="flex items-center gap-2.5">
            {/* Hızlı Giriş Butonu */}
            {scrollProgress < 0.7 && (
              <button
                type="button"
                onClick={handleSkipToLogin}
                className="group flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-black/45 backdrop-blur-md border border-white/15 text-slate-300 hover:text-white hover:border-[#c8a87c]/60 text-xs font-semibold shadow-lg transition-all cursor-pointer hover:scale-105 active:scale-95"
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

        {/* ── Orta Alan: Solda Sisli Rudder Sahnesi & Kasırgadan Çıkan Login Kartı ── */}
        <main className="flex flex-1 items-center justify-between relative w-full">
          {/* SAHNE 1: SOLDA SİSLİ/PUSLU EFEKTLİ RUDDER BAŞLIĞI */}
          <div
            style={{
              opacity: introOpacity,
              transform: `translate3d(0, ${scrollProgress * -70}px, 0)`,
              display: isIntroVisible ? "flex" : "none",
            }}
            className="flex flex-col items-start text-left max-w-xl select-none pointer-events-none pl-2 md:pl-8 space-y-5"
          >
            {/* Sis Rozeti */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-[#c8a87c]/30 text-[11px] font-mono tracking-wider text-[#dfc9a0] uppercase shadow-lg">
              <Compass className="size-3.5 text-[#c8a87c] animate-spin-slow" />
              <span>36°58&apos;N • 28°14&apos;E &bull; Seyir Rotası</span>
            </div>

            {/* Duman ve Sis İçinde Parlayan Başlık */}
            <div className="relative">
              {/* Arka Sis Parıltısı */}
              <div className="absolute -inset-8 bg-radial from-slate-400/20 via-sky-500/10 to-transparent blur-3xl pointer-events-none" />
              
              <h1
                className="font-heading text-5xl sm:text-7xl font-black uppercase tracking-[0.22em] relative z-10"
                style={{
                  color: "#c8a87c",
                  textShadow:
                    "0 0 35px rgba(200, 168, 124, 0.45), 0 0 70px rgba(56, 189, 248, 0.2), 0 4px 20px rgba(0, 0, 0, 0.9)",
                }}
              >
                Rudder
              </h1>
            </div>

            <p className="text-sm sm:text-base text-slate-300 font-sans tracking-wide leading-relaxed drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] max-w-md">
              Bulut sunucularınızın mutlak kontrolü; okyanusun derinliklerinde, sislerin arasından doğan dümenin başında.
            </p>

            <div className="flex items-center gap-3 pt-2 text-xs font-mono text-[#c8a87c]/70">
              <span className="flex items-center gap-1.5">
                <Wind className="size-3.5 text-[#38bdf8]" />
                Kuvvetli Fırtına Uyarısı
              </span>
              <span>&bull;</span>
              <span>v1.1.0</span>
            </div>
          </div>

          {/* SAHNE 4: KASIRGA İÇİNDEN DÖNEREK GELEN LÜKS LOGİN KARTI */}
          <div className="w-full flex items-center justify-center absolute inset-0 pointer-events-none">
            <GlassLoginCard progress={scrollProgress} />
          </div>
        </main>

        {/* ── Alt Bar: Scroll İpucu & İlerleme Çizgisi ── */}
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

          {/* İlerleme Çubuğu */}
          <div className="w-48 h-1 rounded-full bg-white/10 overflow-hidden mt-3 backdrop-blur-xs">
            <div
              className="h-full bg-gradient-to-r from-[#c8a87c] via-[#38bdf8] to-[#580619] transition-all duration-75"
              style={{ width: `${Math.round(scrollProgress * 100)}%` }}
            />
          </div>
        </footer>
      </div>
    </div>
  )
}