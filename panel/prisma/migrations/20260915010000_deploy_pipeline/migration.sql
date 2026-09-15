-- 2026-09-15 denetim düzeltmeleri: deploy hattı + deploy hook, Actions SSH key kaldırma.

ALTER TABLE "Site" ADD COLUMN "deployCommand" TEXT;
ALTER TABLE "Site" ADD COLUMN "pm2ProcessName" TEXT;
ALTER TABLE "Site" ADD COLUMN "lastDeployAt" TIMESTAMP(3);
ALTER TABLE "Site" ADD COLUMN "lastDeployOk" BOOLEAN;
ALTER TABLE "Site" ADD COLUMN "lastDeployError" TEXT;
ALTER TABLE "Site" ADD COLUMN "lastDeployOutput" TEXT;
ALTER TABLE "Site" ADD COLUMN "deployHookTokenHash" TEXT;
ALTER TABLE "Site" ADD COLUMN "deployHookCreatedAt" TIMESTAMP(3);

-- GitHub Actions SSH key özelliği kaldırıldı (panel kullanıcısı nologin —
-- özellik hiç çalışamıyordu; yerine deploy hook geldi).
ALTER TABLE "Site" DROP COLUMN IF EXISTS "actionsKeyName";
ALTER TABLE "Site" DROP COLUMN IF EXISTS "actionsKeyPublicKey";
ALTER TABLE "Site" DROP COLUMN IF EXISTS "actionsKeyFingerprint";
ALTER TABLE "Site" DROP COLUMN IF EXISTS "actionsKeyCreatedAt";

-- Ters proxy sitelerinde eski SYSTEMD varsayılanı hiç var olmayan bir systemd
-- birimini yeniden başlatmaya çalışıyordu — NONE'a çekiliyor.
UPDATE "Site" SET "processManager" = 'NONE' WHERE "type" = 'REVERSE_PROXY' AND "processManager" = 'SYSTEMD';
