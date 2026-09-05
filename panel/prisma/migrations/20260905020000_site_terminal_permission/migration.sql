-- Aşama I: site bazlı terminal erişimi için yeni SitePermission değeri.
-- Not: ADD VALUE aynı migration icinde baska bir seyle birlikte
-- kullanilamaz (bkz. 20260904000000_docker_site_type ile ayni desen), bu
-- yuzden bu migration SADECE enum degerini ekliyor.

ALTER TYPE "SitePermission" ADD VALUE 'TERMINAL';
