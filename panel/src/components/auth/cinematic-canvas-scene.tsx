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

export function CinematicCanvasScene({ onProgress, targetProgress }: CinematicCanvasSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const helmImgRef = useRef<HTMLImageElement | null>(null)

  // Otomatik Süzülüş & İlerleme Değişkenleri
  const progressRef = useRef(0)
  const targetProgressRef = useRef(0)
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

  // ═══ 3. KANVAS FİZİK & GRAFİK MOTORU (60/120 FPS) ═══
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // ── A. Yıldızlar ──
    const stars: Star[] = []
    // ── B. Hacimsel Geçiş Bulutları (Cloud Dive) ──
    const clouds: CloudPuff[] = []
    // ── C. Kasırga Sis Kuşakları (Harbi Girdap/Kasırga) ──
    const stormMist: StormMistBand[] = []

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

      // 3. Kasırga / Girdap (Çubuksuz, Organik Dönen Sis & Fırtına Kolları)
      stormMist.length = 0
      // 4 ana spiral fırtına kolu üzerinde dönen yumuşak sis dumanları
      const arms = 4
      for (let i = 0; i < 180; i++) {
        const armIndex = i % arms
        const baseAngle = (armIndex * (Math.PI * 2)) / arms
        const distRatio = Math.pow(Math.random(), 0.7) // Merkeze doğru yoğunlaşma
        const radialDist = distRatio * (Math.min(w, h) * 0.58) + 25
        // Logaritmik spiral açısı
        const spiralAngle = baseAngle + distRatio * 3.5 + (Math.random() - 0.5) * 0.4

        const typeRand = Math.random()
        const hueType =
          typeRand < 0.65 ? "mist" : typeRand < 0.88 ? "cyan" : "white"

        stormMist.push({
          armAngle: spiralAngle,
          radialDist,
          radius: (Math.random() * 38 + 18) * (0.8 + distRatio * 1.2),
          opacity: Math.random() * 0.18 + 0.08,
          speed: (0.02 + (1 - distRatio) * 0.04), // Merkeze yakın olanlar daha hızlı döner
          hueType,
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
        const INITIAL_PAUSE = 700 // ms: ilk sahnenin ve geminin izlenmesi için 0.7s bekleme
        const DURATION = 2500 // ms: toplam süre tam 3.2 saniye (0.7s + 2.5s) olacak şekilde süzülüş süresi

        if (elapsed < INITIAL_PAUSE) {
          targetProgressRef.current = 0
          progressRef.current = 0
        } else {
          const t = Math.min(1, Math.max(0, (elapsed - INITIAL_PAUSE) / DURATION))
          // Pürüzsüz cubic ease-in-out eğrisi
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
        // Delta-time sönümleme (120Hz/60Hz akıcı geçiş)
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
        onProgress(p)
      }

      const w = canvas.width
      const h = canvas.height
      const cx = w / 2
      const cy = h / 2

      ctx.clearRect(0, 0, w, h)

      // ════════════════════════════════════════════════════════════
      // 1. ZİFİRİ DERİN GECE GRADYANI (Kahverengisiz, Saf Gece Mavisi/Obsidyen)
      // ════════════════════════════════════════════════════════════
      const bgGrad = ctx.createLinearGradient(0, 0, 0, h)
      bgGrad.addColorStop(0, "#010308")
      bgGrad.addColorStop(0.45, "#030713")
      bgGrad.addColorStop(1, "#02040b")
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, w, h)

      // ════════════════════════════════════════════════════════════
      // 2. KRİSTAL YILDIZLAR (Parallax Uzay Kayması)
      // ════════════════════════════════════════════════════════════
      // Scroll %50'ye kadar yıldızlar görünür, bulutlara daldıkça sise karışır
      const starFade = Math.max(0, 1 - p * 2.2)
      if (starFade > 0) {
        for (const s of stars) {
          const twinkle =
            0.65 + 0.35 * Math.sin(globalTime * s.twinkleSpeed + s.twinklePhase)
          const currentY = (s.y - p * h * s.z * 2.0) % h
          const finalY = currentY < 0 ? currentY + h : currentY

          ctx.beginPath()
          ctx.arc(s.x, finalY, s.baseSize * twinkle, 0, Math.PI * 2)

          // Saf gümüş ve soğuk buz mavisi ışıltılar
          const alpha = s.z * twinkle * starFade
          if (s.z > 0.8) {
            ctx.fillStyle = `rgba(241, 245, 249, ${alpha})`
            ctx.shadowColor = "rgba(148, 163, 184, 0.7)"
            ctx.shadowBlur = 3
          } else {
            ctx.fillStyle = `rgba(203, 213, 225, ${alpha * 0.85})`
            ctx.shadowBlur = 0
          }
          ctx.fill()
        }
        ctx.shadowBlur = 0
      }

      // ════════════════════════════════════════════════════════════
      // 3. SAHNE 2: BULUTLAR VE SİSLER ARASINDAN GEÇİŞ (ÇİZGİSİZ, SİNEMATİK DALIŞ)
      // ════════════════════════════════════════════════════════════
      // p: 0.15 ile 0.75 arasında kamera devasa bulutların arasından süzülür
      if (p > 0.12 && p < 0.82) {
        // Bulut yoğunluğu p = 0.40 civarında zirveye çıkar
        const cloudPeak =
          p < 0.42
            ? (p - 0.12) / 0.3
            : Math.max(0, 1 - (p - 0.42) / 0.38)

        for (const c of clouds) {
          // Scroll ilerledikçe bulutlar aşağıdan yukarı ve yanlara açılarak kamerayı geçer
          const verticalOffset = (p - 0.12) * h * (1.2 + c.depth * 1.5)
          const spreadOutX = (c.xRatio - 0.5) * (p * w * 0.4) // Yanlara açılma
          const px = c.xRatio * w + spreadOutX + Math.sin(globalTime * 0.4 + c.phase) * 15
          const py = c.yRatio * h + (h * 0.5) - verticalOffset

          const currentRadius = c.baseRadius * (0.9 + (p - 0.12) * 0.8)
          const grad = ctx.createRadialGradient(
            px,
            py,
            0,
            px,
            py,
            currentRadius
          )

          const alpha = c.opacity * cloudPeak
          // Puslu gece sis rengi: Soğuk arduvaz grisi ve derin lacivert sis
          grad.addColorStop(0, `rgba(30, 41, 59, ${alpha * 0.95})`)
          grad.addColorStop(0.4, `rgba(15, 23, 42, ${alpha * 0.6})`)
          grad.addColorStop(0.8, `rgba(8, 14, 28, ${alpha * 0.25})`)
          grad.addColorStop(1, "rgba(0, 0, 0, 0)")

          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.arc(px, py, currentRadius, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // ════════════════════════════════════════════════════════════
      // 4. SAHNE 3 & 4: RUDDER DÜMENİ (GELİR, DÖNER VE LOGİN KARTINDA DURUR)
      // ════════════════════════════════════════════════════════════
      if (p > 0.45) {
        const helmFactor = Math.min(1, (p - 0.45) / 0.35) // 0 -> 1
        const helmScale = (0.3 + helmFactor * 0.8) * (w < 800 ? 0.72 : 1)
        const helmOpacity = Math.min(1, helmFactor * 1.5)

        // 🛑 KULLANICI İSTEĞİ: "login sayfası ekrana geldikten sonra dönmeye devam etmesin"
        // p >= 0.86 iken login kartı ekrana oturur ve dümenin dönüşü 0 derecede sabitlenir!
        let rotSpeed = 0
        if (p < 0.86) {
          // Giriş esnasında dönme hızı
          rotSpeed = Math.pow(helmFactor, 1.8) * 4.2
          currentHelmRotation += rotSpeed * dt
        } else {
          // Kart oturduktan sonra dönmeyi sönümle ve durdur (hareketsiz / sakin)
          const settleProgress = Math.min(1, (p - 0.86) / 0.08)
          // Yumuşakça dik konuma (0 veya en yakın spoke açısına) kilitlen
          currentHelmRotation += (0 - (currentHelmRotation % (Math.PI * 2))) * (settleProgress * 0.15)
        }

        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(currentHelmRotation)
        ctx.scale(helmScale, helmScale)
        ctx.globalAlpha = helmOpacity

        // Dümen Arkası Safir ve Gümüş Işıma Halesi (Kahverengi kaldırıldı!)
        const auraGrad = ctx.createRadialGradient(0, 0, 20, 0, 0, 250)
        auraGrad.addColorStop(0, "rgba(56, 189, 248, 0.22)")
        auraGrad.addColorStop(0.4, "rgba(148, 163, 184, 0.15)")
        auraGrad.addColorStop(1, "rgba(0, 0, 0, 0)")
        ctx.fillStyle = auraGrad
        ctx.beginPath()
        ctx.arc(0, 0, 250, 0, Math.PI * 2)
        ctx.fill()

        // Amblem Dümen Görseli
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
      // 5. SAHNE 4: GERÇEKÇİ KASIRGA / VORTEX GİRDABI (ÇUBUKSIZ!)
      // ════════════════════════════════════════════════════════════
      // Kullanıcı İsteği: "arkada dönen kasırgada çubuklar şeklinde olmasın... harbi kasırga gibi olsun... login sayfası ekrana geldikten sonra dönmeye devam etmesin"
      if (p > 0.58) {
        const vortexFactor = Math.min(1, (p - 0.58) / 0.28) // 0 -> 1

        // Kart ekrana oturduktan sonra (p >= 0.88), kasırga sakinleşir ve hafif arka plan sis aurasına dönüşür
        const isSettled = p >= 0.88
        const stormActivity = isSettled
          ? Math.max(0.12, 1 - (p - 0.88) * 7.0) // Dönüş hızı neredeyse sıfıra iner
          : 1.0

        for (const band of stormMist) {
          // Açıyı döndür (Çubuk yok! Yumuşak dönen sis dumanları)
          band.armAngle += band.speed * vortexFactor * stormActivity

          // Spiral yörünge
          const px = cx + Math.cos(band.armAngle) * band.radialDist
          const py = cy + Math.sin(band.armAngle) * (band.radialDist * 0.9) // Perspektif basıklığı

          const alpha = band.opacity * vortexFactor * (isSettled ? 0.35 : 1.0)
          if (alpha <= 0.005) continue

          const mistGrad = ctx.createRadialGradient(
            px,
            py,
            0,
            px,
            py,
            band.radius
          )

          // Soğuk gece renkleri: Puslu fırtına grisi, buz mavisi ve saf beyaz sis
          if (band.hueType === "mist") {
            mistGrad.addColorStop(0, `rgba(51, 65, 85, ${alpha * 1.1})`)
            mistGrad.addColorStop(0.5, `rgba(30, 41, 59, ${alpha * 0.6})`)
            mistGrad.addColorStop(1, "rgba(0, 0, 0, 0)")
          } else if (band.hueType === "cyan") {
            mistGrad.addColorStop(0, `rgba(56, 189, 248, ${alpha * 0.85})`)
            mistGrad.addColorStop(0.5, `rgba(14, 116, 144, ${alpha * 0.4})`)
            mistGrad.addColorStop(1, "rgba(0, 0, 0, 0)")
          } else {
            mistGrad.addColorStop(0, `rgba(226, 232, 240, ${alpha * 1.3})`)
            mistGrad.addColorStop(0.6, `rgba(148, 163, 184, ${alpha * 0.5})`)
            mistGrad.addColorStop(1, "rgba(0, 0, 0, 0)")
          }

          ctx.fillStyle = mistGrad
          ctx.beginPath()
          ctx.arc(px, py, band.radius, 0, Math.PI * 2)
          ctx.fill()
        }
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
