"use client"

import { useEffect, useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  Database,
  Loader2,
  Server,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTranslation } from "@/components/language-provider"

export interface S3ConfigView {
  id: string
  label: string
  bucket: string
  region: string
  endpoint: string | null
  accessKeyId: string
  pathPrefix: string
  hasSecret?: boolean
  createdAt?: string | Date
  updatedAt?: string | Date
  sites?: Array<{ id: string; domain: string }>
  sitesCount?: number
}

interface S3ConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialConfig?: S3ConfigView | null
  onSuccess: (config: S3ConfigView) => void
}

type ProviderPreset = "aws" | "r2" | "minio" | "wasabi" | "digitalocean" | "custom"

interface PresetDetails {
  id: ProviderPreset
  name: string
  badge: string
  color: string
  defaultRegion: string
  defaultEndpoint: string
  endpointPlaceholder: string
}

const PRESETS: PresetDetails[] = [
  {
    id: "aws",
    name: "AWS (S3)",
    badge: "AWS (S3)",
    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    defaultRegion: "eu-central-1",
    defaultEndpoint: "",
    endpointPlaceholder: "Varsayilan (s3.amazonaws.com)",
  },
  {
    id: "r2",
    name: "Cloudflare R2",
    badge: "R2",
    color: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
    defaultRegion: "auto",
    defaultEndpoint: "https://<accountid>.r2.cloudflarestorage.com",
    endpointPlaceholder: "https://<accountid>.r2.cloudflarestorage.com",
  },
  {
    id: "minio",
    name: "MinIO",
    badge: "MinIO",
    color: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
    defaultRegion: "us-east-1",
    defaultEndpoint: "http://localhost:9000",
    endpointPlaceholder: "http://localhost:9000 veya https://minio.siteniz.com",
  },
  {
    id: "wasabi",
    name: "Wasabi",
    badge: "Wasabi",
    color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    defaultRegion: "eu-central-1",
    defaultEndpoint: "https://s3.eu-central-1.wasabisys.com",
    endpointPlaceholder: "https://s3.eu-central-1.wasabisys.com",
  },
  {
    id: "digitalocean",
    name: "DO Spaces",
    badge: "DO",
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    defaultRegion: "fra1",
    defaultEndpoint: "https://fra1.digitaloceanspaces.com",
    endpointPlaceholder: "https://fra1.digitaloceanspaces.com",
  },
  {
    id: "custom",
    name: "Özel (Custom)",
    badge: "Özel",
    color: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
    defaultRegion: "us-east-1",
    defaultEndpoint: "",
    endpointPlaceholder: "https://depolama.ornek.com",
  },
]

export function S3ConfigDialog({
  open,
  onOpenChange,
  initialConfig,
  onSuccess,
}: S3ConfigDialogProps) {
  const { t, lang } = useTranslation()

  const [preset, setPreset] = useState<ProviderPreset>("aws")
  const [label, setLabel] = useState("")
  const [bucket, setBucket] = useState("")
  const [region, setRegion] = useState("eu-central-1")
  const [endpoint, setEndpoint] = useState("")
  const [accessKeyId, setAccessKeyId] = useState("")
  const [secretAccessKey, setSecretAccessKey] = useState("")
  const [pathPrefix, setPathPrefix] = useState("")

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null)

  useEffect(() => {
    if (!open) {
      setTestResult(null)
      setSaveError(null)
      return
    }

    if (initialConfig) {
      setLabel(initialConfig.label)
      setBucket(initialConfig.bucket)
      setRegion(initialConfig.region)
      setEndpoint(initialConfig.endpoint || "")
      setAccessKeyId(initialConfig.accessKeyId)
      setSecretAccessKey("")
      setPathPrefix(initialConfig.pathPrefix)

      // Detect preset from endpoint
      const ep = (initialConfig.endpoint || "").toLowerCase()
      if (!ep) setPreset("aws")
      else if (ep.includes("r2.cloudflarestorage")) setPreset("r2")
      else if (ep.includes("wasabisys")) setPreset("wasabi")
      else if (ep.includes("digitaloceanspaces")) setPreset("digitalocean")
      else if (ep.includes("minio") || ep.includes(":9000")) setPreset("minio")
      else setPreset("custom")
    } else {
      setLabel("")
      setBucket("")
      setRegion("eu-central-1")
      setEndpoint("")
      setAccessKeyId("")
      setSecretAccessKey("")
      setPathPrefix("")
      setPreset("aws")
    }
    setTestResult(null)
    setSaveError(null)
  }, [open, initialConfig])

  function handlePresetSelect(selected: ProviderPreset) {
    setPreset(selected)
    const p = PRESETS.find((x) => x.id === selected)
    if (!p) return
    setRegion(p.defaultRegion)
    setEndpoint(p.defaultEndpoint)
    if (!label || PRESETS.some((pr) => pr.name === label || label.startsWith(pr.name))) {
      setLabel(p.name + " " + (lang === "tr" ? "Yedek" : "Backup"))
    }
  }

  async function handleTestConnection() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch("/api/settings/s3/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: initialConfig?.id && !secretAccessKey ? initialConfig.id : undefined,
          bucket: bucket.trim(),
          region: region.trim(),
          endpoint: endpoint.trim() || null,
          accessKeyId: accessKeyId.trim(),
          secretAccessKey: secretAccessKey.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setTestResult({
          ok: true,
          message:
            lang === "tr"
              ? `Baglanti basarili! '${data.bucket}' bucket'ina sorunsuz erisildi.`
              : `Connection successful! Connected to '${data.bucket}' bucket.`,
        })
      } else {
        setTestResult({
          ok: false,
          error: data.error || (lang === "tr" ? "Bulut depolama bağlantısı başarısız." : "Storage connection failed."),
        })
      }
    } catch {
      setTestResult({
        ok: false,
        error: lang === "tr" ? "Sunucuya bağlanılamadı." : "Failed to connect to server.",
      })
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const isEdit = Boolean(initialConfig?.id)
      const url = isEdit ? `/api/settings/s3/${initialConfig!.id}` : "/api/settings/s3"
      const method = isEdit ? "PATCH" : "POST"

      const body: Record<string, unknown> = {
        label: label.trim() || (lang === "tr" ? "Bulut Depolama" : "Cloud Storage"),
        bucket: bucket.trim(),
        region: region.trim(),
        endpoint: endpoint.trim() || null,
        accessKeyId: accessKeyId.trim(),
        pathPrefix: pathPrefix.trim(),
      }
      if (secretAccessKey.trim()) {
        body.secretAccessKey = secretAccessKey.trim()
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        setSaveError(errData.error || (lang === "tr" ? "Kaydedilemedi." : "Failed to save."))
        return
      }

      const saved = (await res.json()) as S3ConfigView
      onSuccess(saved)
      onOpenChange(false)
    } catch {
      setSaveError(lang === "tr" ? "Sunucuya baglanilamadi." : "Failed to connect to server.")
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const isEdit = Boolean(initialConfig?.id)
  const canSave = Boolean(
    bucket.trim() &&
      region.trim() &&
      accessKeyId.trim() &&
      (isEdit ? true : secretAccessKey.trim())
  )

  const activePreset = PRESETS.find((p) => p.id === preset) || PRESETS[0]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-black/60 backdrop-blur-xs animate-in fade-in-0 duration-150">
      <div className="relative w-full max-w-2xl rounded-3xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 my-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 md:p-6 border-b border-slate-100 dark:border-[#16223f] bg-slate-50/50 dark:bg-[#060a17]">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-2xl bg-[#580619]/10 dark:bg-[#101c38] text-[#580619] dark:text-blue-300 flex items-center justify-center border border-transparent dark:border-[#1e3568]/50 shadow-2xs">
              <Cloud className="size-5" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-base md:text-lg text-slate-900 dark:text-slate-100 flex items-center gap-2">
                {isEdit
                  ? lang === "tr"
                    ? "Bulut Depolama Yapılandırmasını Düzenle"
                    : "Edit Cloud Storage Configuration"
                  : lang === "tr"
                  ? "Yeni Bulut Depolama Kimlik Bilgisi"
                  : "New Cloud Storage Credential"}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {lang === "tr"
                  ? "AWS (S3), Cloudflare R2, MinIO veya uyumlu bulut depolama alanınızı tanımlayın."
                  : "Configure credentials for AWS (S3), Cloudflare R2, MinIO, or compatible cloud storage."}
              </p>
            </div>
          </div>

          <button
            onClick={() => onOpenChange(false)}
            className="size-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#16223f] transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 md:p-6 space-y-5 max-h-[calc(85vh-130px)] overflow-y-auto">
          {/* Provider Presets */}
          <div>
            <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
              {lang === "tr" ? "Bulut Depolama Saglayicisi (Sablon)" : "Cloud Storage Provider (Preset)"}
            </Label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {PRESETS.map((p) => {
                const isSelected = preset === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePresetSelect(p.id)}
                    className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                      isSelected
                        ? "border-[#c8a87c] dark:border-[#2a4687] bg-[#580619]/5 dark:bg-[#111f40] text-slate-900 dark:text-white font-bold ring-1 ring-[#c8a87c]/50 dark:ring-[#2a4687]"
                        : "border-slate-200/80 dark:border-[#16223f] bg-slate-50/40 dark:bg-[#060a17] text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#1e3568]"
                    }`}
                  >
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md border mb-1 ${p.color}`}>
                      {p.badge}
                    </span>
                    <span className="text-[11px] truncate max-w-full">{p.name}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {lang === "tr" ? "Yapilandirma Adi (Etiket)" : "Credential Name (Label)"}
              </Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={lang === "tr" ? "Orn: AWS Production Bucket" : "e.g. AWS Production Bucket"}
                className="h-10 rounded-xl text-xs bg-white dark:bg-[#090e1f] dark:border-[#16223f] dark:text-slate-100"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {lang === "tr" ? "Bucket Adi *" : "Bucket Name *"}
              </Label>
              <Input
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
                placeholder="my-backup-bucket"
                className="h-10 rounded-xl font-mono text-xs bg-white dark:bg-[#090e1f] dark:border-[#16223f] dark:text-slate-100"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {lang === "tr" ? "Bolge (Region) *" : "Region *"}
              </Label>
              <Input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="eu-central-1, auto, us-east-1"
                className="h-10 rounded-xl font-mono text-xs bg-white dark:bg-[#090e1f] dark:border-[#16223f] dark:text-slate-100"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {lang === "tr" ? "Ozel Endpoint (Opsiyonel)" : "Custom Endpoint URL (Optional)"}
                </Label>
                <span className="text-[10px] text-muted-foreground">
                  {preset === "aws" ? (lang === "tr" ? "AWS icin bos birakilabilir" : "Leave blank for AWS") : ""}
                </span>
              </div>
              <Input
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder={activePreset.endpointPlaceholder}
                className="h-10 rounded-xl font-mono text-xs bg-white dark:bg-[#090e1f] dark:border-[#16223f] dark:text-slate-100"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {lang === "tr" ? "Access Key ID *" : "Access Key ID *"}
              </Label>
              <Input
                value={accessKeyId}
                onChange={(e) => setAccessKeyId(e.target.value)}
                placeholder="AKIAIOSFODNN7EXAMPLE"
                className="h-10 rounded-xl font-mono text-xs bg-white dark:bg-[#090e1f] dark:border-[#16223f] dark:text-slate-100"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {lang === "tr" ? "Secret Access Key *" : "Secret Access Key *"}
              </Label>
              <Input
                type="password"
                value={secretAccessKey}
                onChange={(e) => setSecretAccessKey(e.target.value)}
                placeholder={isEdit ? "???????????????? (Degistirmemek icin bos birakin)" : "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"}
                className="h-10 rounded-xl font-mono text-xs bg-white dark:bg-[#090e1f] dark:border-[#16223f] dark:text-slate-100"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {lang === "tr" ? "Dizin On Eki (Path Prefix - Opsiyonel)" : "Path Prefix (Optional)"}
              </Label>
              <Input
                value={pathPrefix}
                onChange={(e) => setPathPrefix(e.target.value)}
                placeholder="rudder-backups/"
                className="h-10 rounded-xl font-mono text-xs bg-white dark:bg-[#090e1f] dark:border-[#16223f] dark:text-slate-100"
              />
            </div>
          </div>

          {/* Test Connection Result Box */}
          {testResult && (
            <div
              className={`rounded-xl p-3.5 border text-xs flex items-start gap-2.5 animate-in fade-in-0 duration-150 ${
                testResult.ok
                  ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300"
                  : "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-700 dark:text-red-400"
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="size-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 font-sans leading-relaxed">
                {testResult.ok ? testResult.message : testResult.error}
              </div>
            </div>
          )}

          {saveError && (
            <div className="rounded-xl p-3.5 border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-5 md:p-6 border-t border-slate-100 dark:border-[#16223f] bg-slate-50/50 dark:bg-[#060a17]">
          {/* Test connection button (n8n signature feature) */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTestConnection}
            disabled={testing || !bucket.trim() || !region.trim() || !accessKeyId.trim() || (!isEdit && !secretAccessKey.trim())}
            className="h-10 px-4 rounded-xl text-xs font-semibold dark:border-[#16223f] dark:text-slate-300 dark:hover:bg-[#111f40] order-2 sm:order-1"
          >
            {testing ? (
              <Loader2 className="size-3.5 mr-1.5 animate-spin text-[#c8a87c] dark:text-blue-300" />
            ) : (
              <Zap className="size-3.5 mr-1.5 text-amber-500" />
            )}
            {lang === "tr" ? "Baglantiyi Test Et" : "Test Connection"}
          </Button>

          <div className="flex items-center gap-2.5 justify-end order-1 sm:order-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-10 px-4 rounded-xl text-xs font-semibold dark:border-[#16223f] dark:text-slate-300 dark:hover:bg-[#111f40]"
            >
              {t("common.vazgec")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canSave || saving}
              onClick={handleSave}
              className="bg-[#580619] dark:bg-[#162752] hover:bg-[#720a22] dark:hover:bg-[#1e346b] text-white h-10 px-6 rounded-xl text-xs font-semibold border border-[#c8a87c]/40 dark:border-[#2a4687]/60"
            >
              {saving && <Loader2 className="size-3.5 animate-spin mr-1.5 text-inherit" />}
              {isEdit ? t("common.save") : (lang === "tr" ? "Kaydet ve Kullan" : "Save & Use")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
