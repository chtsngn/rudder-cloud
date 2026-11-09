-- Site işleri (2026-11): uzun işler (deploy, pull, compose rebuild/pull/up,
-- yedek, özel betikle restart) arka plan işi olarak çalışır; durum ve son
-- 64 KB çıktı burada tutulur -- bkz. schema.prisma notu. Yalnız yeni tablo.

CREATE TABLE "SiteJob" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "action" TEXT,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "phase" TEXT,
    "actorId" TEXT,
    "actor" TEXT,
    "output" TEXT NOT NULL DEFAULT '',
    "error" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SiteJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SiteJob_siteId_createdAt_idx" ON "SiteJob"("siteId", "createdAt");

CREATE INDEX "SiteJob_status_idx" ON "SiteJob"("status");

ALTER TABLE "SiteJob" ADD CONSTRAINT "SiteJob_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
