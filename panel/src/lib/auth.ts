import { cookies } from "next/headers"
import { SignJWT, jwtVerify } from "jose"
import bcrypt from "bcryptjs"

import { prisma } from "@/lib/prisma"
import { getAuthSecret, SESSION_COOKIE_NAME, SESSION_DURATION_SECONDS } from "@/lib/session"

interface SessionPayload {
  userId: string
}

/**
 * Signs a session JWT for `userId` and sets it as an httpOnly cookie.
 * Must be called from a Route Handler or Server Action (Next.js disallows
 * mutating cookies from a plain Server Component render).
 */
export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({ userId } satisfies SessionPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getAuthSecret())

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  })
}

/** Reads and verifies the session cookie. Returns null if missing/invalid/expired. */
export async function getSession(): Promise<{ userId: string } | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, getAuthSecret())
    if (typeof payload.userId !== "string") return null
    return { userId: payload.userId }
  } catch {
    return null
  }
}

/** Clears the session cookie (logout). */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE_NAME)
}

/**
 * Looks up a user by username and checks the password against the stored
 * bcrypt hash. Returns the user row on success, or null on any failure
 * (unknown username or wrong password) — callers should not distinguish the
 * two, to avoid leaking which usernames exist.
 */
export async function verifyCredentials(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username } })
  if (!user) return null

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return null

  return user
}
