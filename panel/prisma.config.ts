import "dotenv/config"
import { defineConfig, env } from "prisma/config"

// Prisma 7: veritabanı bağlantı URL'i artık schema.prisma İÇİNDE
// tanımlanamıyor (bkz. https://pris.ly/d/config-datasource) — CLI
// (`prisma migrate`/`prisma generate`) için buradan okunuyor. Uygulamanın
// kendisi (src/lib/prisma.ts, server.mjs, scripts/create-admin.mjs) ise
// PrismaClient'a AYRICA verilen bir @prisma/adapter-pg örneği kullanıyor —
// ikisi de aynı DATABASE_URL ortam değişkenini okuyor, tek kaynak.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
})
