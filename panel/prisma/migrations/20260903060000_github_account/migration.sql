-- GitHub entegrasyonu: kullanicinin baglaldigi GitHub hesabi (PAT tabanli).
-- Token AES-256-GCM ile sifrelenip `tokenEnc`'de saklanir (crypto.ts),
-- istemciye asla dondurulmez.

CREATE TABLE "GitHubAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "githubUserId" TEXT,
    "username" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "htmlUrl" TEXT,
    "tokenEnc" TEXT NOT NULL,
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "publicRepos" INTEGER NOT NULL DEFAULT 0,
    "totalPrivateRepos" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GitHubAccount_userId_key" ON "GitHubAccount"("userId");

ALTER TABLE "GitHubAccount" ADD CONSTRAINT "GitHubAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
