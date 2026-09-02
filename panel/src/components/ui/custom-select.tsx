"use client"

import * as React from "react"
import { useState, useRef, useEffect } from "react"
import { ChevronDown, Check } from "lucide-react"
import { cn } from "@/lib/utils"

export interface SelectOption {
  value: string
  label: string
  icon?: React.ReactNode
  badge?: string
}

export interface CustomSelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
  dropdownClassName?: string
  disabled?: boolean
  size?: "sm" | "md" | "lg"
}

export function CustomSelect({
  value,
  onChange,
  options,
  placeholder = "Seçiniz...",
  className,
  dropdownClassName,
  disabled = false,
  size = "md",
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((opt) => opt.value === value)

  // Dışarı tıklandığında veya ESC basıldığında menüyü kapat
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick)
      document.addEventListener("keydown", handleKeyDown)
    }

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen])

  const sizeClasses = {
    sm: "h-8 px-2.5 text-[11px] rounded-lg",
    md: "h-10 px-3.5 text-xs rounded-xl",
    lg: "h-11 px-4 text-sm rounded-xl",
  }

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      {/* ── 1. TRIGGER BUTONU ── */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={cn(
          "w-full flex items-center justify-between gap-2.5 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-semibold text-slate-700 dark:text-slate-200 shadow-2xs transition-all cursor-pointer select-none",
          "hover:bg-slate-50/90 dark:hover:bg-slate-800 hover:border-[#c8a87c] dark:hover:border-sky-500/50 focus:outline-none focus:border-[#c8a87c] focus:ring-2 focus:ring-[#580619]/10 dark:focus:ring-sky-500/20",
          isOpen && "border-[#c8a87c] dark:border-sky-500 ring-2 ring-[#580619]/10 dark:ring-sky-500/20 bg-slate-50/50 dark:bg-slate-800/50",
          disabled && "opacity-50 cursor-not-allowed",
          sizeClasses[size],
          className
        )}
      >
        <span className="flex items-center gap-2 truncate">
          {selectedOption?.icon}
          <span>{selectedOption ? selectedOption.label : placeholder}</span>
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 text-slate-400 transition-transform duration-200 shrink-0",
            isOpen && "rotate-180 text-[#580619] dark:text-sky-400"
          )}
        />
      </button>

      {/* ── 2. LÜKS DROPDOWN MENÜSÜ ── */}
      {isOpen && (
        <div
          className={cn(
            "absolute left-0 top-full mt-1.5 z-50 min-w-[180px] max-h-64 overflow-y-auto rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.12)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.6)] animate-in fade-in-0 zoom-in-95 duration-150 scrollbar-none",
            dropdownClassName
          )}
        >
          <div className="space-y-0.5">
            {options.map((option) => {
              const isSelected = option.value === value

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value)
                    setIsOpen(false)
                  }}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left text-xs font-semibold transition-all cursor-pointer select-none",
                    isSelected
                      ? "bg-[#580619]/10 text-[#580619] dark:bg-sky-500/15 dark:text-sky-300 font-bold"
                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  <span className="flex items-center gap-2 truncate">
                    {option.icon}
                    <span>{option.label}</span>
                  </span>

                  {isSelected && (
                    <Check className="size-3.5 text-[#580619] dark:text-sky-400 shrink-0" />
                  )}
                  {!isSelected && option.badge && (
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                      {option.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}