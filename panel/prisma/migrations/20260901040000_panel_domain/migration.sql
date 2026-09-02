-- Panelin kendi alan adi + gercek SSL baglama durumu (tek satirlik singleton,
-- id her zaman 'panel').

CREATE TABLE "PanelSettings" (
    "id" TEXT NOT NULL DEFAULT 'panel',
    "domain" TEXT,
    "domainEmail" TEXT,
    "sslEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sslStatus" TEXT NOT NULL DEFAULT 'none',
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PanelSettings_pkey" PRIMARY KEY ("id")
);
