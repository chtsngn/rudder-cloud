import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"

/**
 * Next.js dev-mode hot-reloading re-evaluates modules on every change, which
 * would otherwise create a new PrismaClient (and a new DB connection pool) on
 * every save. Stashing the instance on `globalThis` in non-production makes
 * it survive hot reloads.
 *
 * Prisma 7: PrismaClient artık şemadaki `datasource.url`'i okuyamıyor
 * (bkz. prisma.config.ts) — bağlantı, açıkça verilen bir
 * @prisma/adapter-pg örneği üzerinden kuruluyor.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}
