"use client"

import React, { useEffect, useState } from "react"
import { Check } from "lucide-react"
import {
  THEME_PALETTES,
  buildThemeVars,
  getStoredPaletteId,
  setStoredPaletteId,
  applyTheme,
} from "@/lib/color-theme"
import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

export function ThemePalettePicker({ className = "" }: { className?: string }) {
  const [selected, setSelected] = useState<string>(DEFAULT_PALETTE_ID)
  const { theme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setSelected(getStoredPaletteId())
    setMounted(true)
  }, [])

  const mode = theme === "light" ? "light" : "dark"

  const pick = (id: string) => {
    if (id === selected) return
    setStoredPaletteId(id)
    applyTheme(id)
    setSelected(id)
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2.5 sm:gap-3.5", className)}>
      {THEME_PALETTES.map((p) => {
        const v = buildThemeVars(p.id, mode)
        const active = mounted ? p.id === selected : p.id === "default"

        return (
          <button
            key={p.id}
            type="button"
            onClick={() => pick(p.id)}
            aria-pressed={active}
            aria-label={`Renk teması: ${p.label}`}
            className="group flex flex-col items-center gap-2 rounded-xl transition-transform duration-150 hover:-translate-y-0.5 cursor-pointer outline-none select-none"
          >
            {/* Canlı Minyatür Önizleme Kartı */}
            <div
              className="relative h-[52px] w-[74px] sm:w-[80px] overflow-hidden rounded-xl border-2 transition-all duration-200 p-1.5 flex flex-col justify-between"
              style={{
                backgroundColor: v["--surface-0"],
                borderColor: active ? v["--accent"] : v["--border-strong"],
                boxShadow: active
                  ? `0 0 0 2px ${v["--accent"]}, 0 4px 14px ${v["--accent-subtle"]}`
                  : "none",
              }}
            >
              {/* Üst Bar */}
              <div
                className="h-2.5 w-full rounded border flex items-center px-1"
                style={{
                  backgroundColor: v["--surface-1"],
                  borderColor: v["--border"],
                }}
              >
                <div
                  className="h-1 w-5 rounded-full"
                  style={{ backgroundColor: v["--accent"] }}
                />
              </div>

              {/* Mini Kart Gövdesi */}
              <div
                className="h-5.5 w-full rounded border px-1.5 flex items-center justify-between"
                style={{
                  backgroundColor: v["--surface-2"],
                  borderColor: v["--border"],
                }}
              >
                <div className="space-y-0.5">
                  <div
                    className="h-1 w-6 rounded-full opacity-80"
                    style={{ backgroundColor: v["--text-muted"] }}
                  />
                  <div
                    className="h-0.5 w-3.5 rounded-full opacity-50"
                    style={{ backgroundColor: v["--text-muted"] }}
                  />
                </div>

                {active && (
                  <Check
                    className="size-3.5 stroke-[3] shrink-0"
                    style={{ color: v["--accent"] }}
                  />
                )}
              </div>
            </div>

            {/* Renk Ailesi İsmi */}
            <span
              className={cn(
                "text-[11.5px] transition-colors text-center truncate max-w-full",
                active
                  ? "font-bold text-foreground"
                  : "font-medium text-muted-foreground group-hover:text-foreground"
              )}
            >
              {p.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

const DEFAULT_PALETTE_ID = "default"
export default ThemePalettePicker
