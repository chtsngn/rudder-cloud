import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import { GH_APP_STATE_COOKIE, fetchInstallationDetails, upsertInstallation } from "@/lib/github-app"
import { isSuperAdmin } from "@/lib/permissions"

function redirectToSettings(request: Request, params: Record<string, string>) {
  const url = new URL("/settings", request.url)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return NextResponse.redirect(url)
}

/**
 * `GET /api/settings/github/app/setup` — App'in "Setup URL"ı (bkz.
 * `buildManifest`). GitHub, kurulum (installation) tamamlandığında admin'in
 * tarayıcısını buraya `?installation_id=...&setup_action=install|update`
 * ile yönlendirir. `state`'i BEST-EFFORT doğruluyoruz (varsa eşleşmeli) —
 * zorunlu değil, çünkü asıl güvenlik `fetchInstallationDetails`'in
 * `installation_id`'yi GitHub'a KENDİ App JWT'imizle sorması: bize ait
 * OLMAYAN bir installation_id GitHub'dan 404 döner, yani sahte bir ID
 * verilse bile hiçbir şey elde edilemez.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const installationId = url.searchParams.get("installation_id")
  const setupAction = url.searchParams.get("setup_action")
  const state = url.searchParams.get("state")

  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  const cookieStore = await cookies()
  const expectedState = cookieStore.get(GH_APP_STATE_COOKIE)?.value
  cookieStore.delete(GH_APP_STATE_COOKIE)
  if (expectedState && state && expectedState !== state) {
    return redirectToSettings(request, {
      githubApp: "error",
      message: "İstek doğrulanamadı (state uyuşmadı) — lütfen tekrar deneyin.",
    })
  }

  if (!installationId) {
    return redirectToSettings(request, { githubApp: "error", message: "installation_id eksik." })
  }
  if (setupAction === "request") {
    // Organizasyon sahibi onayı bekleyen bir istek (üye, admin olmayan biri kurulum başlattı) — henüz kaydedilecek bir şey yok.
    return redirectToSettings(request, {
      githubApp: "pending",
      message: "Kurulum isteği organizasyon sahibinin onayını bekliyor.",
    })
  }

  try {
    const details = await fetchInstallationDetails(installationId)
    await upsertInstallation(details, session.userId)
    await logAudit({
      userId: session.userId,
      action: "GITHUB_APP_INSTALLED",
      targetType: "GITHUB_INSTALLATION",
      targetId: details.installationId,
      detail: `@${details.accountLogin} (${details.repositorySelection === "all" ? "tüm depolar" : "seçili depolar"})`,
    })
    return redirectToSettings(request, { githubApp: "installed", account: details.accountLogin })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kurulum tamamlanamadı."
    return redirectToSettings(request, { githubApp: "error", message })
  }
}
