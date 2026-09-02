import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { gitPullOrClone, GitError, isGitPullSupported } from "@/lib/git"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { RestartError, restartSite } from "@/lib/restart"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * `POST /api/sites/[id]/git-pull` — manuel tetikleme. Otomatik pull için
 * bkz. `src/lib/auto-pull-scheduler.ts` (aynı `gitPullOrClone`'u kullanır).
 *
 * Pull sonrası HEAD değiştiyse (yani gerçekten yeni bir commit çekildiyse)
 * `restartSite()` de tetiklenir — değişmediyse çalışan süreç gereksiz yere
 * yeniden başlatılmaz. Restart hatası pull'un kendisini başarısız saymaz;
 * ayrı bir `restartError` alanıyla döndürülür.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }

  const { id } = await params
  const site = await prisma.site.findUnique({ where: { id } })
  if (!site) {
    return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 })
  }
  if (!(await canManageSite(session.userId, site, "RESTART"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }
  if (!isGitPullSupported(site.type)) {
    return NextResponse.json(
      {
        error:
          "Bu site türü için git pull desteklenmiyor (yalnızca Node.js/Python/Ters Proxy).",
      },
      { status: 400 }
    )
  }
  if (!site.repoUrl) {
    return NextResponse.json({ error: "Bu site için repo adresi tanımlı değil." }, { status: 400 })
  }

  try {
    const result = await gitPullOrClone({ ...site, repoUrl: site.repoUrl })
    const updated = await prisma.site.update({
      where: { id },
      data: { lastPullAt: new Date(), lastPullOk: true, lastPullError: null },
    })

    let restartError: string | null = null
    if (result.changed) {
      try {
        await restartSite(updated)
      } catch (error) {
        restartError =
          error instanceof RestartError ? error.message : "Yeniden başlatma başarısız oldu."
      }
    }

    return NextResponse.json({
      ...updated,
      pullChanged: result.changed,
      pullCommit: result.commit,
      restartError,
    })
  } catch (error) {
    const message = error instanceof GitError ? error.message : "git pull başarısız oldu."
    const updated = await prisma.site.update({
      where: { id },
      data: { lastPullAt: new Date(), lastPullOk: false, lastPullError: message },
    })
    return NextResponse.json({ error: message, site: updated }, { status: 500 })
  }
}
