import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { GitHubAppError, listAllInstalledRepositories } from "@/lib/github-app"

/**
 * `GET /api/settings/github/repos` — panele bağlı TÜM GitHub App
 * kurulumları (installations) üzerinden erişilebilen depoları döner —
 * "kullanıcının izin verdiği repolar" tam olarak bunlar, her seferinde
 * GitHub'dan TAZE sorgulanır (bkz. src/lib/github-app.ts).
 */
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }

  try {
    const repos = await listAllInstalledRepositories()
    return NextResponse.json({ repos })
  } catch (error) {
    if (error instanceof GitHubAppError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("GitHub depoları listelenemedi:", error)
    return NextResponse.json({ error: "Depolar getirilemedi." }, { status: 500 })
  }
}
