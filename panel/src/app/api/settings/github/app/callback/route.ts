import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import { GH_APP_STATE_COOKIE, GitHubAppError, exchangeManifestCode } from "@/lib/github-app"
import { isSuperAdmin } from "@/lib/permissions"

function redirectToSettings(request: Request, params: Record<string, string>) {
  const url = new URL("/settings", request.url)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return NextResponse.redirect(url)
}

/**
 * `GET /api/settings/github/app/callback` — GitHub'ın manifest flow'unun
 * son adımı: admin'in TARAYICISI buraya `?code=...&state=...` ile
 * yönlendirilir (bkz. src/lib/github-app.ts başlık notu — sunucudan sunucuya
 * bir webhook DEĞİL, bu yüzden dışarıdan erişilebilir bir alan adı GEREKMEZ).
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")

  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  const cookieStore = await cookies()
  const expectedState = cookieStore.get(GH_APP_STATE_COOKIE)?.value
  cookieStore.delete(GH_APP_STATE_COOKIE)

  if (!code) {
    return redirectToSettings(request, { githubApp: "error", message: "GitHub bir kod döndürmedi." })
  }
  if (!expectedState || !state || state !== expectedState) {
    return redirectToSettings(request, {
      githubApp: "error",
      message: "İstek doğrulanamadı (state uyuşmadı) — lütfen tekrar deneyin.",
    })
  }

  try {
    const app = await exchangeManifestCode(code, session.userId)
    await logAudit({
      userId: session.userId,
      action: "GITHUB_APP_CREATED",
      targetType: "GITHUB_APP",
      targetId: app.appId,
      detail: `GitHub App oluşturuldu: ${app.slug}`,
    })
    return redirectToSettings(request, { githubApp: "created" })
  } catch (error) {
    const message = error instanceof GitHubAppError ? error.message : "GitHub App oluşturulamadı."
    return redirectToSettings(request, { githubApp: "error", message })
  }
}
