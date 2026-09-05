import { randomBytes } from "node:crypto"

import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { GH_APP_STATE_COOKIE, GH_APP_STATE_TTL_SECONDS, buildManifest } from "@/lib/github-app"
import { isSuperAdmin } from "@/lib/permissions"

/**
 * `POST /api/settings/github/app/begin` — GitHub'ın "manifest flow"unu
 * başlatmak için istemciye gereken her şeyi döner: manifest JSON'ı (istemci
 * bunu gizli bir `<form>` ile `https://github.com/settings/apps/new`'a POST
 * eder) ve bir CSRF `state` nonce'u — bu nonce aynı zamanda kısa ömürlü,
 * httpOnly bir çereze yazılır ki `/callback` GitHub'dan dönen `state`'in
 * gerçekten BİZİM başlattığımız istekle eşleştiğini doğrulayabilsin.
 */
export async function POST() {
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  const hdrs = await headers()
  const host = hdrs.get("host")
  if (!host) {
    return NextResponse.json({ error: "Sunucu adresi belirlenemedi." }, { status: 500 })
  }
  const proto = hdrs.get("x-forwarded-proto") || "http"
  const origin = `${proto}://${host}`

  const state = randomBytes(24).toString("hex")
  const manifest = buildManifest(origin)

  const res = NextResponse.json({ state, manifest })
  res.cookies.set(GH_APP_STATE_COOKIE, state, {
    httpOnly: true,
    secure: proto === "https",
    sameSite: "lax",
    path: "/",
    maxAge: GH_APP_STATE_TTL_SECONDS,
  })
  return res
}
