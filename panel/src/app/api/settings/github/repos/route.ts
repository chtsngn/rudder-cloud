import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import {
  GitHubApiError,
  getDecryptedTokenForUser,
  listGitHubUserRepos,
} from "@/lib/github-api"

/**
 * `GET /api/settings/github/repos` — Bağlı GitHub kullanıcısının depolarını döner.
 */
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }

  try {
    const token = await getDecryptedTokenForUser(session.userId)
    const repos = await listGitHubUserRepos(token)
    return NextResponse.json({ repos })
  } catch (error) {
    if (error instanceof GitHubApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("GitHub depoları listelenemedi:", error)
    return NextResponse.json({ error: "Depolar getirilemedi." }, { status: 500 })
  }
}
