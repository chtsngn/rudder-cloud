"use client"

import { useEffect, useRef, useState } from "react"

export function SailingShipRoute() {
  const pathRef = useRef<SVGPathElement>(null)
  const [shipPos, setShipPos] = useState({ x: 60, y: 70, angle: 0 })

  // Ekranda kavisli, zarif bir şekilde dolaşan sonsuz deniz rotası (Kapalı Döngü)
  const routePath =
    "M 40,90 C 110,30 180,120 240,70 C 310,20 340,110 300,180 C 260,240 180,210 130,170 C 70,120 20,200 15,140 C 10,95 15,100 40,90 Z"

  useEffect(() => {
    let animFrame: number
    let distance = 0

    const update = () => {
      const path = pathRef.current
      if (path) {
        const totalLength = path.getTotalLength()
        if (totalLength > 0) {
          // Ağırbaşlı, asil seyir hızı (~28 saniye periyot)
          distance = (distance + 0.38) % totalLength

          const pt = path.getPointAtLength(distance)
          const ptAhead = path.getPointAtLength((distance + 4) % totalLength)

          // Geminin doğal rota açısı (Sert dönmemesi için yumuşatılmış eğim)
          const rawAngle =
            Math.atan2(ptAhead.y - pt.y, ptAhead.x - pt.x) * (180 / Math.PI)

          setShipPos({
            x: pt.x,
            y: pt.y,
            angle: rawAngle * 0.12,
          })
        }
      }

      animFrame = requestAnimationFrame(update)
    }

    animFrame = requestAnimationFrame(update)
    return () => cancelAnimationFrame(animFrame)
  }, [])

  return (
    <div className="relative w-[360px] sm:w-[440px] h-[280px] pointer-events-none select-none overflow-visible">
      <svg
        viewBox="0 0 360 260"
        className="w-full h-full overflow-visible pointer-events-none"
      >
        <defs>
          {/* İnce Rota Işıması */}
          <filter id="subtleGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 1. Belirgin Olmayan, Zarif Kesik Kesik Rota Çizgisi (Çok sade, kart yok) */}
        <path
          ref={pathRef}
          d={routePath}
          fill="none"
          stroke="rgba(148, 163, 184, 0.28)"
          strokeWidth="1.4"
          strokeDasharray="5 8"
          filter="url(#subtleGlow)"
        />

        {/* 2. Rota Üzerinde Dolaşan Gerçekçi 3D Yelkenli Gemi (Kullanıcı görseline uygun, kart/ikon/sayı yok) */}
        <g
          transform={`translate(${shipPos.x - 67}, ${shipPos.y - 75}) rotate(${shipPos.angle}, 67, 75)`}
          className="transition-transform duration-75 ease-out"
        >
          {/* Geminin altındaki hafif ay ışığı su yansıması */}
          <ellipse
            cx="68"
            cy="118"
            rx="52"
            ry="10"
            fill="rgba(56, 189, 248, 0.14)"
            className="animate-pulse"
          />

          {/* Gerçekçi Yelkenli Gemi Görseli (Tam uygun ölçek) */}
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
