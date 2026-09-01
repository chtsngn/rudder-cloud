import { cn } from "@/lib/utils"

interface StatMeterProps {
  /** Omit to render a large standalone value (used on dashboard stat tiles). */
  label?: string
  value: number
  unit?: string
  className?: string
}

function severityClass(value: number) {
  if (value > 85) return "bg-destructive"
  if (value >= 60) return "bg-warning"
  return "bg-success"
}

export function StatMeter({ label, value, unit = "%", className }: StatMeterProps) {
  const pct = Math.min(100, Math.max(0, value))

  return (
    <div className={cn("space-y-2", className)}>
      {label ? (
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="font-mono text-sm font-medium text-foreground">
            {value}
            {unit}
          </span>
        </div>
      ) : (
        <div className="font-mono text-2xl font-semibold text-foreground">
          {value}
          {unit}
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", severityClass(pct))}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
