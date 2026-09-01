-- CreateTable
CREATE TABLE "S3Config" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Varsayılan',
    "bucket" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "endpoint" TEXT,
    "accessKeyId" TEXT NOT NULL,
    "secretAccessKeyEnc" TEXT NOT NULL,
    "pathPrefix" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "S3Config_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "backupEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "backupIntervalSeconds" INTEGER NOT NULL DEFAULT 86400,
ADD COLUMN     "backupRetentionCount" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "backupUploadToS3" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "s3ConfigId" TEXT,
ADD COLUMN     "lastBackupAt" TIMESTAMP(3),
ADD COLUMN     "lastBackupOk" BOOLEAN,
ADD COLUMN     "lastBackupError" TEXT;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_s3ConfigId_fkey" FOREIGN KEY ("s3ConfigId") REFERENCES "S3Config"("id") ON DELETE SET NULL ON UPDATE CASCADE;
