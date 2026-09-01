"use client"

import { useCallback, useEffect, useState } from "react"
import { ClipboardList, Loader2, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { SuperAdminGate } from "@/components/super-admin-gate"

interface AuditLogEntry {
  id: string
  userId: string | null
  username: string
  action: string
  targetType: string | null
  targetId: string | null
  detail: string | null
  createdAt: string
}

async function parseError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  return data?.error ?? `İstek başarısız oldu (${res.status}).`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR")
}

function AuditContent() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/audit", { cache: "no-store" })
      if (!res.ok) {
        setError(await parseError(res))
        return
      }
      setLogs((await res.json()) as AuditLogEntry[])
    } catch {
      setError("Sunucuya bağlanılamadı.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      load()
    }, 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-semibold text-foreground">
            <ClipboardList className="size-5" />
            Denetim Kaydı
          </h1>
          <p className="text-sm text-muted-foreground">
            Panelde kimin ne yaptığının hafif, kronolojik kaydı (son {logs.length > 0 ? "200" : ""} kayıt).
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Yenile
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Yükleniyor...
            </div>
          ) : error ? (
            <p className="p-6 text-sm text-destructive">{error}</p>
          ) : logs.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Henüz bir denetim kaydı yok.</p>
          ) : (
            <div className="divide-y divide-border">
              {logs.map((log) => (
                <div key={log.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 p-3 text-sm">
                  <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                    {formatDate(log.createdAt)}
                  </span>
                  <span className="font-medium text-foreground">{log.username}</span>
                  <span className="text-muted-foreground">{log.action}</span>
                  {log.detail && <span className="text-muted-foreground">— {log.detail}</span>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function AuditPage() {
  return (
    <SuperAdminGate>
      <AuditContent />
    </SuperAdminGate>
  )
}
