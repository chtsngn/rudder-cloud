"use client"

import { useEffect, useRef, useState } from "react"

interface RippleRing {
  id: number
  x: number
  y: number
  startTime: number
  duration: number
  maxRadius: number
}

export function SailingShipRoute() {
  const pathRef = useRef<SVGPathElement>(null)
  const [ship, setShip] = useState({
    x: 140,
    y: 115,
    angle: -10,
    opacity: 1,
  })
  const [ripples, setRipples] = useState<RippleRing[]>([])
  const [now, setNow] = useState(0)
  const rippleIdRef = useRef(0)

  // 〰️ AÇIK, UZUN VE SOLA KAYDIRILMIŞ SEYİR ROTASI
  // Sağ kenara çok yakın olmaması için koordinatlar sola çekildi (Genişlik 720px, sağ sınır ~680px)
  const routePath =
    "M 30,165 C 180,95 330,215 480,130 C 580,85 640,140 700,110"

  useEffect(() => {
    let animFrame: number
    let progress = 0.1 // Rotanın ortasından, hemen görünür başlar
    let lastRippleTime = 0

    const update = (time: number) => {
      setNow(time)
      const path = pathRef.current
      if (path) {
        const totalLength = path.getTotalLength()
        if (totalLength > 0) {
          // Açık rotada ağırbaşlı ve stabilize seyir hızı (~32 saniye)
          progress += 0.00052
          if (progress > 1.06) {
            progress = -0.06 // Baştan yumuşakça yeniden başla
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

          // Giriş beklemesi yok; doğrudan 1 ile başlar, yalnızca sonda söner
          let opacity = 1
          if (progress < 0) {
            opacity = 0
          } else if (progress > 0.94) {
            opacity = Math.max(0, (1 - progress) / 0.06)
          }

          setShip({
            x: pt.x,
            y: pt.y + Math.cos(time * 0.002) * 2.5,
            angle: rawAngle * 0.12 + bobbing,
            opacity,
          })

          // 💧 SUYA DAMLA DÜŞÜNCE ÇIKAN HALKA DALGALAR (Concentric Droplet Ripples)
          // Her 300ms'de bir geminin omurgasından yeni bir eşmerkezli halka başlat
          if (opacity > 0.15 && time - lastRippleTime > 300) {
            lastRippleTime = time
            rippleIdRef.current++

            // Birincil dış halka ve biraz ardından gelen ikincil iç halka
            setRipples((prev) => [
              ...prev.slice(-14),
              {
                id: rippleIdRef.current * 2,
                x: pt.x - 5,
                y: pt.y + 40,
                startTime: time,
                duration: 1800,
                maxRadius: 60,
              },
              {
                id: rippleIdRef.current * 2 + 1,
                x: pt.x - 5,
                y: pt.y + 40,
                startTime: time + 100,
                duration: 1500,
                maxRadius: 40,
              },
            ])
          }
        }
      }

      // Süresi biten dalga halkalarını temizle
      setRipples((prev) =>
        prev.filter((r) => time - r.startTime < r.duration)
      )

      animFrame = requestAnimationFrame(update)
    }

    animFrame = requestAnimationFrame(update)
    return () => cancelAnimationFrame(animFrame)
  }, [])

  return (
    <div className="relative w-full max-w-[540px] lg:max-w-[680px] h-[280px] pointer-events-none select-none overflow-visible">
      <svg
        viewBox="0 0 740 260"
        className="w-full h-full overflow-visible pointer-events-none"
      >
        <defs>
          {/* İnce Rota Işıması */}
          <filter id="routeSoftGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 1. Kapanmayan, Sola Kaydırılmış Düz Kavisli Kesik Kesik Rota Çizgisi */}
        <path
          ref={pathRef}
          d={routePath}
          fill="none"
          stroke="rgba(148, 163, 184, 0.24)"
          strokeWidth="1.2"
          strokeDasharray="6 10"
          filter="url(#routeSoftGlow)"
        />

        {/* 2. 💧 SUYA DAMLA DÜŞÜNCE OLUŞAN GERÇEKÇİ EŞMERKEZLİ DALGA HALKALARI */}
        {ripples.map((r) => {
          const age = Math.max(0, Math.min(1, (now - r.startTime) / r.duration))
          if (age <= 0 || age >= 1) return null

          const radiusX = 6 + age * r.maxRadius
          const radiusY = radiusX * 0.28 // Su yüzeyi perspektif basıklığı
          const opacity = Math.sin(age * Math.PI) * (1 - age * 0.6) * 0.65

          return (
            <ellipse
              key={r.id}
              cx={r.x}
              cy={r.y}
              rx={radiusX}
              ry={radiusY}
              fill="none"
              stroke="rgba(186, 230, 253, 0.75)"
              strokeWidth={Math.max(0.6, 1.4 * (1 - age * 0.6))}
              opacity={opacity}
            />
          )
        })}

        {/* 3. SOYUTLAŞTIRILMIŞ VE YUMUŞATILMIŞ ASİL YELKENLİ SİLÜETİ */}
        <g
          style={{
            opacity: ship.opacity * 0.76, // Gökyüzüyle bütünleşen yarı saydam soyut doku
            filter: "drop-shadow(0 0 16px rgba(186, 230, 253, 0.22))",
          }}
          transform={`translate(${ship.x - 70}, ${ship.y - 70}) rotate(${ship.angle}, 70, 70)`}
          className="transition-opacity duration-150"
        >
          {/* Su Yüzeyinde İnce Ay Işığı Yansıması */}
          <ellipse
            cx="70"
            cy="112"
            rx="52"
            ry="8"
            fill="rgba(56, 189, 248, 0.10)"
          />

          {/* Soyutlaştırılmış Gümüş-Sis Tonlarında Yandan Görünüşlü 3D Yelkenli */}
          <image
            href="/sailing-ship-real.png"
            width="140"
            height="140"
            preserveAspectRatio="xMidYMid meet"
          />
        </g>
      </svg>
    </div>
  )
}
