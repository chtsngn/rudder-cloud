import { NextResponse } from "next/server"

import { createSession, verifyCredentials } from "@/lib/auth"

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek." }, { status: 400 })
  }

  const { username, password } = (body ?? {}) as { username?: unknown; password?: unknown }
  const usernameValue = typeof username === "string" ? username.trim() : ""
  const passwordValue = typeof password === "string" ? password : ""

  if (!usernameValue || !passwordValue) {
    return NextResponse.json(
      { ok: false, error: "Kullanıcı adı ve parola gereklidir." },
      { status: 400 }
    )
  }

  const user = await verifyCredentials(usernameValue, passwordValue)
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Kullanıcı adı veya şifre hatalı." },
      { status: 401 }
    )
  }

  await createSession(user.id)
  return NextResponse.json({ ok: true })
}
