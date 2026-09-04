import { NextResponse } from "next/server"

import { createSession, verifyCredentials } from "@/lib/auth"

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek." }, { status: 400 })
  }

  const { username, password, lang } = (body ?? {}) as {
    username?: unknown
    password?: unknown
    lang?: unknown
  }
  const usernameValue = typeof username === "string" ? username.trim() : ""
  const passwordValue = typeof password === "string" ? password : ""
  const langValue = lang === "en" || lang === "tr" ? lang : null

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

  const response = NextResponse.json({ ok: true })
  if (langValue) {
    response.cookies.set("rudder_lang", langValue, {
      path: "/",
      maxAge: 31536000,
      sameSite: "lax",
    })
  }
  return response
}
