"use client"

import Link from "next/link"
import { ArrowUpRight, ShieldCheck, Settings2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTranslation } from "@/components/language-provider"
import { STATUS_CONFIG } from "@/components/site-card"
import { cn } from "@/lib/utils"
import { SITE_TYPES, type Site } from "@/lib/mock-data"

const TH =
  "px-4 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"

export function SiteList({ sites }: { sites: Site[] }) {
  const { t } = useTranslation()

  const statusLabels: Record<Site["status"], string> = {
    active: t("sites.statusActive"),
    running: t("sites.statusRunning"),
    stopped: t("sites.statusStopped"),
    provisioning: t("sites.statusProvisioning"),
    error: t("sites.statusFailed"),
  }

  return (
    <div className="rounded-2xl border border-slate-200/90 dark:border-[#16223f] bg-white dark:bg-[#090e1f] shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse">
          <thead className="bg-slate-50/80 dark:bg-[#060a17] border-b border-slate-200/80 dark:border-[#16223f]">
            <tr>
              <th className={TH}>{t("sites.listType")}</th>
              <th className={TH}>{t("sites.listDomain")}</th>
              <th className={cn(TH, "hidden md:table-cell")}>{t("sites.listRouting")}</th>
              <th className={TH}>{t("sites.listStatus")}</th>
              <th className={cn(TH, "hidden lg:table-cell")}>{t("sites.listNginx")}</th>
              <th className={cn(TH, "text-right")}>{t("sites.listActions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#16223f]">
            {sites.map((site) => {
              const typeInfo =
                SITE_TYPES.find((ti) => ti.type === site.type) ?? {
                  label: site.type.toUpperCase(),
                  abbr: site.type.slice(0, 2).toUpperCase(),
                }
              const status = STATUS_CONFIG[site.status] ?? STATUS_CONFIG.stopped
              return (
                <tr
                  key={site.id}
                  className="group hover:bg-[#580619]/[0.03] dark:hover:bg-[#101c38]/60 transition-colors"
                >
                  {/* Tip rozeti */}
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="size-7 shrink-0 rounded-lg bg-[#580619]/5 dark:bg-[#101c38] border border-[#c8a87c]/30 dark:border-[#1e3568]/50 flex items-center justify-center text-[#580619] dark:text-blue-300 font-mono text-[10.5px] font-black group-hover:bg-[#580619] dark:group-hover:bg-[#162752] group-hover:text-white dark:group-hover:text-white transition-colors">
                        {typeInfo.abbr}
                      </div>
                      <span className="hidden sm:inline text-xs font-bold text-slate-700 dark:text-slate-200">
                        {t(`sites.types.${site.type}.label`) || typeInfo.label}
                      </span>
                    </div>
                  </td>

                  {/* Domain */}
                  <td className="px-4 py-2.5 max-w-[280px]">
                    <Link
                      href={`/sites/${site.id}`}
                      className="group/link flex items-center gap-1.5 text-sm font-bold font-mono text-slate-900 dark:text-slate-100 hover:text-[#580619] dark:hover:text-blue-300 transition-colors"
                    >
                      <span className="truncate">{site.domain}</span>
                      <ArrowUpRight className="size-3.5 text-slate-400 group-hover/link:text-[#580619] dark:group-hover/link:text-blue-300 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 transition-all shrink-0" />
                    </Link>
                  </td>

                  {/* Yönlendirme */}
                  <td className="hidden md:table-cell px-4 py-2.5 whitespace-nowrap text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                    {site.type === "proxy" ? "Nginx → app" : "Nginx"}
                  </td>

                  {/* Durum */}
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border shadow-2xs",
                        status.badge
                      )}
                    >
                      <span className={cn("size-1.5 rounded-full", status.dot)} />
                      {statusLabels[site.status] ?? status.label}
                    </span>
                  </td>

                  {/* Nginx */}
                  <td className="hidden lg:table-cell px-4 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                      <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Nginx {t("common.active")}</span>
                    </div>
                  </td>

                  {/* Yönet */}
                  <td className="px-4 py-2.5 whitespace-nowrap text-right">
                    <Button
                      asChild
                      size="sm"
                      className="h-7 px-3 rounded-lg bg-slate-50 dark:bg-[#060a17] hover:bg-[#580619] dark:hover:bg-[#162752] text-slate-700 dark:text-slate-200 hover:text-white dark:hover:text-white border border-slate-200 dark:border-[#16223f] hover:border-[#580619] dark:hover:border-[#2a4687] text-xs font-semibold shadow-2xs transition-all inline-flex items-center gap-1.5"
                    >
                      <Link href={`/sites/${site.id}`}>
                        <Settings2 className="size-3.5" />
                        {t("sites.manage")}
                      </Link>
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
