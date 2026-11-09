-- Uygulama deploy'unda derleme ve deploy komutu icin isteğe bağlı üst sınır
-- (dakika). NULL/0 = SINIRSIZ (varsayılan) -- bkz. schema.prisma notu.

ALTER TABLE "PanelSettings" ADD COLUMN "buildTimeoutMinutes" INTEGER;
