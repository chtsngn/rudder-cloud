import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface RudderLogoProps {
  size?: "sm" | "md" | "lg"
  iconOnly?: boolean
  href?: string
  className?: string
}

export function RudderLogo({ size = "md", iconOnly = false, href = "/", className }: RudderLogoProps) {
  const iconSizes = { sm: 32, md: 42, lg: 64 }
  const textSizes = {
    sm: "text-base tracking-[0.2em]",
    md: "text-xl tracking-[0.25em]",
    lg: "text-3xl tracking-[0.3em]",
  }
  const iconPx = iconSizes[size]

  const inner = (
    <div className={cn("flex items-center gap-3", iconOnly && "justify-center", className)}>
      <Image
        src="/rudder-helm-logo.png"
        alt="Rudder helm logo"
        width={iconPx}
        height={iconPx}
        className="shrink-0 object-contain drop-shadow-[0_2px_8px_rgba(139,26,42,0.5)]"
        priority
      />
      {!iconOnly && (
        <span
          className={cn(
            "font-heading font-bold text-[#c9a96e] select-none",
            textSizes[size]
          )}
          style={{ letterSpacing: "0.2em", textShadow: "0 1px 6px rgba(201,169,110,0.25)" }}
        >
          RUDDER
        </span>
      )}
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="outline-none focus-visible:ring-2 focus-visible:ring-[#c9a96e]/50 rounded">
        {inner}
      </Link>
    )
  }
  return inner
}
