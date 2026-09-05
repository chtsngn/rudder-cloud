"use client"

import { useMemo, useState } from "react"
import { Loader2, Search, Terminal as CommandIcon, X, CheckCircle2, ArrowRight, ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTranslation } from "@/components/language-provider"
import { cn } from "@/lib/utils"

/**
 * "Hızlı Komutlar" — Aşama I'in temeli (bkz. docs/ARCHITECTURE.md). Amaç:
 * kullanıcının niyetini (ör. "abc.example.com adında 7000 portunda bir
 * reverse-proxy oluştur") ileride bir AI katmanının (MCP-tarzı, niyet ->
 * peş peşe araç çağrısı) çalıştırabileceği KÜÇÜK, KENDİ KENDİNE YETEN
 * eylemlere ayırmak. Bu yüzden her komut burada zaten gerçek API'yi
 * çağıran bağımsız bir `run()` fonksiyonu — bir AI dispatcher'ı ileride bu
 * fonksiyonları DOĞRUDAN çağırabilir, UI'ı yeniden yazmaya gerek kalmaz.
 * Şimdilik yalnızca TEK gerçek komut var (ters proxy oluşturma); yeni
 * komutlar bu diziye eklenerek büyütülür.
 */
interface QuickCommandField {
  id: string
  label: string
  placeholder?: string
  type?: "text" | "number"
  defaultValue?: string
}

interface QuickCommandResult {
  ok: boolean
  message: string
  href?: string
}

interface QuickCommand {
  id: string
  label: string
  description: string
  fields: QuickCommandField[]
  run: (values: Record<string, string>) => Promise<QuickCommandResult>
}

const QUICK_COMMANDS: QuickCommand[] = [
  {
    id: "create-reverse-proxy",
    label: "Ters Proxy Sitesi Oluştur",
    description: "Bir alan adını, verdiğiniz porttaki yerel bir uygulamaya yönlendiren bir ters proxy sitesi kurar.",
    fields: [
      { id: "domain", label: "Alan Adı", placeholder: "abc.example.com" },
      { id: "port", label: "Port", type: "number", placeholder: "7000" },
    ],
    run: async (values) => {
      const domain = values.domain?.trim()
      const port = values.port?.trim()
      if (!domain || !port) {
        return { ok: false, message: "Alan adı ve port zorunludur." }
      }
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain,
          type: "REVERSE_PROXY",
          sslEnabled: false,
          config: { www: false, upstreamUrl: `http://127.0.0.1:${port}` },
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.id) {
        return { ok: false, message: data?.error ?? `İstek başarısız oldu (${res.status}).` }
      }
      // `POST /api/sites` provizyon (nginx/systemd) başarısız olsa bile 200
      // ve bir site kaydı döner — gerçek sonuç `status` alanında (bkz.
      // sites/new/page.tsx'in wizard'daki AYNI kontrolü). Bunu atlamak
      // "başarılı" derken aslında hiç oluşmamış bir siteyi göstermek olurdu.
      if (data.status === "FAILED") {
        const cfg = (data.config ?? {}) as Record<string, unknown>
        const provisionError = typeof cfg.provisionError === "string" ? cfg.provisionError : "Kurulum başarısız oldu."
        return { ok: false, message: `${domain}: ${provisionError}`, href: `/sites/${data.id}` }
      }
      return {
        ok: true,
        message: `${domain} oluşturuldu — 127.0.0.1:${port}'e yönlendiriliyor.`,
        href: `/sites/${data.id}`,
      }
    },
  },
]

export function QuickCommandsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { lang } = useTranslation()
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<QuickCommand | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<QuickCommandResult | null>(null)

  const filtered = useMemo(() => {
    if (!query.trim()) return QUICK_COMMANDS
    const q = query.toLowerCase()
    return QUICK_COMMANDS.filter(
      (c) => c.label.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
    )
  }, [query])

  function reset() {
    setQuery("")
    setSelected(null)
    setValues({})
    setResult(null)
    setRunning(false)
  }

  function close() {
    onOpenChange(false)
    setTimeout(reset, 150) // kapanış animasyonu bitene kadar içeriği koru
  }

  async function handleRun() {
    if (!selected) return
    setRunning(true)
    setResult(null)
    try {
      const r = await selected.run(values)
      setResult(r)
    } catch {
      setResult({ ok: false, message: lang === "en" ? "Failed to connect to server." : "Sunucuya bağlanılamadı." })
    } finally {
      setRunning(false)
    }
  }

  if (!open) return null

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-24 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-xl rounded-2xl border border-slate-700/80 dark:border-[#16223f] bg-white dark:bg-[#0f141f] text-slate-900 dark:text-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 flex flex-col">
        {/* Başlık */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-[#16223f] bg-slate-50 dark:bg-[#070b17]">
          <CommandIcon className="size-4 text-[#c8a87c] dark:text-blue-300 shrink-0" />
          <span className="text-sm font-bold">{lang === "en" ? "Quick Commands" : "Hızlı Komutlar"}</span>
          <button
            type="button"
            onClick={close}
            className="ml-auto size-7 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {!selected ? (
          <>
            {/* Arama */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-[#16223f]">
              <Search className="size-4 text-slate-400 shrink-0" />
              <input
                type="text"
                autoFocus
                placeholder={lang === "en" ? "Search a quick command..." : "Hızlı komut ara..."}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
            </div>

            {/* Komut Listesi */}
            <div className="max-h-80 overflow-y-auto p-2 space-y-1">
              {filtered.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  {lang === "en" ? "No matching quick commands. More are on the way." : "Eşleşen hızlı komut yok. Daha fazlası yolda."}
                </div>
              ) : (
                filtered.map((cmd) => (
                  <button
                    key={cmd.id}
                    type="button"
                    onClick={() => setSelected(cmd)}
                    className="w-full flex items-center justify-between gap-3 p-3 rounded-xl text-left transition-colors cursor-pointer hover:bg-slate-100 dark:hover:bg-[#101c38]"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">{cmd.label}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{cmd.description}</p>
                    </div>
                    <ArrowRight className="size-3.5 text-slate-400 shrink-0" />
                  </button>
                ))
              )}
            </div>

            <div className="border-t border-slate-100 dark:border-[#16223f] px-4 py-2.5 text-[11px] text-slate-400">
              {lang === "en"
                ? "Foundation for an AI-driven assistant — say what you want, it'll chain these commands for you. Coming later."
                : "Bir AI asistanının temeli — ne istediğinizi söylersiniz, bu komutları sizin için art arda çalıştırır. Yakında."}
            </div>
          </>
        ) : (
          <div className="p-4 space-y-4">
            <button
              type="button"
              onClick={() => {
                setSelected(null)
                setResult(null)
              }}
              className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
            >
              ← {lang === "en" ? "Back to commands" : "Komutlara dön"}
            </button>

            <div>
              <h3 className="text-sm font-bold">{selected.label}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{selected.description}</p>
            </div>

            {!result && (
              <div className="space-y-3">
                {selected.fields.map((field) => (
                  <div key={field.id} className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">{field.label}</Label>
                    <Input
                      type={field.type ?? "text"}
                      placeholder={field.placeholder}
                      defaultValue={field.defaultValue}
                      value={values[field.id] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [field.id]: e.target.value }))}
                      className="h-10 rounded-xl font-mono text-xs bg-white dark:bg-[#060a17] dark:border-[#16223f] dark:text-slate-100"
                    />
                  </div>
                ))}
                <div className="flex justify-end pt-1">
                  <Button
                    onClick={handleRun}
                    disabled={running}
                    className="bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white h-9 px-5 rounded-xl text-xs font-semibold cursor-pointer border border-[#c8a87c]/40 dark:border-[#2a4687]/60"
                  >
                    {running && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
                    {lang === "en" ? "Run" : "Çalıştır"}
                  </Button>
                </div>
              </div>
            )}

            {result && (
              <div
                className={cn(
                  "rounded-xl border p-3.5 text-xs flex items-start gap-2.5",
                  result.ok
                    ? "border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300"
                    : "border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400"
                )}
              >
                {result.ok ? (
                  <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                ) : (
                  <X className="size-4 shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p>{result.message}</p>
                  {result.href && (
                    <a
                      href={result.href}
                      onClick={close}
                      className="inline-flex items-center gap-1 mt-2 font-semibold hover:underline"
                    >
                      {lang === "en" ? "Go to site" : "Siteye git"} <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
