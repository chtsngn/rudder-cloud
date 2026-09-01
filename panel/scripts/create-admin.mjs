#!/usr/bin/env node
// Plain Node ESM script — run directly with `node scripts/create-admin.mjs`
// (via `npm run create-admin`), never through Next.js.
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const username = process.env.ADMIN_USERNAME
const password = process.env.ADMIN_PASSWORD

if (!username || !password) {
  console.error(
    "Hata: ADMIN_USERNAME ve ADMIN_PASSWORD ortam değişkenleri gereklidir.\n" +
      "Örnek: ADMIN_USERNAME=admin ADMIN_PASSWORD=guclu-bir-parola npm run create-admin"
  )
  process.exit(1)
}

const prisma = new PrismaClient()

try {
  const passwordHash = await bcrypt.hash(password, 12)
  // upsert so re-running with a new password is safe (rotates the hash
  // instead of failing on a unique constraint).
  const user = await prisma.user.upsert({
    where: { username },
    update: { passwordHash },
    create: { username, passwordHash, role: "SUPER_ADMIN" },
  })
  console.log(`Yönetici hesabı hazır: ${user.username} (id: ${user.id})`)
} catch (error) {
  console.error("Yönetici hesabı oluşturulamadı:", error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
