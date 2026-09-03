"use client"

import { useEffect, useRef, useState } from "react"

interface WakeParticle {
  id: number
  x: number
  y: number
  alpha: number
  scale: number
}

export function SailingShipRoute() {
  const pathRef = useRef<SVGPathElement>(null)
  const [ship, setShip] = useState({
    x: 60,
    y: 140,
    angle: 0,
    opacity: 0,
    bobbing: 0,
    wavePhase: 0,
  })
  const [wakes, setWakes] = useState<WakeParticle[]>([])
  const wakeIdRef = useRef(0)

  // 〰️ AÇIK, UZUN VE DÜZ KAVİSLİ SEYİR ROTASI (Daire şeklinde kapanmayan, açık dalgalı hat)
  // 820px genişliğindeki geniş sahne boyunca asil bir rota
  const routePath =
    "M 10,170 C 180,95 360,225 540,135 C 660,85 750,145 840,115"

  useEffect(() => {
    let animFrame: number
    let progress = 0
    let lastWakeTime = 0

    const update = (time: number) => {
      const path = pathRef.current
      if (path) {
        const totalLength = path.getTotalLength()
        if (totalLength > 0) {
          // Açık rotada ağırbaşlı ve stabilize seyir hızı (tek yönlü ~30 saniyelik açık seyir)
          progress += 0.00055
          if (progress > 1.05) {
            progress = -0.05 // Baştan yumuşakça yeniden başla
          }

          const clampedProg = Math.max(0, Math.min(1, progress))
          const currentDist = clampedProg * totalLength
          const pt = path.getPointAtLength(currentDist)

          // Teğet açısını stabilize hesapla (titremeyi önlemek için +6px ileriye bak)
          const aheadDist = Math.min(totalLength, currentDist + 6)
          const ptAhead = path.getPointAtLength(aheadDist)
          const rawAngle =
            Math.atan2(ptAhead.y - pt.y, ptAhead.x - pt.x) * (180 / Math.PI)

          // Geminin doğal dalga salınımı (hafif beşik hareketi)
          const bobbing = Math.sin(time * 0.0022) * 2.8
          const wavePhase = (time * 0.004) % (Math.PI * 2)

          // Giriş ve çıkışlarda yumuşak sönümlenme (fade in / fade out)
          let opacity = 1
          if (progress < 0.08) {
            opacity = Math.max(0, progress / 0.08)
          } else if (progress > 0.92) {
            opacity = Math.max(0, (1 - progress) / 0.08)
          }

          setShip({
            x: pt.x,
            y: pt.y + Math.cos(time * 0.0022) * 3, // Dikey hafif su yükselip alçalması
            angle: rawAngle * 0.15 + bobbing, // Rota eğimi + dalga salınımı
            opacity,
            bobbing,
            wavePhase,
          })

          // Su köpüğü parçacıkları (Her 160ms'de bir geminin altından su izi bırak)
          if (opacity > 0.2 && time - lastWakeTime > 160) {
            lastWakeTime = time
            wakeIdRef.current++
            setWakes((prev) => [
              ...prev.slice(-12),
              {
                id: wakeIdRef.current,
                x: pt.x - 15,
                y: pt.y + 42,
                alpha: 0.5 * opacity,
                scale: 1,
              },
            ])
          }
        }
      }

      // Su köpüklerini yumuşakça genişlet ve söndür
      setWakes((prev) =>
        prev
          .map((w) => ({
            ...w,
            alpha: w.alpha - 0.012,
            scale: w.scale + 0.05,
            x: w.x - 0.2, // Gemi ilerledikçe köpük arkada kalır
          }))
          .filter((w) => w.alpha > 0.02)
      )

      animFrame = requestAnimationFrame(update)
    }

    animFrame = requestAnimationFrame(update)
    return () => cancelAnimationFrame(animFrame)
  }, [])

  return (
    <div className="relative w-full max-w-[560px] lg:max-w-[720px] h-[280px] pointer-events-none select-none overflow-visible">
      <svg
        viewBox="0 0 850 260"
        className="w-full h-full overflow-visible pointer-events-none"
      >
        <defs>
          {/* İnce Rota Işıması */}
          <filter id="routeSoftGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 1. Kapanmayan, Düz Kavisli Kesik Kesik Rota Çizgisi (İnce, zarif) */}
        <path
          ref={pathRef}
          d={routePath}
          fill="none"
          stroke="rgba(148, 163, 184, 0.22)"
          strokeWidth="1.2"
          strokeDasharray="6 10"
          filter="url(#routeSoftGlow)"
        />

        {/* 2. Geminin Arkasında Bıraktığı Su İzi Köpükleri */}
        {wakes.map((w) => (
          <ellipse
            key={w.id}
            cx={w.x}
            cy={w.y}
            rx={14 * w.scale}
            ry={3.5 * w.scale}
            fill="none"
            stroke="rgba(125, 211, 252, 0.35)"
            strokeWidth="0.8"
            opacity={w.alpha}
          />
        ))}

        {/* 3. Rota Boyunca Dalgalar İçinde Süzülen Gerçekçi Yelkenli Gemi */}
        <g
          style={{ opacity: ship.opacity }}
          transform={`translate(${ship.x - 65}, ${ship.y - 65}) rotate(${ship.angle}, 65, 65)`}
          className="transition-opacity duration-150"
        >
          {/* ── GEMİNİN ALTINDAKİ CANLI DALGALAR (Altından dalgalar ile gezme efekti) ── */}
          <g transform="translate(15, 105)">
            {/* Dalga Katmanı 1: Derin Su Köpüğü */}
            <path
              d={`M -25,4 Q 15,${Math.sin(ship.wavePhase) * 4 + 2} 55,${Math.cos(ship.wavePhase) * 3 + 3} Q 95,${Math.sin(ship.wavePhase + 1) * 4 + 2} 135,5`}
              fill="none"
              stroke="rgba(56, 189, 248, 0.45)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            {/* Dalga Katmanı 2: Pruva ve Gövde Yarma Köpüğü */}
            <path
              d={`M -15,7 Q 25,${Math.cos(ship.wavePhase * 1.3) * 3 + 6} 65,${Math.sin(ship.wavePhase * 1.3) * 4 + 5} Q 105,${Math.cos(ship.wavePhase) * 3 + 7} 125,8`}
              fill="none"
              stroke="rgba(241, 245, 249, 0.65)"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            {/* Dalga Işıltı Aurası */}
            <ellipse
              cx="55"
              cy="7"
              rx="60"
              ry="10"
              fill="rgba(56, 189, 248, 0.12)"
            />
          </g>

          {/* ── GERÇEKÇİ YELKENLİ GEMİ GÖRSELİ (Mavi Halesiz, Saydam Cutout) ── */}
          <image
            href="/sailing-ship-real.png"
            width="135"
            height="135"
            preserveAspectRatio="xMidYMid meet"
          />
        </g>
      </svg>
    </div>
  )
}
