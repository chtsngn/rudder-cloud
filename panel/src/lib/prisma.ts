import { PrismaClient } from "@prisma/client"

/**
 * Next.js dev-mode hot-reloading re-evaluates modules on every change, which
 * would otherwise create a new PrismaClient (and a new DB connection pool) on
 * every save. Stashing the instance on `globalThis` in non-production makes
 * it survive hot reloads.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}
