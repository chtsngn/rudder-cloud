"use client"

import { useEffect, useRef, useState } from "react"

interface VideoScrollEngineProps {
  src?: string
  onProgress?: (progress: number) => void
}

export function VideoScrollEngine({
  src = "/media/rudder-intro.mp4",
  onProgress,
}: VideoScrollEngineProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [videoLoaded, setVideoLoaded] = useState(false)
  const [videoError, setVideoError] = useState(false)
  const [duration, setDuration] = useState(0)

  // Hedef ve mevcut scroll ilerleme oranları (0 ile 1 arası)
  const progressRef = useRef(0)
  const targetProgressRef = useRef(0)
  const animFrameRef = useRef<number | null>(null)

  // ═══ 1. VİDEO YÜKLENME & SÜRE TESPİTİ ═══
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    setVideoLoaded(false)
    setVideoError(false)

    const handleLoaded = () => {
      if (video.duration && !isNaN(video.duration)) {
        setDuration(video.duration)
        setVideoLoaded(true)
        setVideoError(false)
        video.currentTime = 0
      }
    }

    const handleError = () => {
      // Video henüz /media dizinine konulmadıysa canvas tabanlı simülasyona geç
      setVideoError(true)
      setVideoLoaded(false)
    }

    video.addEventListener("loadedmetadata", handleLoaded)
    video.addEventListener("canplaythrough", handleLoaded)
    video.addEventListener("error", handleError)

    // Önbellekten gelme durumu
    if (video.readyState >= 1 && video.duration) {
      handleLoaded()
    }

    return () => {
      video.removeEventListener("loadedmetadata", handleLoaded)
      video.removeEventListener("canplaythrough", handleLoaded)
      video.removeEventListener("error", handleError)
    }
  }, [src])

  // ═══ 2. PENCERE SCROLL DİNLEYİCİSİ & LERP MOTORU ═══
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY || window.pageYOffset || 0
      const maxScroll = Math.max(
        1,
        document.documentElement.scrollHeight - window.innerHeight
      )
      const rawProgress = Math.min(1, Math.max(0, scrollY / maxScroll))
      targetProgressRef.current = rawProgress
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    handleScroll()

    // 60FPS Akıcı Yumuşatma (Linear Interpolation - LERP)
    const updateLoop = () => {
      const diff = targetProgressRef.current - progressRef.current
      if (Math.abs(diff) > 0.0005) {
        progressRef.current += diff * 0.12 // Yumuşak sönümleme katsayısı
      } else {
        progressRef.current = targetProgressRef.current
      }

      const p = progressRef.current
      if (onProgress) {
        onProgress(p)
      }

      // Video varsa ve süre biliniyorsa currentTime'ı güncelle
      if (videoRef.current && duration > 0 && !videoError) {
        const targetTime = p * duration
        if (Math.abs(videoRef.current.currentTime - targetTime) > 0.02) {
          videoRef.current.currentTime = targetTime
        }
      }

      animFrameRef.current = requestAnimationFrame(updateLoop)
    }

    animFrameRef.current = requestAnimationFrame(updateLoop)

    return () => {
      window.removeEventListener("scroll", handleScroll)
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [duration, videoError, onProgress])

  // ═══ 3. YEDEK KANVAS SİMÜLATÖRÜ (Video Henüz Klasöre Konulmadıysa) ═══
  useEffect(() => {
    if (videoLoaded && !videoError) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let simAnimId: number

    // Yıldızlar
    const stars: Array<{ x: number; y: number; r: number; alpha: number; speed: number }> = []
    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      stars.length = 0
      for (let i = 0; i < 180; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          r: Math.random() * 1.8 + 0.4,
          alpha: Math.random() * 0.8 + 0.2,
          speed: Math.random() * 0.02 + 0.005,
        })
      }
    }
    resize()
    window.addEventListener("resize", resize)

    let t = 0
    const renderSim = () => {
      t += 0.02
      const p = progressRef.current // 0 (gökyüzü) -> 1 (dümen)
      const w = canvas.width
      const h = canvas.height

      ctx.clearRect(0, 0, w, h)

      // Gökyüzünden Okyanusa Geçiş Gradyanı
      // p = 0 iken derin gece göğü, p = 1 iken derin gece okyanusu
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h)
      if (p < 0.5) {
        // Gökyüzü modu
        skyGrad.addColorStop(0, "#020409")
        skyGrad.addColorStop(0.6, "#060d1f")
        skyGrad.addColorStop(1, "#0d1a38")
      } else {
        // Gemi & Dümen modu
        skyGrad.addColorStop(0, "#030712")
        skyGrad.addColorStop(0.5, "#081026")
        skyGrad.addColorStop(1, "#040817")
      }
      ctx.fillStyle = skyGrad
      ctx.fillRect(0, 0, w, h)

      // Yıldızlar (Aşağı kaydıkça yukarı doğru uçar ve kaybolur)
      const starFade = Math.max(0, 1 - p * 1.5)
      if (starFade > 0) {
        for (const s of stars) {
          const curY = (s.y - p * h * 1.2) % h
          const finalY = curY < 0 ? curY + h : curY
          ctx.beginPath()
          ctx.arc(s.x, finalY, s.r, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(223, 201, 160, ${s.alpha * starFade})`
          ctx.fill()
        }
      }

      // Okyanus Dalgaları (p > 0.2 iken ufukta belirir)
      if (p > 0.15) {
        const waveAlpha = Math.min(1, (p - 0.15) / 0.3)
        const horizonY = h * (0.85 - p * 0.25)
        ctx.fillStyle = `rgba(11, 23, 57, ${waveAlpha * 0.7})`
        ctx.beginPath()
        ctx.moveTo(0, h)
        for (let x = 0; x <= w; x += 20) {
          const waveY = horizonY + Math.sin(x * 0.01 + t) * 8 + Math.cos(x * 0.02 - t) * 5
          ctx.lineTo(x, waveY)
        }
        ctx.lineTo(w, h)
        ctx.closePath()
        ctx.fill()
      }

      // 3D Dönen Dümen Hologramı (p > 0.45 iken yaklaşır ve döner)
      if (p > 0.4) {
        const helmProgress = Math.min(1, (p - 0.4) / 0.5) // 0 -> 1
        const helmScale = 0.4 + helmProgress * 0.75
        const helmAlpha = Math.min(0.95, helmProgress * 1.2)
        const rotationAngle = helmProgress * Math.PI * 2.5 + t * 0.1

        const cx = w / 2
        const cy = h / 2 - (1 - helmProgress) * 50

        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(rotationAngle)
        ctx.scale(helmScale, helmScale)

        // Dümen Dış Çemberi (Altın / Safir Işıltılı)
        const radius = Math.min(w, h) * 0.28
        ctx.strokeStyle = `rgba(200, 168, 124, ${helmAlpha})`
        ctx.lineWidth = 10
        ctx.shadowColor = "rgba(223, 201, 160, 0.45)"
        ctx.shadowBlur = 24
        ctx.beginPath()
        ctx.arc(0, 0, radius, 0, Math.PI * 2)
        ctx.stroke()

        // İç Çember
        ctx.lineWidth = 6
        ctx.strokeStyle = `rgba(56, 189, 248, ${helmAlpha * 0.8})`
        ctx.shadowColor = "rgba(56, 189, 248, 0.5)"
        ctx.beginPath()
        ctx.arc(0, 0, radius * 0.55, 0, Math.PI * 2)
        ctx.stroke()

        // Göbek (Hub)
        ctx.fillStyle = `rgba(88, 6, 25, ${helmAlpha})`
        ctx.beginPath()
        ctx.arc(0, 0, radius * 0.22, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()

        // Dümen Kolları (8 Spoke)
        ctx.shadowBlur = 12
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4
          const cos = Math.cos(angle)
          const sin = Math.sin(angle)

          ctx.strokeStyle = `rgba(200, 168, 124, ${helmAlpha})`
          ctx.lineWidth = 6
          ctx.beginPath()
          ctx.moveTo(cos * (radius * 0.2), sin * (radius * 0.2))
          ctx.lineTo(cos * (radius * 1.2), sin * (radius * 1.2))
          ctx.stroke()

          // Kol Tutamaçları (Handles)
          ctx.fillStyle = `rgba(223, 201, 160, ${helmAlpha})`
          ctx.beginPath()
          ctx.arc(cos * (radius * 1.2), sin * (radius * 1.2), 6, 0, Math.PI * 2)
          ctx.fill()
        }

        ctx.restore()
      }

      simAnimId = requestAnimationFrame(renderSim)
    }

    simAnimId = requestAnimationFrame(renderSim)

    return () => {
      window.removeEventListener("resize", resize)
      cancelAnimationFrame(simAnimId)
    }
  }, [videoLoaded, videoError])

  return (
    <div className="fixed inset-0 w-full h-full pointer-events-none z-0 overflow-hidden bg-black select-none">
      {/* 1. Donanım Hızlandırmalı Video Katmanı */}
      <video
        ref={videoRef}
        src={src}
        muted
        playsInline
        preload="auto"
        className={`w-full h-full object-cover transition-opacity duration-700 ${
          videoLoaded && !videoError ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* 2. Yedek Simülasyon Kanvası (Video dosyası henüz eklenmemişse devreye girer) */}
      {(!videoLoaded || videoError) && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover animate-in fade-in duration-500"
        />
      )}

      {/* 3. Sinematik Işık & Vinyet Katmanı (Karanlık derinlik) */}
      <div className="absolute inset-0 bg-radial-[ellipse_at_center,_rgba(0,0,0,0.1)_0%,_rgba(0,0,0,0.65)_85%,_rgba(0,0,0,0.92)_100%] pointer-events-none" />

      {/* 4. İnce Altın/Mavi Atmosferik Sis */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/60 pointer-events-none" />
    </div>
  )
}
