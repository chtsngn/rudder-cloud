import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { deploySite, toDeployable } from "@/lib/deploy"
import { getWebhookSecret } from "@/lib/github-app"
import { parsePushPayload, pushMatchesSite, verifyGithubSignature } from "@/lib/github-webhook"
import { prisma } from "@/lib/prisma"

// Oturumsuz, PUBLIC uç nokta — kimlik doğrulama GitHub'ın HMAC imzası
// (X-Hub-Signature-256). middleware matcher'ında bilinçli olarak YOK.
export const runtime = "nodejs"

/**
 * `POST /api/hooks/github` — GitHub App webhook alıcısı. `push` olayında,
 * o depoya + branch'e bağlı her site için deploy hattı arka planda başlatılır.
 */
export async function POST(request: Request) {
  const rawBody = await request.text()
  const secret = await getWebhookSecret()
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook secret ayarlı değil — Ayarlar → GitHub App'ten girin." },
      { status: 403 }
    )
  }
  if (!verifyGithubSignature(rawBody, request.headers.get("x-hub-signature-256"), secret)) {
    return NextResponse.json({ error: "İmza doğrulanamadı." }, { status: 401 })
  }

  const event = request.headers.get("x-github-event") ?? ""
  if (event === "ping") {
    return NextResponse.json({ ok: true, pong: true })
  }
  if (event !== "push") {
    return NextResponse.json({ ok: true, ignored: event })
  }

  const payload = parsePushPayload(rawBody)
  if (!payload) {
    return NextResponse.json({ error: "Geçersiz JSON." }, { status: 400 })
  }

  const candidates = await prisma.site.findMany({
    where: { githubRepoFullName: { not: null }, repoUrl: { not: null } },
    include: { githubInstallation: true },
  })
  const matched = candidates.filter((site) => pushMatchesSite(payload, site))

  for (const site of matched) {
    void logAudit({
      userId: null,
      actor: "github-webhook",
      action: "SITE_DEPLOY_WEBHOOK_TRIGGERED",
      targetType: "Site",
      targetId: site.id,
      detail: `${site.domain} <- ${payload.repository?.full_name} ${payload.ref} ${payload.after?.slice(0, 7) ?? ""}`,
    })
    void deploySite(toDeployable(site), { trigger: "webhook" }).catch((error) => {
      console.error(`[github-webhook] ${site.domain}: ${error instanceof Error ? error.message : String(error)}`)
    })
  }

  return NextResponse.json({ ok: true, triggered: matched.map((s) => s.domain) }, { status: 202 })
}
