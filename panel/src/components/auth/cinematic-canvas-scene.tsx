"use client"

import { useEffect, useRef, useState } from "react"

interface CinematicCanvasSceneProps {
  onProgress?: (progress: number) => void
}

interface Star {
  x: number
  y: number
  z: number // Derinlik katmanı (0.2: uzak/soluk, 1.0: yakın/parlak)
  baseSize: number
  twinkleSpeed: number
  twinklePhase: number
}

interface MistParticle {
  x: number
  y: number
  radius: number
  opacity: number
  vx: number
  vy: number
  phase: number
}

interface VortexParticle {
  angle: number
  distance: number
  speed: number
  size: number
  color: string
  alpha: number
  zOffset: number
}

export function CinematicCanvasScene({ onProgress }: CinematicCanvasSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const helmImgRef = useRef<HTMLImageElement | null>(null)

  // Scroll & Lerp Motoru Değişkenleri
  const progressRef = useRef(0)
  const targetProgressRef = useRef(0)
  const animFrameRef = useRef<number | null>(null)

  // ═══ 1. LOGO DÜMEN RESMİNİ ÖN YÜKLE ═══
  useEffect(() => {
    const img = new Image()
    img.src = "/rudder-helm-transparent.png"
    img.onload = () => {
      helmImgRef.current = img
    }
  }, [])

  // ═══ 2. PENCERE SCROLL DİNLENMESİ ═══
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

    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  // ═══ 3. ANA 60/120 FPS KANVAS ÇİZİM VE FİZİK MOTORU ═══
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // ── A. Yıldızlar (450 adet, 3 derinlik katmanı) ──
    const stars: Star[] = []
    // ── B. Volumetrik Sis & Duman Partikülleri (35 adet yumuşak küre) ──
    const mistParticles: MistParticle[] = []
    // ── C. Kasırga (Vortex) Spiral Partikülleri (220 adet) ──
    const vortexParticles: VortexParticle[] = []

    const initEntities = (w: number, h: number) => {
      // Yıldızlar
      stars.length = 0
      for (let i = 0; i < 480; i++) {
        const z = Math.random() * 0.8 + 0.2
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          z,
          baseSize: (Math.random() * 1.5 + 0.5) * z,
          twinkleSpeed: Math.random() * 3 + 1,
          twinklePhase: Math.random() * Math.PI * 2,
        })
      }

      // Sis / Duman Partikülleri
      mistParticles.length = 0
      for (let i = 0; i < 40; i++) {
        mistParticles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          radius: Math.random() * 220 + 140,
          opacity: Math.random() * 0.12 + 0.04,
          vx: (Math.random() - 0.5) * 0.25,
          vy: -Math.random() * 0.15 - 0.05,
          phase: Math.random() * Math.PI * 2,
        })
      }

      // Kasırga / Girdap Partikülleri
      vortexParticles.length = 0
      const colors = ["#c8a87c", "#dfc9a0", "#38bdf8", "#7dd3fc", "#ffffff"]
      for (let i = 0; i < 220; i++) {
        vortexParticles.push({
          angle: Math.random() * Math.PI * 2,
          distance: Math.random() * Math.min(w, h) * 0.55 + 30,
          speed: Math.random() * 0.035 + 0.015,
          size: Math.random() * 3.2 + 1,
          color: colors[Math.floor(Math.random() * colors.length)],
          alpha: Math.random() * 0.8 + 0.2,
          zOffset: (Math.random() - 0.5) * 60,
        })
      }
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(window.innerWidth * dpr)
      canvas.height = Math.round(window.innerHeight * dpr)
      initEntities(canvas.width, canvas.height)
    }

    resize()
    window.addEventListener("resize", resize)

    let lastTime = performance.now()
    let globalTime = 0

    const renderLoop = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000))
      lastTime = now
      globalTime += dt

      // ── Delta-Time Yaylanma (60Hz / 120Hz / 144Hz Senkronize) ──
      const diff = targetProgressRef.current - progressRef.current
      if (Math.abs(diff) > 0.0001) {
        const damping = 1 - Math.exp(-dt * 3.8)
        progressRef.current += diff * damping
      } else {
        progressRef.current = targetProgressRef.current
      }

      const p = progressRef.current
      if (onProgress) {
        onProgress(p)
      }

      const w = canvas.width
      const h = canvas.height

      ctx.clearRect(0, 0, w, h)

      // ════════════════════════════════════════════════════════════
      // 1. GÖKYÜZÜ ARKA PLAN GRADYANI (Zifiri Gece -> Gece Mavisi Okyanus)
      // ════════════════════════════════════════════════════════════
      const bgGrad = ctx.createLinearGradient(0, 0, 0, h)
      if (p < 0.4) {
        // Uzay & Yıldızlı Gece
        bgGrad.addColorStop(0, "#010309")
        bgGrad.addColorStop(0.5, "#030816")
        bgGrad.addColorStop(1, "#071126")
      } else {
        // Okyanusa Yaklaşırken
        const okyanusFactor = Math.min(1, (p - 0.4) / 0.4)
        bgGrad.addColorStop(0, "#02040a")
        bgGrad.addColorStop(0.45, `rgba(4, 12, 30, ${1})`)
        bgGrad.addColorStop(1, `rgba(2, 6, 18, ${1})`)
      }
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, w, h)

      // ════════════════════════════════════════════════════════════
      // 2. KRİSTAL YILDIZLAR (Parallax & Twinkle)
      // ════════════════════════════════════════════════════════════
      // Scroll ilerledikçe yıldızlar kameranın yanından yukarı uçar (uzay dalışı)
      const starFade = Math.max(0, 1 - p * 1.6)
      if (starFade > 0) {
        for (const s of stars) {
          const twinkle =
            0.6 + 0.4 * Math.sin(globalTime * s.twinkleSpeed + s.twinklePhase)
          const currentY = (s.y - p * h * s.z * 1.8) % h
          const finalY = currentY < 0 ? currentY + h : currentY

          ctx.beginPath()
          ctx.arc(s.x, finalY, s.baseSize * twinkle, 0, Math.PI * 2)

          // Yıldız rengi (Mavi-Beyaz ve Altın ışıltılar)
          const alpha = s.z * twinkle * starFade
          if (s.z > 0.7) {
            ctx.fillStyle = `rgba(223, 201, 160, ${alpha})`
            ctx.shadowColor = "rgba(200, 168, 124, 0.6)"
            ctx.shadowBlur = 4
          } else {
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
            ctx.shadowBlur = 0
          }
          ctx.fill()
        }
        ctx.shadowBlur = 0
      }

      // ════════════════════════════════════════════════════════════
      // 3. ORGANİK SİS VE DUMAN KATMANI (Volumetric Mist)
      // ════════════════════════════════════════════════════════════
      // Sahne 1'de sol tarafta yoğunlaşır, Sahne 2'de aşağı inerken içinden geçilir
      const mistIntensity = p < 0.6 ? 1 : Math.max(0, 1 - (p - 0.6) / 0.3)
      if (mistIntensity > 0) {
        for (const m of mistParticles) {
          m.x += m.vx
          m.y += m.vy
          if (m.x < -m.radius) m.x = w + m.radius
          if (m.x > w + m.radius) m.x = -m.radius
          if (m.y < -m.radius) m.y = h + m.radius
          if (m.y > h + m.radius) m.y = -m.radius

          const mistGrad = ctx.createRadialGradient(
            m.x,
            m.y,
            0,
            m.x,
            m.y,
            m.radius
          )
          const pulse = 1 + Math.sin(globalTime * 0.8 + m.phase) * 0.15
          mistGrad.addColorStop(
            0,
            `rgba(20, 35, 65, ${m.opacity * pulse * mistIntensity})`
          )
          mistGrad.addColorStop(
            0.5,
            `rgba(10, 20, 42, ${m.opacity * 0.5 * pulse * mistIntensity})`
          )
          mistGrad.addColorStop(1, "rgba(0, 0, 0, 0)")

          ctx.fillStyle = mistGrad
          ctx.beginPath()
          ctx.arc(m.x, m.y, m.radius * pulse, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // ════════════════════════════════════════════════════════════
      // 4. GECE OKYANUSU VE DALGALAR (p >= 0.25 iken ufuktan yükselir)
      // ════════════════════════════════════════════════════════════
      if (p > 0.25) {
        const oceanProgress = Math.min(1, (p - 0.25) / 0.45) // 0 -> 1
        const horizonY = h * (1 - oceanProgress * 0.55) // Ufuk yukarı çıkar

        // Dalga Katmanı 1 (Derin dip akıntısı)
        ctx.fillStyle = "rgba(4, 14, 34, 0.75)"
        ctx.beginPath()
        ctx.moveTo(0, h)
        for (let x = 0; x <= w; x += 30) {
          const y =
            horizonY +
            Math.sin(x * 0.005 + globalTime * 1.2) * 14 +
            Math.cos(x * 0.01 - globalTime * 0.8) * 8
          ctx.lineTo(x, y)
        }
        ctx.lineTo(w, h)
        ctx.closePath()
        ctx.fill()

        // Dalga Katmanı 2 (Orta yüzey dalgaları & ay ışığı parıltısı)
        const waveGrad = ctx.createLinearGradient(0, horizonY, 0, h)
        waveGrad.addColorStop(0, "rgba(12, 32, 70, 0.85)")
        waveGrad.addColorStop(0.3, "rgba(7, 18, 42, 0.95)")
        waveGrad.addColorStop(1, "#020612")

        ctx.fillStyle = waveGrad
        ctx.beginPath()
        ctx.moveTo(0, h)
        for (let x = 0; x <= w; x += 20) {
          const y =
            horizonY +
            25 +
            Math.sin(x * 0.008 + globalTime * 1.6) * 16 +
            Math.cos(x * 0.015 - globalTime * 1.1) * 10
          ctx.lineTo(x, y)
        }
        ctx.lineTo(w, h)
        ctx.closePath()
        ctx.fill()

        // Ay Işığı / Su Köpüğü Çizgisi
        ctx.strokeStyle = "rgba(56, 189, 248, 0.35)"
        ctx.lineWidth = 2.5
        ctx.shadowColor = "#38bdf8"
        ctx.shadowBlur = 12
        ctx.beginPath()
        for (let x = 0; x <= w; x += 35) {
          const y =
            horizonY +
            30 +
            Math.sin(x * 0.008 + globalTime * 1.6) * 16 +
            Math.cos(x * 0.015 - globalTime * 1.1) * 10
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
        ctx.shadowBlur = 0
      }

      // ════════════════════════════════════════════════════════════
      // 5. RUDDER LOGO DÜMENİ (p >= 0.55 iken yükselir ve hızla döner)
      // ════════════════════════════════════════════════════════════
      const cx = w / 2
      const cy = h / 2

      if (p > 0.52) {
        const helmFactor = Math.min(1, (p - 0.52) / 0.32) // 0 -> 1
        const helmScale = (0.25 + helmFactor * 0.85) * (w < 800 ? 0.7 : 1)
        const helmOpacity = Math.min(1, helmFactor * 1.4)
        // Dönüş hızı: Dümen hızlanarak döner (kasırgayı tetikler)
        const rotationAngle =
          Math.pow(helmFactor, 1.6) * Math.PI * 5 + globalTime * 0.35

        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(rotationAngle)
        ctx.scale(helmScale, helmScale)
        ctx.globalAlpha = helmOpacity

        // Dümen Arkası Altın / Safir Işıma Halesi
        const auraGrad = ctx.createRadialGradient(0, 0, 30, 0, 0, 240)
        auraGrad.addColorStop(0, "rgba(200, 168, 124, 0.4)")
        auraGrad.addColorStop(0.5, "rgba(56, 189, 248, 0.25)")
        auraGrad.addColorStop(1, "rgba(0, 0, 0, 0)")
        ctx.fillStyle = auraGrad
        ctx.beginPath()
        ctx.arc(0, 0, 240, 0, Math.PI * 2)
        ctx.fill()

        // Rudder Logosu Amblem Resmi (Varsa yüksek kalite basılır)
        if (helmImgRef.current && helmImgRef.current.complete) {
          const imgSize = 340
          ctx.drawImage(
            helmImgRef.current,
            -imgSize / 2,
            -imgSize / 2,
            imgSize,
            imgSize
          )
        }

        ctx.restore()
        ctx.globalAlpha = 1.0
      }

      // ════════════════════════════════════════════════════════════
      // 6. KASIRGA / VORTEX GİRDAP EFEKTİ (p >= 0.70 iken patlak verir)
      // ════════════════════════════════════════════════════════════
      if (p > 0.68) {
        const vortexFactor = Math.min(1, (p - 0.68) / 0.28) // 0 -> 1
        const vortexSpeedMultiplier = 1 + vortexFactor * 3.5

        for (const vp of vortexParticles) {
          // Partikül açısını döndür (girdap)
          vp.angle += vp.speed * vortexSpeedMultiplier

          // İçe doğru çekilme ve spiral yayılma
          const spiralDist =
            vp.distance * (0.4 + 0.6 * (1 - Math.pow(vortexFactor, 1.2) * 0.4))
          const px = cx + Math.cos(vp.angle) * spiralDist
          const py = cy + Math.sin(vp.angle) * spiralDist + vp.zOffset

          const alpha = vp.alpha * vortexFactor
          if (alpha <= 0.01) continue

          ctx.beginPath()
          ctx.arc(px, py, vp.size * (0.8 + vortexFactor * 0.4), 0, Math.PI * 2)
          ctx.fillStyle = vp.color
          ctx.globalAlpha = alpha
          ctx.shadowColor = vp.color
          ctx.shadowBlur = 8
          ctx.fill()

          // Kasırga Rüzgar Kuyruğu (Motion Trail)
          const tailX = cx + Math.cos(vp.angle - 0.18) * (spiralDist * 1.04)
          const tailY = cy + Math.sin(vp.angle - 0.18) * (spiralDist * 1.04)
          ctx.beginPath()
          ctx.moveTo(px, py)
          ctx.lineTo(tailX, tailY)
          ctx.strokeStyle = vp.color
          ctx.lineWidth = vp.size * 0.6
          ctx.stroke()
        }

        ctx.shadowBlur = 0
        ctx.globalAlpha = 1.0
      }

      animFrameRef.current = requestAnimationFrame(renderLoop)
    }

    animFrameRef.current = requestAnimationFrame(renderLoop)

    return () => {
      window.removeEventListener("resize", resize)
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [onProgress])

  return (
    <div className="fixed inset-0 w-full h-full pointer-events-none z-0 overflow-hidden bg-black select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block w-full h-full"
        style={{
          imageRendering: "-webkit-optimize-contrast",
        }}
      />
    </div>
  )
}
