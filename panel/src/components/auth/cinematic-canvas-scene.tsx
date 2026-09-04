"use client"

import { useEffect, useRef } from "react"

interface CinematicCanvasSceneProps {
  onProgress?: (progress: number) => void
  targetProgress?: number | null
}

interface Star {
  x: number
  y: number
  z: number // 0.2: uzak/soluk, 1.0: yakın/parlak
  baseSize: number
  twinkleSpeed: number
  twinklePhase: number
}

// Sahne 2: Bulutlar arasından dalış partikülleri
interface CloudPuff {
  xRatio: number // 0..1 ekran genişliği oranı
  yRatio: number // 0..1 ekran yüksekliği oranı
  baseRadius: number
  opacity: number
  depth: number // Derinlik katmanı (scroll ile yakınlaşır)
  driftSpeed: number
  phase: number
}

// Sahne 3-4: Gerçekçi Fırtına/Kasırga (Vortex) Sis Spiralleri
interface StormMistBand {
  armAngle: number // Kasırga spiral kolu başlangıç açısı
  radialDist: number // Merkezden uzaklık
  radius: number // Sis küresi boyutu
  opacity: number
  speed: number
  hueType: "mist" | "cyan" | "white"
}

// GPU için önceden rasterize edilmiş yumuşak duman/sis sprite üretici
function createPuffSprite(
  stops: [number, string][],
  size = 128
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null
  const c = document.createElement("canvas")
  c.width = size
  c.height = size
  const ctx = c.getContext("2d")
  if (!ctx) return null
  const half = size / 2
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half)
  for (const [pos, col] of stops) {
    grad.addColorStop(pos, col)
  }
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(half, half, half, 0, Math.PI * 2)
  ctx.fill()
  return c
}

export function CinematicCanvasScene({ onProgress, targetProgress }: CinematicCanvasSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const helmImgRef = useRef<HTMLImageElement | null>(null)

  // Otomatik Süzülüş & İlerleme Değişkenleri
  const progressRef = useRef(0)
  const targetProgressRef = useRef(0)
  const lastReportedProgressRef = useRef(-1)
  const autoGlideRef = useRef(true)
  const startTimeRef = useRef<number | null>(null)
  const animFrameRef = useRef<number | null>(null)

  // ═══ 1. LOGO DÜMEN RESMİ ÖN YÜKLEME ═══
  useEffect(() => {
    const img = new Image()
    img.src = "/rudder-helm-transparent.png"
    img.onload = () => {
      helmImgRef.current = img
    }
  }, [])

  // ═══ 2. DIŞARIDAN BELİRLENEN HEDEF İLERLEME DEĞİŞİKLİĞİ ═══
  useEffect(() => {
    if (typeof targetProgress === "number") {
      autoGlideRef.current = false
      targetProgressRef.current = targetProgress
      // Hızlı geçişte anında hedef değere git
      progressRef.current = targetProgress
    }
  }, [targetProgress])

  // ═══ 3. KANVAS FİZİK & GRAFİK MOTORU (60/120 FPS GPU HIZLANDIRMALI) ═══
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Donanım hızlandırmalı önbellek spriteları (Her karede radial gradient hesaplamasını 0'a indirir)
    const cloudSprite = createPuffSprite([
      [0, "rgba(30, 41, 59, 1.0)"],
      [0.4, "rgba(15, 23, 42, 0.65)"],
      [0.8, "rgba(8, 14, 28, 0.25)"],
      [1.0, "rgba(0, 0, 0, 0)"],
    ], 128)

    const mistSprite = createPuffSprite([
      [0, "rgba(51, 65, 85, 1.0)"],
      [0.5, "rgba(30, 41, 59, 0.55)"],
      [1.0, "rgba(0, 0, 0, 0)"],
    ], 128)

    const cyanSprite = createPuffSprite([
      [0, "rgba(56, 189, 248, 0.95)"],
      [0.5, "rgba(14, 116, 144, 0.45)"],
      [1.0, "rgba(0, 0, 0, 0)"],
    ], 128)

    const whiteSprite = createPuffSprite([
      [0, "rgba(226, 232, 240, 1.0)"],
      [0.6, "rgba(148, 163, 184, 0.5)"],
      [1.0, "rgba(0, 0, 0, 0)"],
    ], 128)

    const auraSprite = createPuffSprite([
      [0, "rgba(56, 189, 248, 0.22)"],
      [0.4, "rgba(148, 163, 184, 0.15)"],
      [1.0, "rgba(0, 0, 0, 0)"],
    ], 256)

    // ── A. Yıldızlar ──
    const stars: Star[] = []
    // ── B. Hacimsel Geçiş Bulutları (Cloud Dive) ──
    const clouds: CloudPuff[] = []
    // ── C. Kasırga Sis Kuşakları (Harbi Girdap/Kasırga) ──
    const stormMist: StormMistBand[] = []
    let cachedBgGrad: CanvasGradient | null = null
    const logicalWRef = { current: 1920 }
    const logicalHRef = { current: 1080 }
    const dprRef = { current: 1 }

    const initEntities = (w: number, h: number) => {
      // 1. Kristal Yıldızlar
      stars.length = 0
      for (let i = 0; i < 450; i++) {
        const z = Math.random() * 0.8 + 0.2
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          z,
          baseSize: (Math.random() * 1.4 + 0.5) * z,
          twinkleSpeed: Math.random() * 2.5 + 1.2,
          twinklePhase: Math.random() * Math.PI * 2,
        })
      }

      // 2. Bulutlar Arasından Dalış (Geçiş Sahnesi İçin Organik Sis Bulutları)
      clouds.length = 0
      for (let i = 0; i < 36; i++) {
        clouds.push({
          xRatio: Math.random(),
          yRatio: Math.random() * 1.2 - 0.1,
          baseRadius: Math.random() * 220 + 160,
          opacity: Math.random() * 0.16 + 0.08,
          depth: Math.random() * 0.8 + 0.2,
          driftSpeed: (Math.random() - 0.5) * 0.12,
          phase: Math.random() * Math.PI * 2,
        })
      }

      // 3. Kasırga / Girdap (Çubuksuz, Organik Dönen Sis & Fırtına Kolları - 90 Partikül)
      stormMist.length = 0
      const arms = 4
      for (let i = 0; i < 90; i++) {
        const armIndex = i % arms
        const baseAngle = (armIndex * (Math.PI * 2)) / arms
        const distRatio = Math.pow(Math.random(), 0.7) // Merkeze doğru yoğunlaşma
        const radialDist = distRatio * (Math.min(w, h) * 0.58) + 25
        const spiralAngle = baseAngle + distRatio * 3.5 + (Math.random() - 0.5) * 0.4

        const typeRand = Math.random()
        const hueType =
          typeRand < 0.65 ? "mist" : typeRand < 0.88 ? "cyan" : "white"

        stormMist.push({
          armAngle: spiralAngle,
          radialDist,
          radius: (Math.random() * 38 + 18) * (0.8 + distRatio * 1.2),
          opacity: Math.random() * 0.18 + 0.08,
          speed: (0.02 + (1 - distRatio) * 0.04),
          hueType,
        })
      }
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      dprRef.current = dpr
      const w = window.innerWidth
      const h = window.innerHeight
      logicalWRef.current = w
      logicalHRef.current = h

      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)

      // Arka plan gradyanını mantıksal CSS pikseli (h) üzerinden tek seferlik önbelleğe al
      cachedBgGrad = ctx.createLinearGradient(0, 0, 0, h)
      cachedBgGrad.addColorStop(0, "#010308")
      cachedBgGrad.addColorStop(0.45, "#030713")
      cachedBgGrad.addColorStop(1, "#02040b")

      initEntities(w, h)
    }

    resize()
    window.addEventListener("resize", resize)

    let lastTime = performance.now()
    let globalTime = 0
    let currentHelmRotation = 0

    const renderLoop = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000))
      lastTime = now
      globalTime += dt

      // ── Otomatik Süzülüş (Giriş yapıldığı an sinematik aşağı akış) ──
      if (autoGlideRef.current) {
        if (startTimeRef.current === null) {
          startTimeRef.current = now
        }
        const elapsed = now - startTimeRef.current
        const INITIAL_PAUSE = 500 // ms: yukarıdaki bekleme 0.2s azaltılarak 0.5s yapıldı
        const DURATION = 2800 // ms: aşağı süzülüş uzatıldı, toplam süre 3.3s

        if (elapsed < INITIAL_PAUSE) {
          targetProgressRef.current = 0
          progressRef.current = 0
        } else {
          const t = Math.min(1, Math.max(0, (elapsed - INITIAL_PAUSE) / DURATION))
          const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
          targetProgressRef.current = eased
          progressRef.current = eased

          if (t >= 1) {
            autoGlideRef.current = false
            targetProgressRef.current = 1
            progressRef.current = 1
          }
        }
      } else {
        const diff = targetProgressRef.current - progressRef.current
        if (Math.abs(diff) > 0.0001) {
          const damping = 1 - Math.exp(-dt * 4.5)
          progressRef.current += diff * damping
        } else {
          progressRef.current = targetProgressRef.current
        }
      }

      const p = progressRef.current
      if (onProgress) {
        // Parent React ağacını 60 FPS gereksiz re-render'a boğmamak için akıllı eşikleme
        if (
          lastReportedProgressRef.current < 0 ||
          Math.abs(p - lastReportedProgressRef.current) >= 0.007 ||
          p === 0 ||
          p === 1
        ) {
          lastReportedProgressRef.current = p
          onProgress(p)
        }
      }

      // Mac Retina (DPR 2) ve standart ekranlar (DPR 1) arasında boyut farkını yok etmek için
      // tüm çizim motorunu CSS piksel koordinatlarına kilitler:
      const dpr = dprRef.current
      const w = logicalWRef.current
      const h = logicalHRef.current
      const cx = w / 2
      const cy = h / 2

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      // ════════════════════════════════════════════════════════════
      // 1. ZİFİRİ DERİN GECE GRADYANI (Önbellekten Hızlı Çizim)
      // ════════════════════════════════════════════════════════════
      if (cachedBgGrad) {
        ctx.fillStyle = cachedBgGrad
        ctx.fillRect(0, 0, w, h)
      }

      // ════════════════════════════════════════════════════════════
      // 2. KRİSTAL YILDIZLAR (CPU Blur Olmadan Doğal Işıltı)
      // ════════════════════════════════════════════════════════════
      const starFade = Math.max(0, 1 - p * 2.2)
      if (starFade > 0) {
        for (const s of stars) {
          const twinkle =
            0.65 + 0.35 * Math.sin(globalTime * s.twinkleSpeed + s.twinklePhase)
          const currentY = (s.y - p * h * s.z * 2.0) % h
          const finalY = currentY < 0 ? currentY + h : currentY
          const alpha = s.z * twinkle * starFade

          if (s.z > 0.8) {
            // Dış yumuşak parlama
            ctx.fillStyle = `rgba(148, 163, 184, ${alpha * 0.35})`
            ctx.beginPath()
            ctx.arc(s.x, finalY, s.baseSize * twinkle * 1.8, 0, Math.PI * 2)
            ctx.fill()

            // Çekirdek yıldız
            ctx.fillStyle = `rgba(241, 245, 249, ${alpha})`
            ctx.beginPath()
            ctx.arc(s.x, finalY, s.baseSize * twinkle, 0, Math.PI * 2)
            ctx.fill()
          } else {
            ctx.fillStyle = `rgba(203, 213, 225, ${alpha * 0.85})`
            ctx.beginPath()
            ctx.arc(s.x, finalY, s.baseSize * twinkle, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }

      // ════════════════════════════════════════════════════════════
      // 3. SAHNE 2: BULUTLAR VE SİSLER ARASINDAN GEÇİŞ (GPU Sprite Blit)
      // ════════════════════════════════════════════════════════════
      if (p > 0.12 && p < 0.82 && cloudSprite) {
        const cloudPeak =
          p < 0.42
            ? (p - 0.12) / 0.3
            : Math.max(0, 1 - (p - 0.42) / 0.38)

        for (const c of clouds) {
          const verticalOffset = (p - 0.12) * h * (1.2 + c.depth * 1.5)
          const spreadOutX = (c.xRatio - 0.5) * (p * w * 0.4)
          const px = c.xRatio * w + spreadOutX + Math.sin(globalTime * 0.4 + c.phase) * 15
          const py = c.yRatio * h + (h * 0.5) - verticalOffset

          const currentRadius = c.baseRadius * (0.9 + (p - 0.12) * 0.8)
          const alpha = c.opacity * cloudPeak
          if (alpha <= 0.005) continue

          ctx.globalAlpha = Math.min(1, Math.max(0, alpha))
          ctx.drawImage(
            cloudSprite,
            px - currentRadius,
            py - currentRadius,
            currentRadius * 2,
            currentRadius * 2
          )
        }
        ctx.globalAlpha = 1.0
      }

      // ════════════════════════════════════════════════════════════
      // 4. SAHNE 3 & 4: RUDDER DÜMENİ (GELİR, DÖNER VE LOGİN KARTINDA DURUR)
      // ════════════════════════════════════════════════════════════
      if (p > 0.45) {
        const helmFactor = Math.min(1, (p - 0.45) / 0.35) // 0 -> 1
        // Kullanıcının orijinal birebir ölçeği: (w < 800 ? 0.72 : 1)
        const helmScale = (0.3 + helmFactor * 0.8) * (w < 800 ? 0.72 : 1.0)
        const helmOpacity = Math.min(1, helmFactor * 1.5)

        let rotSpeed = 0
        if (p < 0.86) {
          rotSpeed = Math.pow(helmFactor, 1.8) * 4.2
          currentHelmRotation += rotSpeed * dt
        } else {
          const settleProgress = Math.min(1, (p - 0.86) / 0.08)
          currentHelmRotation += (0 - (currentHelmRotation % (Math.PI * 2))) * (settleProgress * 0.15)
        }

        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(currentHelmRotation)
        ctx.scale(helmScale, helmScale)
        ctx.globalAlpha = helmOpacity

        // Dümen Arkası Safir ve Gümüş Işıma Halesi (Orijinal 500px)
        if (auraSprite) {
          const auraSize = 500
          ctx.drawImage(auraSprite, -auraSize / 2, -auraSize / 2, auraSize, auraSize)
        }

        // Amblem Dümen Görseli (Kullanıcının ekranındaki orijinal 340px CSS boyutu)
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
      // 5. SAHNE 4: GERÇEKÇİ KASIRGA / VORTEX GİRDABI (GPU Sprite Blit)
      // ════════════════════════════════════════════════════════════
      if (p > 0.58) {
        const vortexFactor = Math.min(1, (p - 0.58) / 0.28) // 0 -> 1
        const isSettled = p >= 0.88
        const stormActivity = isSettled
          ? Math.max(0.12, 1 - (p - 0.88) * 7.0)
          : 1.0

        for (const band of stormMist) {
          band.armAngle += band.speed * vortexFactor * stormActivity

          const px = cx + Math.cos(band.armAngle) * band.radialDist
          const py = cy + Math.sin(band.armAngle) * (band.radialDist * 0.9)

          const alpha = band.opacity * vortexFactor * (isSettled ? 0.35 : 1.0)
          if (alpha <= 0.005) continue

          const sprite =
            band.hueType === "mist"
              ? mistSprite
              : band.hueType === "cyan"
              ? cyanSprite
              : whiteSprite

          if (sprite) {
            ctx.globalAlpha = Math.min(1, Math.max(0, alpha))
            ctx.drawImage(
              sprite,
              px - band.radius,
              py - band.radius,
              band.radius * 2,
              band.radius * 2
            )
          }
        }
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
