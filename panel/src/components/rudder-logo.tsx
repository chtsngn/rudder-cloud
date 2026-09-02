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
  const px = { sm: 30, md: 40, lg: 60 }[size]
  const textCls = {
    sm: "text-[15px] tracking-[0.22em]",
    md: "text-[18px] tracking-[0.22em]",
    lg: "text-[28px] tracking-[0.25em]",
  }[size]

  const inner = (
    <div className={cn("flex items-center gap-2.5", iconOnly && "justify-center", className)}>
      <Image
        src="/rudder-helm-logo.png"
        alt="Rudder helm"
        width={px}
        height={px}
        className="shrink-0 object-contain"
        priority
      />
      {!iconOnly && (
        <span
          className={cn("font-heading font-bold select-none", textCls)}
          style={{
            color: "#b8956a",
            textShadow: "0 1px 4px rgba(184,149,106,0.15)",
          }}
        >
          RUDDER
        </span>
      )}
    </div>
  )

  return href ? (
    <Link href={href} className="outline-none focus-visible:ring-1 focus-visible:ring-[#b8956a]/40 rounded">
      {inner}
    </Link>
  ) : inner
}