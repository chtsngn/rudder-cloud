-- Kullanıcı/rol/izin yönetimi + denetim kaydı (Aşama G — yol haritasının son aşaması).

-- 1. Yeni enum'lar.
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'MEMBER');
CREATE TYPE "SitePermission" AS ENUM ('VIEW', 'EDIT_FILES', 'RESTART', 'DELETE', 'MANAGE_BACKUPS', 'MANAGE_DEPLOY_KEYS');

-- 2. `User.role`'ü düz metin `String`'den gerçek `UserRole` enum'ına çevir.
-- Var olan tek değer her zaman 'SUPER_ADMIN' (init migration'ın DEFAULT'u) —
-- USING dönüşümü bunu enum karşılığına çevirir. DEFAULT'u da (enum tipine
-- göre) yeniden koymak gerekiyor çünkü ALTER COLUMN TYPE eskisini düşürür.
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole" USING ("role"::"UserRole");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'SUPER_ADMIN';

-- 3. Bir kullanıcının belirli bir sitede sahip olduğu izinler.
CREATE TABLE "UserSiteAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "permissions" "SitePermission"[] NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSiteAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserSiteAccess_userId_siteId_key" ON "UserSiteAccess"("userId", "siteId");

ALTER TABLE "UserSiteAccess" ADD CONSTRAINT "UserSiteAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSiteAccess" ADD CONSTRAINT "UserSiteAccess_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Hafif denetim kaydı — `username` denormalize (kullanıcı silinse bile
-- kalır, bkz. şemadaki not).
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "username" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
