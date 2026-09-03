"use client"

import { useState, useCallback } from "react"
import Image from "next/image"
import { ChevronDown, Compass, FastForward } from "lucide-react"
import { useTranslation } from "@/components/language-provider"
import { CinematicCanvasScene } from "@/components/auth/cinematic-canvas-scene"
import { GlassLoginCard } from "@/components/auth/glass-login-card"
import { SailingShipRoute } from "@/components/auth/sailing-ship-route"

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

  // 1. Sahne (Yıldızlı Gece & Solda Puslu Gri Rudder Yazısı) opaklığı
  const introOpacity = Math.max(0, 1 - scrollProgress * 2.8)
  const isIntroVisible = introOpacity > 0.02

  return (
    <div className="relative min-h-[850vh] bg-black selection:bg-slate-700/40 selection:text-white">
      {/* ═══ 1. SİNEMATİK KANVAS (YILDIZLAR, BULUT DALIŞI, DÜMEN, GERÇEKÇİ KASIRGA) ═══ */}
      <CinematicCanvasScene onProgress={handleProgress} />

      {/* ═══ 2. SABİT GÖRÜNÜM ALANI (FIXED VIEWPORT) ═══ */}
      <div className="fixed inset-0 z-20 flex flex-col justify-between p-5 md:p-10 pointer-events-none">
        {/* ── Üst Bar (Header Bar) ── */}
        <header className="flex items-center justify-between w-full pointer-events-auto">
          {/* Sol: SADECE LOGO (Rudder yazısı olmadan) */}
          <div className="flex items-center justify-center p-2 rounded-2xl bg-black/40 backdrop-blur-md border border-slate-700/50 shadow-lg">
            <Image
              src="/rudder-helm-transparent.png"
              alt="Rudder"
              width={26}
              height={26}
              className="object-contain"
            />
          </div>

          {/* Sağ: Dil Seçici & Hızlı Giriş Butonu */}
          <div className="flex items-center gap-2.5">
            {/* Hızlı Giriş Butonu */}
            {scrollProgress < 0.7 && (
              <button
                type="button"
                onClick={handleSkipToLogin}
                className="group flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-950/60 backdrop-blur-md border border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-400/80 text-xs font-semibold shadow-lg transition-all cursor-pointer hover:scale-105 active:scale-95"
              >
                <FastForward className="size-3.5 text-slate-300 transition-transform group-hover:translate-x-0.5" />
                <span className="hidden sm:inline">Hızlı Giriş</span>
              </button>
            )}

            {/* Dil Seçici */}
            <div className="flex items-center gap-1 bg-slate-950/60 backdrop-blur-md p-1 rounded-xl border border-slate-700/60 shadow-lg">
              <button
                type="button"
                onClick={() => setLang("tr")}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                  lang === "tr"
                    ? "bg-slate-200 text-slate-950 shadow-sm font-bold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                TR
              </button>
              <button
                type="button"
                onClick={() => setLang("en")}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                  lang === "en"
                    ? "bg-slate-200 text-slate-950 shadow-sm font-bold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                EN
              </button>
            </div>
          </div>
        </header>

        {/* ── Orta Alan: Solda Sisli Gri Rudder, Sağda Sade Telemetri, Merkezde Login Kartı ── */}
        <main className="flex flex-1 items-center justify-between relative w-full">
          {/* SAHNE 1 SOL: PUSLU GRİ EFEKTLİ GRENZE FONTUYLA RUDDER BAŞLIĞI */}
          <div
            style={{
              opacity: introOpacity,
              transform: `translate3d(0, ${scrollProgress * -70}px, 0)`,
              display: isIntroVisible ? "flex" : "none",
            }}
            className="flex flex-col items-start text-left max-w-xl select-none pointer-events-none pl-2 md:pl-8 space-y-5"
          >
            {/* Sis Rozeti (Puslu Gri & Arduvaz) */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-950/60 backdrop-blur-md border border-slate-700/60 text-[11px] font-mono tracking-wider text-slate-300 uppercase shadow-lg">
              <Compass className="size-3.5 text-slate-400 animate-spin-slow" />
              <span>36°58&apos;N • 28°14&apos;E &bull; Seyir Rotası</span>
            </div>

            {/* Duman ve Sis İçinde Parlayan Puslu Gri Başlık (Grenze Fontu) */}
            <div className="relative">
              {/* Arka Sis Parıltısı */}
              <div className="absolute -inset-8 bg-radial from-slate-400/20 via-slate-600/10 to-transparent blur-3xl pointer-events-none" />

              <h1
                className="font-grenze text-6xl sm:text-8xl font-black uppercase tracking-[0.2em] relative z-10"
                style={{
                  color: "#cbd5e1",
                  textShadow:
                    "0 0 35px rgba(203, 213, 225, 0.45), 0 0 70px rgba(148, 163, 184, 0.25), 0 4px 20px rgba(0, 0, 0, 0.95)",
                }}
              >
                Rudder
              </h1>
            </div>

            <p className="text-sm sm:text-base text-slate-300 font-sans tracking-wide leading-relaxed drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)] max-w-md">
              Bulut sunucularınızın mutlak kontrolü; puslu göklerin derinliklerinde, sislerin arasından doğan dümenin başında.
            </p>

            {/* Sade Version Bilgisi (Fırtına yazısı kaldırıldı) */}
            <div className="flex items-center gap-2 pt-1 text-xs font-mono text-slate-400">
              <span className="size-1.5 rounded-full bg-slate-400/80" />
              <span>v1.1.0</span>
            </div>
          </div>

          {/* SAHNE 1 SAĞ: DOLAŞAN GERÇEKÇİ YELKENLİ GEMİ ROTASI */}
          <div
            style={{
              opacity: introOpacity,
              transform: `translate3d(0, ${scrollProgress * -70}px, 0)`,
              display: isIntroVisible ? "flex" : "none",
            }}
            className="hidden md:flex flex-col items-end text-right select-none pointer-events-none pr-2 md:pr-8"
          >
            <SailingShipRoute />
          </div>

          {/* SAHNE 4: GERÇEKÇİ KASIRGA İÇİNDEN GELEN VE DURAN LÜKS LOGİN KARTI */}
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
              {/* "Dümeni" kaldırıldı, sadece "Keşfetmek İçin Kaydırın" */}
              <span className="text-[11px] tracking-[0.2em] font-mono uppercase text-slate-400">
                Keşfetmek İçin Kaydırın
              </span>
              <div className="size-8 rounded-full bg-slate-950/60 backdrop-blur-md border border-slate-700/60 flex items-center justify-center text-slate-300 shadow-lg">
                <ChevronDown className="size-4" />
              </div>
            </div>
          )}

          {/* İlerleme Çubuğu */}
          <div className="w-48 h-1 rounded-full bg-slate-800/60 overflow-hidden mt-3 backdrop-blur-xs">
            <div
              className="h-full bg-gradient-to-r from-slate-400 via-sky-400 to-slate-200 transition-all duration-75"
              style={{ width: `${Math.round(scrollProgress * 100)}%` }}
            />
          </div>
        </footer>
      </div>
    </div>
  )
}