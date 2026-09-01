#!/usr/bin/env node
// Plain Node ESM script — run directly with `node scripts/create-admin.mjs`
// (via `npm run create-admin`), never through Next.js.
// `install.sh` bunu `cd "${PANEL_DIR}" && ... npm run create-admin` ile
// çağırıyor — Next.js'in kendi .env yükleyicisinden GEÇMİYOR, bu yüzden
// DATABASE_URL için burada açıkça dotenv gerekiyor (Prisma 7 öncesi bu,
// Prisma'nın kendi örtük .env yüklemesiyle "bedava" geliyordu).
import "dotenv/config"

import { PrismaPg } from "@prisma/adapter-pg"
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

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

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
