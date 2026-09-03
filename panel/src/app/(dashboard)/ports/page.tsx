"use client"

import { useEffect, useState } from "react"
import { Network, RefreshCw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useTranslation } from "@/components/language-provider"

interface UsedPort {
  port: number
  protocol: "tcp"
  address: string
  process: string | null
  source: "site" | "docker" | "system"
  label: string | null
}

interface PortsResponse {
  used: UsedPort[]
  suggestions: number[]
  suggestRange: { start: number; end: number }
}

function sourceBadge(p: UsedPort) {
  if (p.source === "site") return <Badge>Site: {p.label}</Badge>
  if (p.source === "docker") return <Badge variant="secondary">Docker: {p.label}</Badge>
  return <Badge variant="outline">Sistem</Badge>
}

export default function PortsPage() {
  const { t } = useTranslation()
  const [data, setData] = useState<PortsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/system/ports", { cache: "no-store" })
      if (!res.ok) throw new Error("failed")
      setData((await res.json()) as PortsResponse)
    } catch {
      setError("Port bilgisi alınamadı.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // setTimeout ile bir sonraki makrotaşka erteleniyor: load() ilk iş olarak
    // setLoading(true) çağırıyor, bunu efekt gövdesinin senkron kısmından
    // çıkarmak "setState-in-effect" kuralını tetiklememek için gerekli
    // (bkz. sites/[id]/page.tsx'teki aynı desen).
    const timer = setTimeout(() => {
      load()
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-foreground">
            {t("ports.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("ports.subtitle")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
          {t("common.refresh")}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Network className="size-4" />
            Kullanılan Portlar
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!data ? (
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          ) : data.used.length === 0 ? (
            <p className="text-sm text-muted-foreground">Dinlenen port bulunamadı.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Port</th>
                    <th className="py-2 pr-4 font-medium">Adres</th>
                    <th className="py-2 pr-4 font-medium">Süreç</th>
                    <th className="py-2 pr-4 font-medium">Kaynak</th>
                  </tr>
                </thead>
                <tbody>
                  {data.used.map((p) => (
                    <tr key={`${p.address}:${p.port}`} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-4 font-mono text-foreground">{p.port}</td>
                      <td className="py-2 pr-4 font-mono text-muted-foreground">{p.address}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{p.process ?? "—"}</td>
                      <td className="py-2 pr-4">{sourceBadge(p)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Boş Port Önerileri
            {data && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ({data.suggestRange.start}–{data.suggestRange.end} aralığında)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!data ? (
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          ) : data.suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Bu aralıkta boş port bulunamadı.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.suggestions.map((p) => (
                <Badge key={p} variant="outline" className="font-mono">
                  {p}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
