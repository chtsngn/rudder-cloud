import Link from "next/link"
import Image from "next/image"
import { cn } from "@/lib/utils"

interface RudderLogoProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl"
  showText?: boolean
  subtitle?: string
  href?: string
  className?: string
  iconOnly?: boolean
}

const SIZE_CONFIGS = {
  xs: {
    iconSize: 22,
    textClass: "text-sm font-bold tracking-[0.14em]",
    subClass: "text-[9px] tracking-widest",
    gap: "gap-2",
  },
  sm: {
    iconSize: 30,
    textClass: "text-base font-extrabold tracking-[0.16em]",
    subClass: "text-[10px] tracking-wider",
    gap: "gap-2.5",
  },
  md: {
    iconSize: 38,
    textClass: "text-lg font-extrabold tracking-[0.18em]",
    subClass: "text-[11px] tracking-wider",
    gap: "gap-3",
  },
  lg: {
    iconSize: 52,
    textClass: "text-2xl font-black tracking-[0.2em]",
    subClass: "text-xs tracking-widest",
    gap: "gap-3.5",
  },
  xl: {
    iconSize: 76,
    textClass: "text-3xl font-black tracking-[0.22em]",
    subClass: "text-sm tracking-widest",
    gap: "gap-4",
  },
}

export function RudderLogo({
  size = "md",
  showText = true,
  subtitle,
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
        {/* Ambient Glow */}
        <div className="absolute inset-0 rounded-full bg-red-600/20 blur-md transition-opacity duration-300 group-hover:bg-red-500/35 group-hover:blur-lg" />
        
        {/* Emblem Image */}
        <Image
          src="/rudder-emblem-transparent.png"
          alt="Rudder Logo"
          width={config.iconSize * 1.5}
          height={config.iconSize * 1.5}
          className="relative z-10 object-contain drop-shadow-[0_4px_12px_rgba(220,38,38,0.4)]"
          priority
        />
      </div>

      {/* Typography Wordmark */}
      {showText && !iconOnly && (
        <div className="flex flex-col leading-none">
          <div className="flex items-baseline gap-1.5">
            <span
              className={cn(
                "font-heading uppercase font-black tracking-[0.16em] bg-gradient-to-r from-red-500 via-rose-500 to-red-400 bg-clip-text text-transparent drop-shadow-[0_2px_8px_rgba(225,29,72,0.3)]",
                config.textClass
              )}
            >
              RUDDER
            </span>
            <span className="font-heading font-medium tracking-wider text-xs text-foreground/80">
              CLOUD
            </span>
          </div>
          {subtitle && (
            <span
              className={cn(
                "font-mono uppercase font-medium text-muted-foreground/80 mt-0.5",
                config.subClass
              )}
            >
              {subtitle}
            </span>
          )}
        </div>
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
