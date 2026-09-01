import Link from "next/link"
import { Play, RotateCw, Square } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { SITE_TYPES, type Site } from "@/lib/mock-data"

const STATUS_LABEL: Record<Site["status"], string> = {
  active: "Aktif",
  running: "Çalışıyor",
  stopped: "Durduruldu",
  provisioning: "Kuruluyor",
  error: "Hata",
}

const STATUS_DOT: Record<Site["status"], string> = {
  active: "bg-success",
  running: "bg-success",
  stopped: "bg-muted-foreground",
  provisioning: "bg-warning",
  error: "bg-destructive",
}

export function SiteCard({ site }: { site: Site }) {
  const typeInfo = SITE_TYPES.find((t) => t.type === site.type)!

  return (
    <Card className="gap-4 px-5 py-5 transition-colors hover:border-ring/50">
      <Link href={`/sites/${site.id}`} className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-[11px] font-semibold text-foreground">
          {typeInfo.abbr}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm font-medium text-foreground">
            {site.domain}
          </p>
          <p className="text-xs text-muted-foreground">{typeInfo.label}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn("size-1.5 rounded-full", STATUS_DOT[site.status])} />
          {STATUS_LABEL[site.status]}
        </span>
      </Link>

      {typeInfo.managed && (
        <div className="flex items-center gap-2 border-t border-border pt-4">
          <Button size="icon" variant="outline" className="size-8" title="Başlat">
            <Play className="size-3.5" />
          </Button>
          <Button size="icon" variant="outline" className="size-8" title="Durdur">
            <Square className="size-3.5" />
          </Button>
          <Button size="icon" variant="outline" className="size-8" title="Yeniden Başlat">
            <RotateCw className="size-3.5" />
          </Button>
        </div>
      )}
    </Card>
  )
}
