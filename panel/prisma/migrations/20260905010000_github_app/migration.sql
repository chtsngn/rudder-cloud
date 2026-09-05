-- PAT tabanli GitHubAccount akisinin yerini gercek bir GitHub App entegrasyonu
-- alir (bkz. schema.prisma notu). Eski PAT'ler artik anlamsiz oldugu icin
-- tablo tamamen kaldirilir; onune gecen kullanicilar GitHub App'i yeniden
-- baglamalidir.

DROP TABLE IF EXISTS "GitHubAccount";

CREATE TABLE "GitHubAppConfig" (
    "id" TEXT NOT NULL DEFAULT 'panel',
    "appId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecretEnc" TEXT NOT NULL,
    "webhookSecretEnc" TEXT NOT NULL,
    "privateKeyEnc" TEXT NOT NULL,
    "htmlUrl" TEXT NOT NULL,
    "ownerLogin" TEXT NOT NULL,
    "ownerAvatarUrl" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubAppConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GitHubInstallation" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "appConfigId" TEXT NOT NULL DEFAULT 'panel',
    "accountLogin" TEXT NOT NULL,
    "accountAvatarUrl" TEXT,
    "accountType" TEXT NOT NULL,
    "repositorySelection" TEXT NOT NULL,
    "installedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubInstallation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GitHubInstallation_installationId_key" ON "GitHubInstallation"("installationId");

ALTER TABLE "GitHubInstallation" ADD CONSTRAINT "GitHubInstallation_appConfigId_fkey"
    FOREIGN KEY ("appConfigId") REFERENCES "GitHubAppConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Site" ADD COLUMN "githubInstallationId" TEXT;
ALTER TABLE "Site" ADD COLUMN "githubRepoFullName" TEXT;

ALTER TABLE "Site" ADD CONSTRAINT "Site_githubInstallationId_fkey"
    FOREIGN KEY ("githubInstallationId") REFERENCES "GitHubInstallation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
