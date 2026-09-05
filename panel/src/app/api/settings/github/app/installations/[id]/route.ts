import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import { GitHubAppError, uninstallFromGithub } from "@/lib/github-app"
import { isSuperAdmin } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * `DELETE /api/settings/github/app/installations/[id]` — bir kurulumu hem
 * GitHub'dan (App'in kendi installation'ını siler — gerçek bir "uninstall")
 * hem panelden kaldırır. `?force=true` yalnızca GitHub tarafı zaten elle
 * kaldırılmışsa (ör. kullanıcı App'i doğrudan GitHub'dan kaldırdıysa) yerel
 * kaydı temizlemek için — GitHub çağrısını atlar.
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  const { id } = await params
  const installation = await prisma.gitHubInstallation.findUnique({ where: { id } })
  if (!installation) {
    return NextResponse.json({ error: "Kurulum bulunamadı." }, { status: 404 })
  }

  const force = new URL(request.url).searchParams.get("force") === "true"

  if (!force) {
    try {
      await uninstallFromGithub(installation.installationId)
    } catch (error) {
      const message = error instanceof GitHubAppError ? error.message : "GitHub'dan kaldırılamadı."
      return NextResponse.json({ error: message }, { status: 502 })
    }
  }

  // Bu kuruluma bağlı sitelerin `githubInstallationId`si otomatik NULL olur
  // (bkz. Site.githubInstallation onDelete: SetNull) — repoUrl/gitBranch
  // dokunulmadan kalır, siteler eskisi gibi elle girilen adresle çalışmaya
  // devam eder.
  await prisma.gitHubInstallation.delete({ where: { id } })

  await logAudit({
    userId: session.userId,
    action: "GITHUB_APP_UNINSTALLED",
    targetType: "GITHUB_INSTALLATION",
    targetId: installation.installationId,
    detail: `@${installation.accountLogin}${force ? " (yalnızca yerel kayıt, GitHub'a dokunulmadı)" : ""}`,
  })

  return NextResponse.json({ ok: true })
}
