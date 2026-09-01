import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { GithubKeyError, testDeployKeyConnection } from "@/lib/github-keys"
import { canManageSite } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * `POST /api/sites/[id]/deploy-key/test` — `ssh -T git@<alias>` çalıştırır
 * (script'in 7. adımının karşılığı). GitHub başarılı kimlik doğrulamada bile
 * exit 1 döndüğü için `ok`, çıktıdaki mesaja bakılarak belirlenir — bu yüzden
 * `output` da her zaman döner ki kullanıcı ham çıktıyı görebilsin.
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
  if (!(await canManageSite(session.userId, site, "MANAGE_DEPLOY_KEYS"))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  try {
    const result = await testDeployKeyConnection(site.domain)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof GithubKeyError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("Deploy key bağlantı testi başarısız:", error)
    return NextResponse.json({ error: "Bağlantı testi başarısız oldu." }, { status: 500 })
  }
}
