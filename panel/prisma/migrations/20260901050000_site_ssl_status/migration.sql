-- Site SSL durumunu ayri takip eder: sslEnabled kullanicinin istegini,
-- sslStatus/sslLastError gercek sonucu tasir (SSL basarisiz olsa bile site
-- provisioning'i basarili sayilir, bkz. sema notu).

ALTER TABLE "Site" ADD COLUMN "sslStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Site" ADD COLUMN "sslLastError" TEXT;
