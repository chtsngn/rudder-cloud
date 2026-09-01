-- CreateEnum
CREATE TYPE "SiteType" AS ENUM ('WORDPRESS', 'PHP', 'NODEJS', 'STATIC', 'PYTHON', 'REVERSE_PROXY');

-- CreateEnum
CREATE TYPE "SiteStatus" AS ENUM ('ACTIVE', 'PROVISIONING', 'STOPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProcessManager" AS ENUM ('SYSTEMD', 'DOCKER_COMPOSE', 'PM2', 'CUSTOM_SCRIPT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SUPER_ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "type" "SiteType" NOT NULL,
    "status" "SiteStatus" NOT NULL DEFAULT 'PROVISIONING',
    "sslEnabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "repoUrl" TEXT,
    "gitBranch" TEXT NOT NULL DEFAULT 'main',
    "autoPullEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoPullIntervalSeconds" INTEGER NOT NULL DEFAULT 15,
    "lastPullAt" TIMESTAMP(3),
    "lastPullOk" BOOLEAN,
    "lastPullError" TEXT,
    "processManager" "ProcessManager" NOT NULL DEFAULT 'SYSTEMD',
    "customRestartCommand" TEXT,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Site_domain_key" ON "Site"("domain");
