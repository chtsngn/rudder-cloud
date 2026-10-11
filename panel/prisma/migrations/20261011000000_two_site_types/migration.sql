-- 2026-10-11 (v1.4.0): yalnızca iki site türü — STATIC ve REVERSE_PROXY
-- ("Uygulama"). PHP/WordPress/Node.js/Python kaldırıldı; DOCKER ayrı tür
-- değil, REVERSE_PROXY + DOCKER_COMPOSE süreç yöneticisi. SYSTEMD süreç
-- yöneticisi yalnız Node.js/Python içindi, o da kaldırıldı.

-- Kaldırılan türde site kaldıysa (beklenmiyor) migration DURMAZ: başarısız bir
-- migration Prisma'da kayıt olarak kalıp sonraki her güncellemeyi elle
-- müdahaleye kadar kilitlerdi. Satır silinmez; Uygulama'ya çevrilir, eski tür
-- `config.legacyType`'ta saklanır, süreç yönetimi kapanır (NONE). Sunucudaki
-- nginx vhost'u / PHP-FPM havuzu / systemd birimi olduğu gibi kalır — site
-- yayında kalır, panel artık onu yönetmez (detay sayfası uyarır).
UPDATE "Site"
SET "config" = "config" || jsonb_build_object('legacyType', "type"::text),
    "type" = 'REVERSE_PROXY',
    "processManager" = 'NONE'
WHERE "type"::text IN ('WORDPRESS', 'PHP', 'NODEJS', 'PYTHON');

-- DOCKER -> REVERSE_PROXY: proxy hedefi yayınlanan porttan türetilir (vhost
-- zaten `proxy_pass http://127.0.0.1:<port>`; dosyaya dokunulmaz).
UPDATE "Site"
SET "type" = 'REVERSE_PROXY',
    "config" = "config" || jsonb_build_object('upstreamUrl', 'http://127.0.0.1:' || ("config"->>'port'))
WHERE "type"::text = 'DOCKER' AND ("config"->>'port') IS NOT NULL;
UPDATE "Site" SET "type" = 'REVERSE_PROXY' WHERE "type"::text = 'DOCKER';

UPDATE "Site" SET "processManager" = 'NONE' WHERE "processManager"::text = 'SYSTEMD';

ALTER TYPE "SiteType" RENAME TO "SiteType_old";
CREATE TYPE "SiteType" AS ENUM ('STATIC', 'REVERSE_PROXY');
ALTER TABLE "Site" ALTER COLUMN "type" TYPE "SiteType" USING ("type"::text::"SiteType");
DROP TYPE "SiteType_old";

ALTER TABLE "Site" ALTER COLUMN "processManager" DROP DEFAULT;
ALTER TYPE "ProcessManager" RENAME TO "ProcessManager_old";
CREATE TYPE "ProcessManager" AS ENUM ('DOCKER_COMPOSE', 'PM2', 'CUSTOM_SCRIPT', 'NONE');
ALTER TABLE "Site" ALTER COLUMN "processManager" TYPE "ProcessManager" USING ("processManager"::text::"ProcessManager");
ALTER TABLE "Site" ALTER COLUMN "processManager" SET DEFAULT 'NONE';
DROP TYPE "ProcessManager_old";
