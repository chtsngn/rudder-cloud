import { NextResponse } from "next/server"

import { logAudit } from "@/lib/audit"
import { createSession, verifyCredentials } from "@/lib/auth"
import { clientIpFrom, loginBlockedFor, recordLoginFailure, recordLoginSuccess } from "@/lib/login-rate-limit"

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

  const ip = clientIpFrom(request.headers)
  const retryAfter = loginBlockedFor(ip, usernameValue)
  if (retryAfter !== null) {
    return NextResponse.json(
      { ok: false, error: `Çok fazla başarısız deneme. ${Math.ceil(retryAfter / 60)} dakika sonra tekrar deneyin.` },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    )
  }

  const user = await verifyCredentials(usernameValue, passwordValue)
  if (!user) {
    recordLoginFailure(ip, usernameValue)
    void logAudit({
      userId: null,
      actor: usernameValue.slice(0, 64),
      action: "LOGIN_FAILED",
      detail: `IP: ${ip}`,
    })
    return NextResponse.json(
      { ok: false, error: "Kullanıcı adı veya şifre hatalı." },
      { status: 401 }
    )
  }

  recordLoginSuccess(ip, usernameValue)
  await createSession(user.id)
  void logAudit({ userId: user.id, action: "LOGIN", detail: `IP: ${ip}` })

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
