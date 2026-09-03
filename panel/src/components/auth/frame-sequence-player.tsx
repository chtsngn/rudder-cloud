"use client"

import { useEffect, useRef, useState, useCallback } from "react"

interface FrameSequencePlayerProps {
  manifestUrl?: string
  onProgress?: (progress: number) => void
}

interface FrameManifest {
  totalFrames: number
  pattern: string
  extension: string
  width?: number
  height?: number
}

export function FrameSequencePlayer({
  manifestUrl = "/frames/manifest.json",
  onProgress,
}: FrameSequencePlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imagesRef = useRef<HTMLImageElement[]>([])
  const [manifest, setManifest] = useState<FrameManifest | null>(null)
  const [loadedCount, setLoadedCount] = useState(0)
  const [isReady, setIsReady] = useState(false)

  // Hedef ve mevcut scroll ilerleme oranları
  const progressRef = useRef(0)
  const targetProgressRef = useRef(0)
  const animFrameRef = useRef<number | null>(null)
  const currentRenderedFrameRef = useRef<number>(-1)

  // ═══ 1. MANİFEST DOSYASINI YÜKLE ═══
  useEffect(() => {
    let active = true

    async function loadManifest() {
      try {
        const res = await fetch(manifestUrl, { cache: "no-store" })
        if (!res.ok) throw new Error("Manifest bulunamadı")
        const data: FrameManifest = await res.json()
        if (active && data.totalFrames > 0) {
          setManifest(data)
        }
      } catch {
        // Manifest henüz yoksa varsayılan dene
        setManifest(null)
      }
    }

    loadManifest()

    return () => {
      active = false
    }
  }, [manifestUrl])

  // ═══ 2. KANVASA KARE ÇİZİMİ (OBJECT-FIT: COVER) ═══
  const renderFrame = useCallback((frameIdx: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const imgs = imagesRef.current
    if (frameIdx < 0 || frameIdx >= imgs.length) return
    const img = imgs[frameIdx]

    // Resim henüz tam decode edilmediyse çizimi atla
    if (!img || !img.complete || img.naturalWidth === 0) return

    if (canvas.width === 0 || canvas.height === 0) {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    const cw = canvas.width
    const ch = canvas.height
    const iw = img.naturalWidth
    const ih = img.naturalHeight

    // Object-fit: cover oranı hesaplama
    const scale = Math.max(cw / iw, ch / ih)
    const nw = iw * scale
    const nh = ih * scale
    const ox = (cw - nw) / 2
    const oy = (ch - nh) / 2

    ctx.clearRect(0, 0, cw, ch)
    ctx.drawImage(img, ox, oy, nw, nh)
    currentRenderedFrameRef.current = frameIdx
  }, [])

  // ═══ 3. KARELERİ ÖN YÜKLE (PRELOAD FRAMES) ═══
  useEffect(() => {
    if (!manifest || manifest.totalFrames <= 0) return

    const total = manifest.totalFrames
    const imgs: HTMLImageElement[] = []
    let count = 0

    for (let i = 1; i <= total; i++) {
      const img = new Image()
      // format: /frames/frame_0001.jpg
      const padNum = String(i).padStart(4, "0")
      const src = manifest.pattern
        ? manifest.pattern.replace("%04d", padNum)
        : `/frames/frame_${padNum}.jpg`

      img.src = src
      img.onload = () => {
        count++
        setLoadedCount(count)
        if (i === 1) {
          // İlk kare iner inmez hemen çiz
          renderFrame(0)
          setIsReady(true)
        }
        if (count >= Math.min(total, 15)) {
          setIsReady(true)
        }
      }
      img.onerror = () => {
        count++
        setLoadedCount(count)
      }
      imgs.push(img)
    }

    imagesRef.current = imgs

    return () => {
      imgs.forEach((im) => {
        im.onload = null
        im.onerror = null
      })
    }
  }, [manifest, renderFrame])

  // ═══ 4. RESIZE DİNLEYİCİSİ ═══
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight

      if (currentRenderedFrameRef.current >= 0) {
        renderFrame(currentRenderedFrameRef.current)
      }
    }

    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [renderFrame])

  // ═══ 5. SCROLL & LERP MOTORU ═══
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

    const updateLoop = () => {
      const diff = targetProgressRef.current - progressRef.current
      if (Math.abs(diff) > 0.0003) {
        progressRef.current += diff * 0.15 // Apple tarzı pürüzsüz yaylanma
      } else {
        progressRef.current = targetProgressRef.current
      }

      const p = progressRef.current
      if (onProgress) {
        onProgress(p)
      }

      const total = imagesRef.current.length
      if (total > 0) {
        const targetFrame = Math.min(total - 1, Math.max(0, Math.round(p * (total - 1))))
        if (targetFrame !== currentRenderedFrameRef.current) {
          renderFrame(targetFrame)
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
  }, [onProgress, renderFrame])

  return (
    <div className="fixed inset-0 w-full h-full pointer-events-none z-0 overflow-hidden bg-black select-none">
      {/* Kare Dizisinin Çizildiği Ana Kanvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full object-cover transition-opacity duration-300"
      />

      {/* Hafif Sinematik Vinyet (Kenar Karartma) */}
      <div className="absolute inset-0 bg-radial-[ellipse_at_center,_rgba(0,0,0,0)_20%,_rgba(0,0,0,0.5)_75%,_rgba(0,0,0,0.85)_100%] pointer-events-none" />

      {/* Kareler henüz yoksa bilgilendirici temiz mesaj */}
      {!manifest && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-black/90">
          <div className="size-12 rounded-2xl border border-amber-500/30 bg-amber-500/10 flex items-center justify-center text-[#c8a87c] mb-3">
            <span className="font-mono text-xs font-bold">🎬</span>
          </div>
          <p className="text-sm font-semibold text-slate-200 font-heading">
            Videonuz Karelerine Ayrılmayı Bekliyor
          </p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">
            Videonuzu belirlediğinizde sistem videonuzu kare kare çıkaracak ve burası canlı 3D etkileşimli oynatıcıya dönüşecektir.
          </p>
        </div>
      )}
    </div>
  )
}
