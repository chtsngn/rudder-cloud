import { NextResponse } from "next/server"

import { hashDeployHookToken, isValidDeployHookTokenFormat } from "@/lib/deploy-hook"
import { prisma } from "@/lib/prisma"
import { getJob } from "@/lib/site-jobs"

interface RouteParams {
  params: Promise<{ token: string; jobId: string }>
}

// Oturumsuz, PUBLIC uç nokta — kimlik doğrulama YALNIZCA URL'deki deploy hook
// token'ı (bkz. src/lib/deploy-hook.ts); iş o token'ın sitesine ait olmalı.
export const runtime = "nodejs"

/**
 * `GET /api/hooks/deploy/<token>/jobs/<jobId>` — hook'un döndürdüğü
 * `statusUrl`. CI, Cloudflare'in ~100 sn sınırına takılmadan deploy'u buradan
 * yoklar: `{ job, serverNow }` (`job.status`: queued | running | succeeded |
 * failed | interrupted).
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { token, jobId } = await params
  if (!isValidDeployHookTokenFormat(token)) {
    return NextResponse.json({ error: "Geçersiz token." }, { status: 404 })
  }
  const site = await prisma.site.findFirst({
    where: { deployHookTokenHash: hashDeployHookToken(token) },
    select: { id: true },
  })
  if (!site) {
    return NextResponse.json({ error: "Geçersiz token." }, { status: 404 })
  }

  const job = await getJob(site.id, jobId)
  if (!job) {
    return NextResponse.json({ error: "İş bulunamadı." }, { status: 404 })
  }
  return NextResponse.json({ job, serverNow: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } })
}
