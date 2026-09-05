-- Web terminali icin isteğe bağlı, kullanıcı girdisine dayalı boşta-kalma
-- zaman aşımı. NULL/0 = SINIRSIZ (varsayılan) -- bkz. schema.prisma notu.

ALTER TABLE "PanelSettings" ADD COLUMN "terminalIdleTimeoutSeconds" INTEGER;
