-- AlterTable: GitHub deploy key / Actions key (Aşama E) — yalnızca PUBLIC
-- alanlar (private key veritabanına asla yazılmaz, bkz. src/lib/github-keys.ts).
ALTER TABLE "Site"
  ADD COLUMN "deployKeyName" TEXT,
  ADD COLUMN "deployKeyPublicKey" TEXT,
  ADD COLUMN "deployKeyFingerprint" TEXT,
  ADD COLUMN "deployKeyCreatedAt" TIMESTAMP(3),
  ADD COLUMN "actionsKeyName" TEXT,
  ADD COLUMN "actionsKeyPublicKey" TEXT,
  ADD COLUMN "actionsKeyFingerprint" TEXT,
  ADD COLUMN "actionsKeyCreatedAt" TIMESTAMP(3);
