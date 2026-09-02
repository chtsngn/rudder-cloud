import Link from "next/link"
import Image from "next/image"
import { cn } from "@/lib/utils"

interface RudderLogoProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl"
  showText?: boolean
  href?: string
  className?: string
  iconOnly?: boolean
}

const SIZE_CONFIGS = {
  xs: {
    iconSize: 28,
    textClass: "text-base font-extrabold tracking-wide",
    gap: "gap-2.5",
  },
  sm: {
    iconSize: 38,
    textClass: "text-xl font-black tracking-wide",
    gap: "gap-3",
  },
  md: {
    iconSize: 48,
    textClass: "text-2xl font-black tracking-wide",
    gap: "gap-3.5",
  },
  lg: {
    iconSize: 68,
    textClass: "text-3xl font-black tracking-wide",
    gap: "gap-4",
  },
  xl: {
    iconSize: 92,
    textClass: "text-4xl font-black tracking-wide",
    gap: "gap-4.5",
  },
  "2xl": {
    iconSize: 120,
    textClass: "text-5xl font-black tracking-wide",
    gap: "gap-5",
  },
}

export function RudderLogo({
  size = "md",
  showText = true,
  href,
  className,
  iconOnly = false,
}: RudderLogoProps) {
  const config = SIZE_CONFIGS[size]

  const content = (
    <div
      className={cn(
        "group inline-flex items-center select-none transition-all duration-200",
        config.gap,
        className
      )}
    >
      {/* 3D Ruby Emblem */}
      <div
        className="relative shrink-0 flex items-center justify-center transition-transform duration-300 group-hover:scale-105"
        style={{ width: config.iconSize, height: config.iconSize }}
      >
        {/* Ambient Ruby Glow */}
        <div className="absolute inset-0 rounded-full bg-red-600/25 blur-lg transition-opacity duration-300 group-hover:bg-red-500/40 group-hover:blur-xl" />
        
        {/* Emblem Image */}
        <Image
          src="/rudder-emblem-transparent.png"
          alt="Rudder"
          width={config.iconSize * 1.5}
          height={config.iconSize * 1.5}
          className="relative z-10 object-contain drop-shadow-[0_6px_16px_rgba(220,38,38,0.45)]"
          priority
        />
      </div>

      {/* Typography Wordmark - Only 'rudder' */}
      {showText && !iconOnly && (
        <span
          className={cn(
            "font-heading font-black leading-none bg-gradient-to-r from-red-500 via-rose-500 to-red-400 bg-clip-text text-transparent drop-shadow-[0_2px_12px_rgba(225,29,72,0.4)]",
            config.textClass
          )}
        >
          rudder
        </span>
      )}
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="inline-flex focus:outline-none">
        {content}
      </Link>
    )
  }

  return content
}
