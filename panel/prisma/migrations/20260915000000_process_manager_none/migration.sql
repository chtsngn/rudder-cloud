-- 2026-09-15 denetim düzeltmeleri: "hiç yeniden başlatma" seçeneği.
-- Not: ADD VALUE ayni migration icinde baska bir seyle birlikte kullanilamaz
-- (bkz. 20260904000000_docker_site_type ile ayni desen) — bu migration SADECE
-- enum degerini ekler; kullanimi bir sonraki migration'da.

ALTER TYPE "ProcessManager" ADD VALUE 'NONE';
