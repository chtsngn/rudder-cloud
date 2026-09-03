"use client"

import { useEffect, useRef, useState } from "react"
import { Compass, Navigation } from "lucide-react"

interface WakeParticle {
  id: number
  x: number
  y: number
  alpha: number
  radius: number
}

export function SailingShipRoute() {
  const pathRef = useRef<SVGPathElement>(null)
  const [shipPos, setShipPos] = useState({ x: 40, y: 60, angle: 0 })
  const [wakes, setWakes] = useState<WakeParticle[]>([])
  const wakeIdRef = useRef(0)

  // Sonsuz ve pürüzsüz rota eğrisi (Kapalı Loop)
  const routePath =
    "M 45,65 C 105,25 155,95 200,65 C 255,30 295,85 275,135 C 250,175 175,155 130,125 C 80,95 35,160 20,115 C 10,75 20,75 45,65 Z"

  useEffect(() => {
    let animFrame: number
    let distance = 0
    let lastWakeTime = 0

    const update = (time: number) => {
      const path = pathRef.current
      if (path) {
        const totalLength = path.getTotalLength()
        if (totalLength > 0) {
          // Hız: ~24 saniyede bir tam tur (ağırbaşlı, asil seyir)
          distance = (distance + 0.45) % totalLength

          const pt = path.getPointAtLength(distance)
          const ptAhead = path.getPointAtLength((distance + 3) % totalLength)
          const angle =
            Math.atan2(ptAhead.y - pt.y, ptAhead.x - pt.x) * (180 / Math.PI)

          setShipPos({ x: pt.x, y: pt.y, angle })

          // Her 120ms'de bir geminin arkasına hafif su köpüğü / iz parçacığı bırak
          if (time - lastWakeTime > 120) {
            lastWakeTime = time
            wakeIdRef.current++
            const sternDist = (distance - 6 + totalLength) % totalLength
            const sternPt = path.getPointAtLength(sternDist)

            setWakes((prev) => [
              ...prev.slice(-14),
              {
                id: wakeIdRef.current,
                x: sternPt.x,
                y: sternPt.y,
                alpha: 0.6,
                radius: 2,
              },
            ])
          }
        }
      }

      // Parçacıkları yumuşakça söndür
      setWakes((prev) =>
        prev
          .map((w) => ({
            ...w,
            alpha: w.alpha - 0.015,
            radius: w.radius + 0.15,
          }))
          .filter((w) => w.alpha > 0.05)
      )

      animFrame = requestAnimationFrame(update)
    }

    animFrame = requestAnimationFrame(update)
    return () => cancelAnimationFrame(animFrame)
  }, [])

  return (
    <div className="w-[300px] sm:w-[330px] rounded-3xl backdrop-blur-2xl bg-slate-950/45 border border-slate-800/70 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.85)] relative overflow-hidden select-none">
      {/* ── Üst Başlık & Telemetri Rozeti ── */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5 mb-2">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-emerald-400 animate-ping" />
          <span className="text-[10px] font-mono tracking-widest text-slate-300 uppercase font-semibold">
            Seyir Rotası
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
          <Navigation className="size-3 text-sky-400 animate-pulse" />
          <span>8.6 KTS &bull; AKTİF</span>
        </div>
      </div>

      {/* ── Harita & Gemi SVG Sahnesi ── */}
      <div className="relative w-full h-[175px]">
        {/* Faint Deniz Radarı / Koordinat Ağı (Grid Lines) */}
        <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:16px_16px] opacity-25" />

        {/* Arka Plan Hafif Pus Işıması */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-36 bg-sky-950/25 blur-2xl pointer-events-none" />

        {/* Ana SVG Çizimi */}
        <svg
          viewBox="0 0 310 180"
          className="w-full h-full overflow-visible pointer-events-none"
        >
          <defs>
            {/* Rota Işıma Filtresi */}
            <filter id="routeGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            {/* Gemi Gölgesi */}
            <filter id="shipShadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.8" />
            </filter>
          </defs>

          {/* 1. Kesikli Rota Çizgisi (Nautical Track) */}
          <path
            ref={pathRef}
            d={routePath}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="1.6"
            strokeDasharray="4 5"
            strokeOpacity="0.45"
            filter="url(#routeGlow)"
          />

          {/* 2. Navigasyon İşaret Fenerleri (Waypoints) */}
          {/* Waypoint 1: Liman */}
          <g transform="translate(45, 65)">
            <circle r="4" fill="#0f172a" stroke="#94a3b8" strokeWidth="1.5" />
            <circle r="1.5" fill="#38bdf8" />
            <text x="7" y="-5" fill="#64748b" fontSize="8" fontFamily="monospace">WP-1</text>
          </g>

          {/* Waypoint 2: Açık Deniz */}
          <g transform="translate(200, 65)">
            <circle r="4" fill="#0f172a" stroke="#94a3b8" strokeWidth="1.5" />
            <circle r="1.5" fill="#38bdf8" />
            <text x="7" y="-5" fill="#64748b" fontSize="8" fontFamily="monospace">WP-2</text>
          </g>

          {/* Waypoint 3: Boğaz */}
          <g transform="translate(275, 135)">
            <circle r="4" fill="#0f172a" stroke="#94a3b8" strokeWidth="1.5" />
            <circle r="1.5" fill="#38bdf8" />
            <text x="-26" y="14" fill="#64748b" fontSize="8" fontFamily="monospace">WP-3</text>
          </g>

          {/* Waypoint 4: Korunaklı Koy */}
          <g transform="translate(130, 125)">
            <circle r="4" fill="#0f172a" stroke="#94a3b8" strokeWidth="1.5" />
            <circle r="1.5" fill="#38bdf8" />
            <text x="-24" y="-6" fill="#64748b" fontSize="8" fontFamily="monospace">WP-4</text>
          </g>

          {/* 3. Geminin Arkasındaki Su İzi Parçacıkları (Wake Ripples) */}
          {wakes.map((w) => (
            <circle
              key={w.id}
              cx={w.x}
              cy={w.y}
              r={w.radius}
              fill="none"
              stroke="#7dd3fc"
              strokeWidth="0.8"
              opacity={w.alpha}
            />
          ))}

          {/* 4. Rota Boyunca Dolaşan Asil Yelkenli Gemi */}
          <g
            transform={`translate(${shipPos.x}, ${shipPos.y}) rotate(${shipPos.angle})`}
            filter="url(#shipShadow)"
          >
            {/* Gemi Işık Halesi */}
            <circle r="14" fill="rgba(56, 189, 248, 0.12)" />

            {/* Gemi Gövdesi (Hull) */}
            <path
              d="M -11,4 L 11,4 C 14,4 16,1 17,-1 C 15,-4 12,-4 9,-4 L -9,-4 C -12,-4 -13,-1 -11,4 Z"
              fill="#cbd5e1"
              stroke="#475569"
              strokeWidth="0.8"
            />

            {/* Ön Pruva Yelkenciği (Jib Sail) */}
            <path
              d="M 5,-5 L 14,-5 L 5,-15 Z"
              fill="#f8fafc"
              opacity="0.9"
            />

            {/* Ana Direk & Ana Yelken (Main Sail) */}
            <path
              d="M -3,-5 L 3,-5 L -1,-17 Z"
              fill="#f1f5f9"
              opacity="0.95"
            />

            {/* Arka Mizana Yelkeni (Mizzen Sail) */}
            <path
              d="M -9,-5 L -4,-5 L -7,-14 Z"
              fill="#e2e8f0"
              opacity="0.85"
            />

            {/* Pupa Feneri (Kırmızı/Altın Işıldayan Gece Feneri) */}
            <circle cx="-11" cy="-2" r="1.4" fill="#38bdf8" />
            <circle cx="15" cy="0" r="1.2" fill="#34d399" />
          </g>
        </svg>
      </div>

      {/* ── Alt Koordinat & Seyir Durumu ── */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-400">
        <span className="flex items-center gap-1 text-slate-300">
          <Compass className="size-3 text-slate-400 animate-spin-slow" />
          <span>ROT: {Math.round((shipPos.angle + 360) % 360).toString().padStart(3, "0")}°</span>
        </span>
        <span className="text-slate-500">36°58&apos;N • 28°14&apos;E</span>
      </div>
    </div>
  )
}
