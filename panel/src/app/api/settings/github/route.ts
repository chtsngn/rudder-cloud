import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { getSession } from "@/lib/auth"
import { encryptSecret } from "@/lib/crypto"
import { GitHubApiError, verifyGitHubToken } from "@/lib/github-api"
import { prisma } from "@/lib/prisma"

/**
 * `GET /api/settings/github` — Mevcut kullanıcının bağlı GitHub hesabı durumunu döner.
 */
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }

  const account = await prisma.gitHubAccount.findUnique({
    where: { userId: session.userId },
  })

  if (!account) {
    return NextResponse.json({ connected: false, account: null })
  }

  return NextResponse.json({
    connected: true,
    account: {
      id: account.id,
      username: account.username,
      name: account.name,
      avatarUrl: account.avatarUrl,
      htmlUrl: account.htmlUrl,
      scopes: account.scopes,
      publicRepos: account.publicRepos,
      totalPrivateRepos: account.totalPrivateRepos,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    },
  })
}

/**
 * `POST /api/settings/github` — GitHub Personal Access Token (PAT) bağlar veya günceller.
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }

  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 })
  }

  const input = (body ?? {}) as Record<string, unknown>
  const token = typeof input.token === "string" ? input.token.trim() : ""

  if (!token) {
    return NextResponse.json({ error: "GitHub Personal Access Token (PAT) girilmelidir." }, { status: 400 })
  }

  try {
    // 1. GitHub API ile token'ı canlı doğrula
    const verified = await verifyGitHubToken(token)

    // 2. Token'ı AES-256-GCM ile şifrele ve veritabanına kaydet
    const encrypted = encryptSecret(token)

    const account = await prisma.gitHubAccount.upsert({
      where: { userId: session.userId },
      create: {
        userId: session.userId,
        githubUserId: String(verified.user.id),
        username: verified.user.login,
        name: verified.user.name,
        avatarUrl: verified.user.avatarUrl,
        htmlUrl: verified.user.htmlUrl,
        tokenEnc: encrypted,
        scopes: verified.scopes,
        publicRepos: verified.user.publicRepos,
        totalPrivateRepos: verified.user.totalPrivateRepos,
      },
      update: {
        githubUserId: String(verified.user.id),
        username: verified.user.login,
        name: verified.user.name,
        avatarUrl: verified.user.avatarUrl,
        htmlUrl: verified.user.htmlUrl,
        tokenEnc: encrypted,
        scopes: verified.scopes,
        publicRepos: verified.user.publicRepos,
        totalPrivateRepos: verified.user.totalPrivateRepos,
      },
    })

    // 3. Denetim günlüğüne kaydet
    await logAudit({
      userId: session.userId,
      action: "GITHUB_CONNECTED",
      targetType: "GITHUB_ACCOUNT",
      targetId: account.id,
      detail: `GitHub hesabı @${verified.user.login} başarıyla bağlandı.`,
    })

    return NextResponse.json({
      ok: true,
      account: {
        id: account.id,
        username: account.username,
        name: account.name,
        avatarUrl: account.avatarUrl,
        htmlUrl: account.htmlUrl,
        scopes: account.scopes,
        publicRepos: account.publicRepos,
        totalPrivateRepos: account.totalPrivateRepos,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      },
    })
  } catch (error) {
    if (error instanceof GitHubApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("GitHub bağlantı hatası:", error)
    return NextResponse.json({ error: "GitHub hesabı bağlanamadı." }, { status: 500 })
  }
}

/**
 * `DELETE /api/settings/github` — Bağlı GitHub hesabını kaldırır ve şifreli token'ı siler.
 */
export async function DELETE() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 })
  }

  const existing = await prisma.gitHubAccount.findUnique({
    where: { userId: session.userId },
  })

  if (!existing) {
    return NextResponse.json({ ok: true })
  }

  await prisma.gitHubAccount.delete({
    where: { userId: session.userId },
  })

  await logAudit({
    userId: session.userId,
    action: "GITHUB_DISCONNECTED",
    targetType: "GITHUB_ACCOUNT",
    targetId: existing.id,
    detail: `GitHub hesabı @${existing.username} bağlantısı kaldırıldı.`,
  })

  return NextResponse.json({ ok: true })
}
