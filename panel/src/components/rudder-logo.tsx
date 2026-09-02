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
  const iconPx = { sm: 28, md: 38, lg: 54 }[size]
  const textStyles = {
    sm: "text-sm tracking-[0.25em]",
    md: "text-lg tracking-[0.25em]",
    lg: "text-2xl tracking-[0.3em]",
  }[size]

  const inner = (
    <div className={cn("flex items-center gap-3 select-none", iconOnly && "justify-center", className)}>
      <Image
        src="/rudder-helm-transparent.png"
        alt="Rudder Dümen Sembolü"
        width={iconPx}
        height={iconPx}
        className="shrink-0 object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)]"
        priority
      />
      {!iconOnly && (
        <span
          className={cn("font-heading font-bold uppercase", textStyles)}
          style={{
            color: "#c8a87c",
            letterSpacing: "0.22em",
            textShadow: "0 1px 2px rgba(0,0,0,0.4)",
          }}
        >
          rudder
        </span>
      )}
    </div>
  )

  return href ? (
    <Link href={href} className="outline-none focus-visible:ring-2 focus-visible:ring-[#c8a87c]/50 rounded-md transition-opacity hover:opacity-95">
      {inner}
    </Link>
  ) : inner
}