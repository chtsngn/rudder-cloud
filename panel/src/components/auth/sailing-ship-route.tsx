"use client"

import { useEffect, useRef } from "react"

interface RippleRing {
  x: number
  y: number
  startTime: number
  duration: number
  maxRadius: number
}

// Module-level eager image preload for instant frame 0 rendering
let cachedShipImg: HTMLImageElement | null = null
if (typeof window !== "undefined") {
  cachedShipImg = new Image()
  cachedShipImg.src = "/sailing-ship-real.png"
}

export function SailingShipRoute() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pathRef = useRef<SVGPathElement>(null)

  // 〰️ AÇIK, UZUN VE SOLA KAYDIRILMIŞ SEYİR ROTASI (Genişlik 740px, Yükseklik 260px)
  const routePath =
    "M 30,165 C 180,95 330,215 480,130 C 580,85 640,140 700,110"

  useEffect(() => {
    const canvas = canvasRef.current
    const path = pathRef.current
    if (!canvas || !path) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Ensure image is loading / loaded
    if (!cachedShipImg) {
      cachedShipImg = new Image()
      cachedShipImg.src = "/sailing-ship-real.png"
    }

    const totalLength = path.getTotalLength()
    if (totalLength <= 0) return

    // Retina / High-DPI scaling
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const baseW = 740
    const baseH = 260
    canvas.width = Math.round(baseW * dpr)
    canvas.height = Math.round(baseH * dpr)
    ctx.scale(dpr, dpr)

    let animFrame: number
    let progress = 0.5 // Rotanın tam ortasından anında başlar
    let lastRippleTime = 0
    const ripples: RippleRing[] = []

    // Helper: Elegant fallback silhouette in case image decode takes even 1 frame
    const drawSilhouette = (c: CanvasRenderingContext2D) => {
      c.fillStyle = "rgba(186, 230, 253, 0.75)"
      // Gövde
      c.beginPath()
      c.moveTo(-35, 18)
      c.quadraticCurveTo(0, 30, 42, 14)
      c.quadraticCurveTo(32, 26, 0, 27)
      c.quadraticCurveTo(-22, 25, -35, 18)
      c.fill()
      // Ana Yelken
      c.fillStyle = "rgba(226, 232, 240, 0.85)"
      c.beginPath()
      c.moveTo(-5, 12)
      c.quadraticCurveTo(18, -14, 2, -34)
      c.quadraticCurveTo(-14, -10, -5, 12)
      c.fill()
      // Ön Yelken
      c.beginPath()
      c.moveTo(8, 10)
      c.quadraticCurveTo(26, -6, 20, -25)
      c.quadraticCurveTo(6, -7, 8, 10)
      c.fill()
    }

    const render = (time: number) => {
      // Ağırbaşlı ve stabilize seyir hızı
      progress += 0.00052
      if (progress > 1.06) {
        progress = -0.06
      }

      const clampedProg = Math.max(0, Math.min(1, progress))
      const currentDist = clampedProg * totalLength
      const pt = path.getPointAtLength(currentDist)

      // Teğet açısını stabilize hesapla (+8px ileri bakış)
      const aheadDist = Math.min(totalLength, currentDist + 8)
      const ptAhead = path.getPointAtLength(aheadDist)
      const rawAngle =
        Math.atan2(ptAhead.y - pt.y, ptAhead.x - pt.x) * (180 / Math.PI)

      // Geminin hafif doğal su salınımı
      const bobbing = Math.sin(time * 0.002) * 2.2

      // Saydamlık
      let opacity = 1
      if (progress < 0) {
        opacity = 0
      } else if (progress > 0.94) {
        opacity = Math.max(0, (1 - progress) / 0.06)
      }

      // 💧 Eşmerkezli su dalgası üretimi
      if (opacity > 0.15 && time - lastRippleTime > 300) {
        lastRippleTime = time
        ripples.push(
          {
            x: pt.x - 5,
            y: pt.y + 40,
            startTime: time,
            duration: 1800,
            maxRadius: 60,
          },
          {
            x: pt.x - 5,
            y: pt.y + 40,
            startTime: time + 100,
            duration: 1500,
            maxRadius: 40,
          }
        )
      }

      // ── ÇİZİM ──
      ctx.clearRect(0, 0, baseW, baseH)

      // 1. Dalga Halkaları Çizimi
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i]
        const age = (time - r.startTime) / r.duration
        if (age >= 1) {
          ripples.splice(i, 1)
          continue
        }
        if (age <= 0) continue

        const radiusX = 6 + age * r.maxRadius
        const radiusY = radiusX * 0.28
        const rOpacity = Math.sin(age * Math.PI) * (1 - age * 0.6) * 0.65

        ctx.beginPath()
        ctx.ellipse(r.x, r.y, radiusX, radiusY, 0, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(186, 230, 253, ${rOpacity * 0.75})`
        ctx.lineWidth = Math.max(0.6, 1.4 * (1 - age * 0.6))
        ctx.stroke()
      }

      // 2. Gemi Çizimi
      if (opacity > 0) {
        const shipY = pt.y + Math.cos(time * 0.002) * 2.5
        const shipAngle = (rawAngle * 0.12 + bobbing) * (Math.PI / 180)

        ctx.save()
        ctx.translate(pt.x, shipY)
        ctx.rotate(shipAngle)
        ctx.globalAlpha = opacity * 0.78

        // Su yüzeyinde hafif ay ışığı yansıması
        ctx.beginPath()
        ctx.ellipse(0, 42, 52, 8, 0, 0, Math.PI * 2)
        ctx.fillStyle = "rgba(56, 189, 248, 0.12)"
        ctx.fill()

        // Gemi Görseli veya Fallback Silüet
        if (
          cachedShipImg &&
          cachedShipImg.complete &&
          cachedShipImg.naturalWidth > 0
        ) {
          ctx.drawImage(cachedShipImg, -70, -70, 140, 140)
        } else {
          drawSilhouette(ctx)
        }

        ctx.restore()
      }

      animFrame = requestAnimationFrame(render)
    }

    // İlk kareyi beklemeden anında çiz (0 ms delay)
    render(performance.now())

    return () => {
      cancelAnimationFrame(animFrame)
    }
  }, [])

  return (
    <div className="relative w-full max-w-[540px] lg:max-w-[680px] h-[280px] pointer-events-none select-none overflow-visible">
      {/* 1. Statik Kesik Kesik Rota Çizgisi (Native SVG, sıfır CPU maliyeti) */}
      <svg
        viewBox="0 0 740 260"
        className="absolute inset-0 w-full h-full overflow-visible pointer-events-none"
      >
        <defs>
          <filter id="routeSoftGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        <path
          ref={pathRef}
          d={routePath}
          fill="none"
          stroke="rgba(148, 163, 184, 0.24)"
          strokeWidth="1.2"
          strokeDasharray="6 10"
          filter="url(#routeSoftGlow)"
        />
      </svg>

      {/* 2. Donanım Hızlandırmalı Akıcı Kanvas (Dalgalar + Yelkenli Gemi, 0 React re-render) */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{
          imageRendering: "-webkit-optimize-contrast",
        }}
      />
    </div>
  )
}
