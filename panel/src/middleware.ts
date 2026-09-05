import { NextResponse, type NextRequest } from "next/server"
import { jwtVerify } from "jose"

import { getAuthSecret, SESSION_COOKIE_NAME } from "@/lib/session"

/**
 * Runs on the Edge runtime, so it can only verify the session JWT's
 * signature — it must never import Prisma or touch the database.
 */
async function hasValidSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!token) return false

  try {
    await jwtVerify(token, getAuthSecret())
    return true
  } catch {
    return false
  }
}

const PUBLIC_API_PREFIXES = ["/api/auth"]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isApiRoute = pathname.startsWith("/api/")
  const isPublicApiRoute = PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  const isLoginPage = pathname === "/login"

  const authenticated = await hasValidSession(request)

  if (isLoginPage) {
    // Already signed in — no reason to show the login form again.
    if (authenticated) {
      return NextResponse.redirect(new URL("/", request.url))
    }
    return NextResponse.next()
  }

  if (isApiRoute) {
    if (isPublicApiRoute) {
      return NextResponse.next()
    }
    if (!authenticated) {
      return NextResponse.json({ ok: false, error: "Yetkisiz erişim." }, { status: 401 })
    }
    return NextResponse.next()
  }

  // Everything else matched by `config.matcher` is a dashboard page.
  if (!authenticated) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/",
    "/sites/:path*",
    "/settings/:path*",
    "/ports/:path*",
    "/terminal/:path*",
    "/users/:path*",
    "/audit/:path*",
    "/login",
    "/api/system/:path*",
    "/api/terminal/:path*",
    "/api/sites/:path*",
    "/api/settings/:path*",
    "/api/users/:path*",
    "/api/audit/:path*",
  ],
}
