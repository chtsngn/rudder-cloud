import { randomBytes } from "node:crypto"

import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { GH_APP_STATE_COOKIE, GH_APP_STATE_TTL_SECONDS } from "@/lib/github-app"
import { isSuperAdmin } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

/**
 * `POST /api/settings/github/app/install` — admin'i GitHub'ın "App'i
 * hesabıma/organizasyonuma kur" ekranına göndermek için gereken URL'i döner.
 * O ekranda hangi repolara izin verildiği TAMAMEN GitHub tarafında,
 * kullanıcının kendisi tarafından seçilir — panel bu seçime hiç karışmaz.
 */
export async function POST() {
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  const config = await prisma.gitHubAppConfig.findUnique({ where: { id: "panel" } })
  if (!config) {
    return NextResponse.json({ error: "Önce bir GitHub App oluşturmalısınız." }, { status: 400 })
  }

  const hdrs = await headers()
  const proto = hdrs.get("x-forwarded-proto") || "http"

  const state = randomBytes(24).toString("hex")
  const installUrl = `https://github.com/apps/${encodeURIComponent(config.slug)}/installations/new?state=${state}`

  const res = NextResponse.json({ installUrl })
  res.cookies.set(GH_APP_STATE_COOKIE, state, {
    httpOnly: true,
    secure: proto === "https",
    sameSite: "lax",
    path: "/",
    maxAge: GH_APP_STATE_TTL_SECONDS,
  })
  return res
}
